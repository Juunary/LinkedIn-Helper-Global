window.LGH = window.LGH || {};

/**
 * RightPanel — renders translated job detail blocks inside the right shadow-DOM panel.
 *
 * When the user clicks a job on LinkedIn the detail pane changes. This panel
 * renders the translated version as structured blocks (headings / paragraphs / lists).
 *
 * Public API:
 *   mount(shadowRoot)
 *   unmount()
 *   setStatus(msg, type?)
 *   showLoading(jobId)
 *   renderBlocks(jobId, blocks)   — blocks: [{type,level?,text,index}]
 *   showError(jobId, errMsg)
 *   clearDetail()
 *   getBodyEl()                  — the scrollable container (used by ScrollSync)
 *   getPanelEl()
 *   getCurrentJobId() / setCurrentJobId(id)
 */
window.LGH.RightPanel = (function () {
  let _panelEl  = null;
  let _statusEl = null;
  let _bodyEl   = null;
  let _fabEl    = null;
  let _isOpen   = false;

  let _currentJobId = null;

  // ── Mount ──────────────────────────────────────────────────────────────────

  function mount(shadowRoot) {
    if (_panelEl) return; // idempotent

    // FAB for narrow screens
    _fabEl = document.createElement('button');
    _fabEl.className = 'lgh-fab lgh-fab--right';
    _fabEl.setAttribute('aria-label', 'Toggle job detail translation panel');
    _fabEl.title = 'Job detail translation';
    _fabEl.textContent = '⊞';
    _fabEl.addEventListener('click', _toggle);
    shadowRoot.appendChild(_fabEl);

    // Panel shell
    _panelEl = document.createElement('div');
    _panelEl.className = 'lgh-panel lgh-panel--right';
    _panelEl.setAttribute('role', 'complementary');
    _panelEl.setAttribute('aria-label', 'Job Detail Translation');

    // Header
    const headerEl = document.createElement('div');
    headerEl.className = 'lgh-panel__header';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'lgh-panel__title';
    titleSpan.textContent = 'Job Detail · Translation';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'lgh-panel__toggle-btn';
    toggleBtn.setAttribute('aria-label', 'Close panel');
    toggleBtn.title = 'Close';
    toggleBtn.textContent = '×';
    toggleBtn.addEventListener('click', _toggle);

    headerEl.appendChild(titleSpan);
    headerEl.appendChild(toggleBtn);

    // Status bar
    _statusEl = document.createElement('div');
    _statusEl.className = 'lgh-panel__status';
    _statusEl.textContent = 'Click a job to see translation';

    // Scrollable body
    _bodyEl = document.createElement('div');
    _bodyEl.className = 'lgh-panel__body';

    _panelEl.appendChild(headerEl);
    _panelEl.appendChild(_statusEl);
    _panelEl.appendChild(_bodyEl);
    shadowRoot.appendChild(_panelEl);
  }

  // ── Unmount ────────────────────────────────────────────────────────────────

  function unmount() {
    if (_panelEl) { _panelEl.remove(); _panelEl = null; }
    if (_fabEl)   { _fabEl.remove();   _fabEl = null; }
    _statusEl     = null;
    _bodyEl       = null;
    _currentJobId = null;
    _isOpen       = false;
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

  // ── Detail rendering ───────────────────────────────────────────────────────

  /** Show a loading state while translation is in-flight. */
  function showLoading(jobId) {
    _currentJobId = jobId;
    if (!_bodyEl) return;
    setStatus('Translating…', 'loading');
    _bodyEl.scrollTop = 0;
    _bodyEl.innerHTML = '';
    const placeholder = document.createElement('div');
    placeholder.className = 'lgh-block lgh-block--paragraph';
    placeholder.style.color = '#999';
    placeholder.textContent = 'Loading translation…';
    _bodyEl.appendChild(placeholder);
  }

  /**
   * Render translated detail blocks.
   * Stale responses (different jobId) are silently dropped.
   *
   * @param {string} jobId
   * @param {Array<{type:string, level?:number, text:string, index:number}>} blocks
   */
  function renderBlocks(jobId, blocks) {
    if (!_bodyEl) return;
    if (jobId !== _currentJobId) return; // stale — discard

    setStatus('Translation complete', 'ok');
    _bodyEl.innerHTML = '';

    if (!blocks || blocks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lgh-block lgh-block--paragraph';
      empty.style.color = '#999';
      empty.textContent = 'No translatable content found.';
      _bodyEl.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const block of blocks) {
      const el = document.createElement('div');
      const level = block.level ? block.level : '';
      el.className = `lgh-block lgh-block--${block.type}${level}`;
      el.textContent = block.text || '';
      el.dataset.blockIndex = String(block.index);
      frag.appendChild(el);
    }
    _bodyEl.appendChild(frag);
    _bodyEl.scrollTop = 0;
  }

  /** Show a translation error message. */
  function showError(jobId, errMsg) {
    // Accept null jobId to clear any current job's error
    if (jobId && jobId !== _currentJobId) return;
    setStatus('Translation failed — check API key in options', 'error');
    if (_bodyEl) {
      _bodyEl.innerHTML = '';
      const errEl = document.createElement('div');
      errEl.className = 'lgh-block lgh-block--paragraph';
      errEl.style.color = '#b91c1c';
      errEl.textContent = 'Error: ' + (errMsg || 'unknown error');
      _bodyEl.appendChild(errEl);
    }
  }

  /** Reset the panel — called on route change or job de-selection. */
  function clearDetail() {
    _currentJobId = null;
    if (_bodyEl) _bodyEl.innerHTML = '';
    setStatus('Click a job to see translation');
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  function getBodyEl()          { return _bodyEl; }
  function getPanelEl()         { return _panelEl; }
  function getCurrentJobId()    { return _currentJobId; }
  function setCurrentJobId(id)  { _currentJobId = id; }

  return {
    mount,
    unmount,
    setStatus,
    showLoading,
    renderBlocks,
    showError,
    clearDetail,
    getBodyEl,
    getPanelEl,
    getCurrentJobId,
    setCurrentJobId,
  };
})();
