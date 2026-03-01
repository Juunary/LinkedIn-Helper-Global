window.LGH = window.LGH || {};

/**
 * ListObserver — detects visible job cards in LinkedIn's job list pane and
 * fires a callback for each newly-visible card so it can be translated.
 *
 * Design:
 *  - Uses IntersectionObserver to watch only viewport-visible cards (lazy translate).
 *  - MutationObserver watches the list container for new cards (virtualised list).
 *  - Reflow (re-scanning for new cards) is debounced + rAF-scheduled; no heavy
 *    work runs inside the MutationObserver callback itself.
 *  - Tracks requestedIds to avoid duplicate translation requests.
 *  - Uses feature-based selector fallbacks to survive LinkedIn DOM changes.
 *
 * Public API:
 *   start(onCardVisible)     — onCardVisible(jobId, payload) called per new visible card
 *   stop()
 *   clearRequestedIds()      — reset on route change so new search re-translates all
 */
window.LGH.ListObserver = (function () {
  let _intersectionObs   = null;
  let _mutationObs       = null;
  let _container         = null;
  let _active            = false;
  let _onCardVisible     = null;
  let _onContainerReady  = null;   // called once when scroll container is first found
  let _onCardHover       = null;   // called on mouseenter/leave of a LinkedIn card
  let _attachRetries     = 0;
  const MAX_RETRIES      = 15;

  // Elements already handed to IntersectionObserver
  const _observedEls = new WeakSet();

  // Elements that already have hover listeners attached
  const _hoverAttachedEls = new WeakSet();

  // jobIds for which a translation has already been requested
  const _requestedIds = new Set();

  // ── Selectors (tried in priority order) ────────────────────────────────────

  // ── Scroll-container selectors (for ListScrollSync) ──────────────────────

  const SCROLL_CONTAINER_SELECTORS = [
    '.scaffold-layout__list',
    '.scaffold-layout__list-container',
    '.jobs-search-results-list',
    '.jobs-search__results-list',
    '[class*="scaffold-layout__list"]',
  ];

  function findScrollContainer() {
    for (const sel of SCROLL_CONTAINER_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el && el.scrollHeight > el.clientHeight + 10) return el;
      } catch (_) {}
    }
    // Fallback: container itself or its closest scrollable ancestor
    let node = _container;
    while (node && node !== document.documentElement) {
      if (node.scrollHeight > node.clientHeight + 50 && node.clientHeight > 100) return node;
      node = node.parentElement;
    }
    return _container || null;
  }

  const LIST_CONTAINER_SELECTORS = [
    '.jobs-search-results-list',
    '.scaffold-layout__list-container',
    '[data-view-name="search-results-list"]',
    '.jobs-search__results-list',
    'ul.jobs-search-results__list',
    '.jobs-search-two-pane__wrapper .scaffold-layout__list',
  ];

  const CARD_SELECTORS = [
    'li[data-occludable-job-id]',
    'li[data-job-id]',
    '.jobs-search-results__list-item',
    'li.scaffold-layout__list-item',
    'li[class*="jobs-search"]',
  ];

  // ── Container discovery ────────────────────────────────────────────────────

  function _findContainer() {
    for (const sel of LIST_CONTAINER_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (_) {}
    }
    // Heuristic: a UL/div containing at least 2 job-view links
    const candidates = document.querySelectorAll('ul, div[class*="results"]');
    for (const el of candidates) {
      if (el.querySelectorAll('a[href*="/jobs/view/"]').length >= 2) return el;
    }
    return null;
  }

  function _findCards(container) {
    for (const sel of CARD_SELECTORS) {
      try {
        const cards = container.querySelectorAll(sel);
        if (cards.length > 0) return Array.from(cards);
      } catch (_) {}
    }
    // Heuristic fallback: any LI with a job-view link
    return Array.from(container.querySelectorAll('li')).filter(li =>
      li.querySelector('a[href*="/jobs/view/"]') !== null
    );
  }

  // ── IntersectionObserver ───────────────────────────────────────────────────

  function _observeCard(cardEl) {
    if (_observedEls.has(cardEl)) return;
    _observedEls.add(cardEl);
    if (_intersectionObs) _intersectionObs.observe(cardEl);
  }

  /**
   * Attach hover listeners to a LinkedIn card element (idempotent).
   * Re-extracts jobId at event time so recycled DOM elements work correctly.
   */
  function _attachHoverListeners(cardEl) {
    if (!_onCardHover || _hoverAttachedEls.has(cardEl)) return;
    _hoverAttachedEls.add(cardEl);
    cardEl.addEventListener('mouseenter', () => {
      if (!_onCardHover) return;
      const currentId = window.LGH.jobIdUtils.extractFromCard(cardEl);
      if (currentId) _onCardHover(currentId, true);
    }, { passive: true });
    cardEl.addEventListener('mouseleave', () => {
      if (!_onCardHover) return;
      const currentId = window.LGH.jobIdUtils.extractFromCard(cardEl);
      if (currentId) _onCardHover(currentId, false);
    }, { passive: true });
  }

  /**
   * Try to request translation for a card. Returns true if successfully dispatched.
   * Attaches hover listeners as a side-effect.
   *
   * NOTE: _requestedIds.add() is intentionally called AFTER payload extraction.
   * If extraction fails (LinkedIn hasn't populated the card yet), jobId is NOT
   * locked — so the next reflow triggered by MutationObserver will retry.
   */
  function _tryDispatch(cardEl) {
    const jobId = window.LGH.jobIdUtils.extractFromCard(cardEl);
    if (!jobId || _requestedIds.has(jobId)) return false;

    _attachHoverListeners(cardEl);

    const payload = window.LGH.extractListCard(cardEl);
    if (!payload || !payload.raw) return false; // card not yet populated — retry later

    _requestedIds.add(jobId);
    if (_onCardVisible) _onCardVisible(jobId, payload, cardEl);
    return true;
  }

  function _onIntersection(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      _tryDispatch(entry.target);
    }
  }

  // ── Reflow (scheduled from MutationObserver) ───────────────────────────────

  function _reflow() {
    if (!_active || !_container) return;
    const cards = _findCards(_container);

    for (const cardEl of cards) {
      _observeCard(cardEl); // register with IntersectionObserver (idempotent)

      // Also directly check cards already in the viewport that haven't been
      // dispatched yet. This catches LinkedIn's lazy content: the element enters
      // the viewport before LinkedIn fills its inner HTML, so _onIntersection
      // skips it (empty raw text). When LinkedIn later injects content the
      // MutationObserver fires → _scheduleReflow → here → retry succeeds.
      const jobId = window.LGH.jobIdUtils.extractFromCard(cardEl);
      if (!jobId || _requestedIds.has(jobId)) continue;

      const rect = cardEl.getBoundingClientRect();
      const inView = rect.top < window.innerHeight + 100 && rect.bottom > -100;
      if (inView) _tryDispatch(cardEl);
    }
  }

  const _scheduleReflow = window.LGH.debounce(
    () => requestAnimationFrame(_reflow),
    120
  );

  // ── MutationObserver ───────────────────────────────────────────────────────

  function _setupMutationObs(container) {
    if (_mutationObs) { _mutationObs.disconnect(); _mutationObs = null; }
    _mutationObs = new MutationObserver(() => {
      // Heavy work forbidden here — only schedule
      _scheduleReflow();
    });
    _mutationObs.observe(container, { childList: true, subtree: true });
  }

  // ── Attach (with retry) ────────────────────────────────────────────────────

  function _tryAttach() {
    _container = _findContainer();

    if (!_container) {
      _attachRetries++;
      if (_attachRetries < MAX_RETRIES) {
        setTimeout(() => { if (_active) _tryAttach(); }, 600);
      } else {
        console.warn('[LGH] ListObserver: could not find job list container after', MAX_RETRIES, 'retries');
      }
      return;
    }

    _attachRetries = 0;
    _reflow();
    _setupMutationObs(_container);

    // Notify caller so it can attach ListScrollSync
    if (_onContainerReady) {
      const scrollEl = findScrollContainer();
      _onContainerReady(scrollEl);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * @param {function} onCardVisible       — called per visible card
   * @param {function} [onContainerReady]  — called once with scrollEl when container found
   * @param {function} [onCardHover]       — called with (jobId, isEntering) on hover
   */
  function start(onCardVisible, onContainerReady, onCardHover) {
    if (_active) stop();

    _onCardVisible    = onCardVisible;
    _onContainerReady = onContainerReady || null;
    _onCardHover      = onCardHover      || null;
    _active           = true;
    _attachRetries    = 0;

    _intersectionObs = new IntersectionObserver(_onIntersection, {
      threshold: 0.1,
      rootMargin: '100px 0px',
    });

    _tryAttach();
  }

  function stop() {
    _active = false;
    if (_intersectionObs) { _intersectionObs.disconnect(); _intersectionObs = null; }
    if (_mutationObs)     { _mutationObs.disconnect();     _mutationObs = null; }
    _container        = null;
    _onCardVisible    = null;
    _onContainerReady = null;
    _onCardHover      = null;
    _requestedIds.clear();
    // Note: WeakSets (_observedEls, _hoverAttachedEls) clear automatically as elements are GC'd
  }

  function clearRequestedIds() {
    _requestedIds.clear();
    // Re-run reflow so the newly cleared IDs get re-observed
    if (_active) _scheduleReflow();
  }

  return { start, stop, clearRequestedIds, findScrollContainer };
})();
