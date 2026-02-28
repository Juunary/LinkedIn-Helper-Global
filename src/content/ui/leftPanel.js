window.LGH = window.LGH || {};

/**
 * LeftPanel — renders translated job list cards inside the left shadow-DOM panel.
 *
 * Each visible job card from LinkedIn gets a corresponding translated card here.
 * Cards are keyed by jobId so they survive LinkedIn's virtualised list recycling.
 *
 * Public API:
 *   mount(shadowRoot)
 *   unmount()
 *   setStatus(msg, type?)        — type: 'loading'|'error'|'ok'|''
 *   markLoading(jobId, rawData)  — show placeholder while translation is in-flight
 *   renderTranslation(jobId, translated) — fill in translated fields
 *   markError(jobId, errMsg)
 *   clearCards()                 — reset for route change
 *   getBodyEl()                  — scroll container (for scroll-sync if needed)
 */
window.LGH.LeftPanel = (function () {
  let _panelEl  = null;
  let _headerEl = null;
  let _statusEl = null;
  let _bodyEl   = null;
  let _fabEl    = null;
  let _isOpen   = false;

  // jobId → card DOM element
  const _cardMap = new Map();

  // ── Mount ──────────────────────────────────────────────────────────────────

  function mount(shadowRoot) {
    if (_panelEl) return; // idempotent

    // FAB (visible on narrow screens via media query in panelHost CSS)
    _fabEl = document.createElement('button');
    _fabEl.className = 'lgh-fab lgh-fab--left';
    _fabEl.setAttribute('aria-label', 'Toggle job list translation panel');
    _fabEl.title = 'Job list translations';
    _fabEl.textContent = '≡';
    _fabEl.addEventListener('click', _toggle);
    shadowRoot.appendChild(_fabEl);

    // Panel shell
    _panelEl = document.createElement('div');
    _panelEl.className = 'lgh-panel lgh-panel--left';
    _panelEl.setAttribute('role', 'complementary');
    _panelEl.setAttribute('aria-label', 'Job List Translation');

    // Header
    _headerEl = document.createElement('div');
    _headerEl.className = 'lgh-panel__header';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'lgh-panel__title';
    titleSpan.textContent = 'Job List · Translation';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'lgh-panel__toggle-btn';
    toggleBtn.setAttribute('aria-label', 'Close panel');
    toggleBtn.title = 'Close';
    toggleBtn.textContent = '×';
    toggleBtn.addEventListener('click', _toggle);

    _headerEl.appendChild(titleSpan);
    _headerEl.appendChild(toggleBtn);

    // Status bar
    _statusEl = document.createElement('div');
    _statusEl.className = 'lgh-panel__status';
    _statusEl.textContent = 'Scroll to translate cards';

    // Scrollable body
    _bodyEl = document.createElement('div');
    _bodyEl.className = 'lgh-panel__body';

    _panelEl.appendChild(_headerEl);
    _panelEl.appendChild(_statusEl);
    _panelEl.appendChild(_bodyEl);
    shadowRoot.appendChild(_panelEl);
  }

  // ── Unmount ────────────────────────────────────────────────────────────────

  function unmount() {
    if (_panelEl) { _panelEl.remove(); _panelEl = null; }
    if (_fabEl)   { _fabEl.remove();   _fabEl = null; }
    _headerEl = null;
    _statusEl = null;
    _bodyEl   = null;
    _cardMap.clear();
    _isOpen = false;
  }

  // ── Narrow-screen toggle ───────────────────────────────────────────────────

  function _toggle() {
    _isOpen = !_isOpen;
    if (_panelEl) _panelEl.classList.toggle('lgh-open', _isOpen);
  }

  // ── Status bar ─────────────────────────────────────────────────────────────

  function setStatus(msg, type) {
    if (!_statusEl) return;
    _statusEl.textContent = msg || '';
    _statusEl.className = 'lgh-panel__status' + (type ? ` lgh-status--${type}` : '');
  }

  // ── Card management ────────────────────────────────────────────────────────

  /**
   * Show a loading placeholder card for a newly visible job.
   * @param {string} jobId
   * @param {{ title, company, location, snippet }} rawData — original (untranslated) text
   */
  function markLoading(jobId, rawData) {
    const card = _getOrCreateCard(jobId);
    card.classList.add('lgh-loading');
    card.classList.remove('lgh-error');
    _renderCardContent(card, {
      title:    (rawData && rawData.title)    || '…',
      company:  (rawData && rawData.company)  || '',
      location: (rawData && rawData.location) || '',
      snippet:  '',
    });
    setStatus('Translating…', 'loading');
  }

  /**
   * Fill in the translated result for a card.
   * @param {string} jobId
   * @param {{ title, company, location, snippet }} translated
   */
  function renderTranslation(jobId, translated) {
    const card = _getOrCreateCard(jobId);
    card.classList.remove('lgh-loading', 'lgh-error');
    _renderCardContent(card, translated);
  }

  /**
   * Mark a card as failed.
   * @param {string} jobId
   * @param {string} errMsg
   */
  function markError(jobId, errMsg) {
    const card = _getOrCreateCard(jobId);
    card.classList.remove('lgh-loading');
    card.classList.add('lgh-error');
    _renderCardContent(card, {
      title: errMsg || 'Translation failed',
      company: '', location: '', snippet: '',
    });
  }

  /** Remove all cards — called on route change / job search reset. */
  function clearCards() {
    if (_bodyEl) _bodyEl.innerHTML = '';
    _cardMap.clear();
    setStatus('Scroll to translate cards');
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  function _getOrCreateCard(jobId) {
    if (_cardMap.has(jobId)) return _cardMap.get(jobId);
    const card = document.createElement('div');
    card.className = 'lgh-card';
    card.dataset.jobId = jobId;
    if (_bodyEl) _bodyEl.appendChild(card);
    _cardMap.set(jobId, card);
    return card;
  }

  function _renderCardContent(card, data) {
    card.innerHTML = '';
    const d = data || {};
    if (d.title) {
      const t = document.createElement('div');
      t.className = 'lgh-card__title';
      t.textContent = d.title;
      card.appendChild(t);
    }
    if (d.company) {
      const c = document.createElement('div');
      c.className = 'lgh-card__company';
      c.textContent = d.company;
      card.appendChild(c);
    }
    if (d.location) {
      const l = document.createElement('div');
      l.className = 'lgh-card__location';
      l.textContent = d.location;
      card.appendChild(l);
    }
    if (d.snippet) {
      const s = document.createElement('div');
      s.className = 'lgh-card__snippet';
      s.textContent = d.snippet;
      card.appendChild(s);
    }
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  function getBodyEl() { return _bodyEl; }

  return {
    mount,
    unmount,
    setStatus,
    markLoading,
    renderTranslation,
    markError,
    clearCards,
    getBodyEl,
  };
})();
