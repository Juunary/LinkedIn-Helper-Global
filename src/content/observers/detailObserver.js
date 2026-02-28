window.LGH = window.LGH || {};

/**
 * DetailObserver — detects when LinkedIn's job detail pane changes content
 * (i.e., the user clicked a different job) and fires a callback.
 *
 * Design:
 *  - Finds the detail container using feature-based selectors + structural heuristic.
 *  - Never permanently gives up: after fast retries → switches to slow keep-alive polling.
 *  - MutationObserver watches for content changes; actual work is debounced + rAF.
 *  - Tracks the last seen jobId to avoid duplicate callbacks for the same job.
 *  - Handles both URL layouts:
 *      /jobs/view/<id>/        (detail page)
 *      /jobs/search/?currentJobId=<id>  (two-pane search)
 *
 * Public API:
 *   start(onDetailChange)    — onDetailChange(jobId, blocks, scrollEl) per job change
 *   stop()
 *   resetLastJobId()         — force re-fire on next mutation (used after route change)
 *   findScrollContainer()    — returns the scrollable detail element (or null)
 */
window.LGH.DetailObserver = (function () {
  let _mutationObs     = null;
  let _container       = null;
  let _active          = false;
  let _lastJobId       = null;
  let _onDetailChange  = null;
  let _attachRetries   = 0;
  let _keepAliveTimer  = null;

  // Fast retry phase: every 600 ms for up to FAST_RETRIES attempts
  const FAST_RETRIES      = 20;
  const FAST_INTERVAL_MS  = 600;
  // Slow keep-alive phase: retry every 2 s indefinitely until stop() is called
  const SLOW_INTERVAL_MS  = 2000;

  // ── Selector lists ─────────────────────────────────────────────────────────

  // Tried in priority order — covers historical and current LinkedIn layouts.
  const DETAIL_CONTAINER_SELECTORS = [
    // Current two-pane search layout (2024-2026)
    '.scaffold-layout__detail',
    '.scaffold-layout__detail-container',
    '.jobs-search-two-pane__detail-view',
    '.jobs-search-two-pane__job-card-container--viewport-tracking-entry',
    // Historical / alternate names
    '.jobs-search__job-details--wrapper',
    '.job-view-layout',
    '.jobs-details',
    // Data-attribute based
    '[data-view-name="job-details"]',
    '[data-view-name="details-pane"]',
    // Broad class-substring patterns (last resort before heuristic)
    '[class*="job-details--wrapper"]',
    '[class*="jobs-search__job-details"]',
    '[class*="scaffold-layout__detail"]',
    '[class*="detail-view--full-bleed"]',
  ];

  const SCROLL_CONTAINER_SELECTORS = [
    '.scaffold-layout__detail',
    '.jobs-search__job-details--wrapper',
    '.jobs-details',
    '.job-view-layout',
    '.jobs-search-two-pane__detail-view',
    '[class*="scaffold-layout__detail"]',
    '[class*="job-details"]',
  ];

  // ── Container discovery ────────────────────────────────────────────────────

  function _findDetailContainer() {
    // 1. Named / class selectors
    for (const sel of DETAIL_CONTAINER_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return el; // skip display:none
      } catch (_) {}
    }

    // 2. Structural heuristic: find the sibling of the job-list pane
    const listEl = document.querySelector([
      '.scaffold-layout__list',
      '.scaffold-layout__list-container',
      '.jobs-search-results-list',
      'ul[class*="jobs-search"]',
    ].join(','));
    if (listEl) {
      const parent = listEl.parentElement;
      if (parent) {
        const children = Array.from(parent.children);
        const listIdx  = children.indexOf(listEl);
        // The detail pane is the next sibling(s) after the list
        for (let i = listIdx + 1; i < children.length; i++) {
          const sib = children[i];
          if (sib.offsetWidth > 100 && sib.offsetHeight > 100) return sib;
        }
      }
    }

    // 3. Heuristic: find a scrollable element that contains a job heading
    //    but is NOT inside the job list
    const headings = document.querySelectorAll('h1, h2');
    for (const h of headings) {
      if (h.closest('[data-occludable-job-id],[data-job-id],.jobs-search-results__list-item')) continue;
      const scrollable = _findScrollableAncestor(h);
      if (scrollable) return scrollable;
    }

    return null;
  }

  function _findScrollableAncestor(el) {
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      if (
        node.scrollHeight > node.clientHeight + 50 &&
        node.clientHeight > 150 &&
        node !== document.body
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function findScrollContainer() {
    for (const sel of SCROLL_CONTAINER_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el && el.scrollHeight > el.clientHeight + 10) return el;
      } catch (_) {}
    }
    // Fallback: use the container itself
    if (_container && _container.scrollHeight > _container.clientHeight + 10) {
      return _container;
    }
    return null;
  }

  // ── jobId detection ────────────────────────────────────────────────────────

  function _detectJobId() {
    // URL is the most reliable source — handles both path and query-param layouts
    const fromUrl = window.LGH.jobIdUtils.extractFromUrl(location.href);
    if (fromUrl) return fromUrl;

    // Fallback: scan the detail container for a job-view link
    if (_container) {
      const link = _container.querySelector('a[href*="/jobs/view/"]');
      if (link) return window.LGH.jobIdUtils.extractFromUrl(link.href);

      return window.LGH.jobIdUtils.extractFromCard(_container);
    }

    return null;
  }

  // ── Scheduled check ────────────────────────────────────────────────────────

  function _checkDetailChange() {
    if (!_active || !_container) return;

    const jobId = _detectJobId();
    if (!jobId) return;
    if (jobId === _lastJobId) return;

    _lastJobId = jobId;

    const blocks   = window.LGH.extractDetailBlocks(_container);
    const scrollEl = findScrollContainer();

    if (_onDetailChange) _onDetailChange(jobId, blocks, scrollEl);
  }

  const _scheduleCheck = window.LGH.debounce(
    () => requestAnimationFrame(_checkDetailChange),
    300
  );

  // ── MutationObserver ───────────────────────────────────────────────────────

  function _setupMutationObs(container) {
    if (_mutationObs) { _mutationObs.disconnect(); _mutationObs = null; }

    _mutationObs = new MutationObserver(() => {
      _scheduleCheck(); // no heavy work inside callback
    });

    _mutationObs.observe(container, { childList: true, subtree: true });
  }

  // ── Attach with two-phase retry ────────────────────────────────────────────

  function _tryAttach() {
    if (!_active) return;

    _container = _findDetailContainer();

    if (_container) {
      _attachRetries = 0;
      _stopKeepAlive();
      console.log('[LGH] DetailObserver attached to', _container.className || _container.tagName);
      _checkDetailChange();
      _setupMutationObs(_container);
      return;
    }

    _attachRetries++;

    if (_attachRetries <= FAST_RETRIES) {
      // Phase 1: fast retries
      setTimeout(() => { if (_active) _tryAttach(); }, FAST_INTERVAL_MS);
    } else if (!_keepAliveTimer) {
      // Phase 2: slow keep-alive — keeps checking every SLOW_INTERVAL_MS
      // so the observer self-heals if LinkedIn renders the pane late
      console.warn('[LGH] DetailObserver: switching to slow keep-alive polling');
      _keepAliveTimer = setInterval(() => {
        if (!_active) { _stopKeepAlive(); return; }
        _container = _findDetailContainer();
        if (_container) {
          _stopKeepAlive();
          _attachRetries = 0;
          console.log('[LGH] DetailObserver: late-attach to', _container.className || _container.tagName);
          _checkDetailChange();
          _setupMutationObs(_container);
        }
      }, SLOW_INTERVAL_MS);
    }
  }

  function _stopKeepAlive() {
    if (_keepAliveTimer !== null) {
      clearInterval(_keepAliveTimer);
      _keepAliveTimer = null;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function start(onDetailChange) {
    if (_active) stop();

    _onDetailChange = onDetailChange;
    _active         = true;
    _lastJobId      = null;
    _attachRetries  = 0;

    _tryAttach();
  }

  function stop() {
    _active = false;
    _stopKeepAlive();
    if (_mutationObs) { _mutationObs.disconnect(); _mutationObs = null; }
    _container      = null;
    _lastJobId      = null;
    _onDetailChange = null;
  }

  function resetLastJobId() {
    _lastJobId = null;
    // If we already have a container, re-check immediately
    if (_container && _active) _scheduleCheck();
  }

  return { start, stop, resetLastJobId, findScrollContainer };
})();
