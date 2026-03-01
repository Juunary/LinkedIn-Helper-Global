window.LGH = window.LGH || {};

/**
 * RightPanel — renders translated job detail inside the right shadow-DOM panel.
 *
 * Rendering strategy:
 *   Meta section (title / company / location):
 *     Each field shown as two lines — original on top (muted), translated below (bold).
 *   Body section (description blocks):
 *     Translated text only (no original duplicate).
 *
 * Public API:
 *   mount(shadowRoot)
 *   unmount()
 *   setStatus(msg, type?)
 *   showLoading(jobId)
 *   renderDetail(jobId, translated)   — translated: { meta, blocks }
 *   showError(jobId, errMsg)
 *   clearDetail()
 *   getBodyEl()
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

    _fabEl = document.createElement('button');
    _fabEl.className = 'lgh-fab lgh-fab--right';
    _fabEl.setAttribute('aria-label', 'Toggle job detail translation panel');
    _fabEl.title = 'Job detail translation';
    _fabEl.textContent = '⊞';
    _fabEl.addEventListener('click', _toggle);
    shadowRoot.appendChild(_fabEl);

    _panelEl = document.createElement('div');
    _panelEl.className = 'lgh-panel lgh-panel--right';
    _panelEl.setAttribute('role', 'complementary');
    _panelEl.setAttribute('aria-label', 'Job Detail Translation');

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

    _statusEl = document.createElement('div');
    _statusEl.className = 'lgh-panel__status';
    _statusEl.textContent = 'Click a job to see translation';

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

  // ── Loading state ──────────────────────────────────────────────────────────

  function showLoading(jobId) {
    _currentJobId = jobId;
    if (!_bodyEl) return;
    setStatus('Translating…', 'loading');
    _bodyEl.scrollTop = 0;
    _bodyEl.innerHTML = '';
    const ph = document.createElement('div');
    ph.className = 'lgh-block lgh-block--paragraph';
    ph.style.color = '#999';
    ph.textContent = 'Loading translation…';
    _bodyEl.appendChild(ph);
  }

  // ── Copy toast helper ──────────────────────────────────────────────────────

  function _showCopyToast(anchorEl) {
    // Remove any existing toast
    const existing = anchorEl.querySelector('.lgh-copy-toast');
    if (existing) existing.remove();

    const toast = document.createElement('span');
    toast.className = 'lgh-copy-toast';
    toast.textContent = 'Copied!';
    anchorEl.appendChild(toast);

    // Fade out and remove after 1.4 s
    setTimeout(function () {
      toast.classList.add('lgh-copy-toast--fade');
      setTimeout(function () { toast.remove(); }, 400);
    }, 1000);
  }

  // ── Main render ────────────────────────────────────────────────────────────

  /**
   * Render translated detail payload.
   * Stale responses (different jobId) are silently dropped.
   *
   * @param {string} jobId
   * @param {{
   *   meta: {
   *     title:    { original: string, translated: string },
   *     company:  { original: string, translated: string },
   *     location: { original: string, translated: string },
   *   },
   *   blocks: Array<{ type, level?, text, index }>
   * }} translated
   */
  function renderDetail(jobId, translated) {
    if (!_bodyEl) return;
    if (jobId !== _currentJobId) return; // stale — discard

    setStatus('Translation complete', 'ok');
    _bodyEl.innerHTML = '';
    _bodyEl.scrollTop = 0;

    if (!translated) {
      _bodyEl.textContent = 'No content.';
      return;
    }

    const frag = document.createDocumentFragment();

    // ── Meta section: original + translated dual-line ─────────────────────────
    const { meta } = translated;
    if (meta && (meta.title || meta.company || meta.location)) {
      const metaSection = document.createElement('div');
      metaSection.className = 'lgh-detail-meta';

      const FIELDS = [
        { key: 'title',    rowClass: 'lgh-meta-row--title' },
        { key: 'company',  rowClass: '' },
        { key: 'location', rowClass: '' },
      ];

      for (const { key, rowClass } of FIELDS) {
        const field = meta[key];
        if (!field) continue;
        const orig = (typeof field === 'object') ? (field.original   || '') : '';
        const tr   = (typeof field === 'object') ? (field.translated || '') : String(field);
        if (!orig && !tr) continue;

        // For location: strip trailing metadata appended by LinkedIn
        // e.g. "Munich, Bavaria · Reposted 15 hours ago · 30 people clicked apply…"
        //   → "Munich, Bavaria"
        const copyText = key === 'location'
          ? orig.replace(/\s*·\s*(Reposted|Posted|Promoted|Easy Apply).*/i, '').trim()
          : orig;

        const row = document.createElement('div');
        row.className = ('lgh-meta-row ' + rowClass).trim();

        if (orig) {
          const origEl = document.createElement('div');
          origEl.className = 'lgh-meta__original lgh-meta__original--copyable';
          origEl.textContent = orig;
          origEl.title = 'Click to copy';
          origEl.addEventListener('click', function () {
            navigator.clipboard.writeText(copyText).then(function () {
              _showCopyToast(origEl);
            }).catch(function () {
              try {
                const ta = document.createElement('textarea');
                ta.value = copyText;
                ta.style.cssText = 'position:fixed;opacity:0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                _showCopyToast(origEl);
              } catch(_) {}
            });
          });
          row.appendChild(origEl);
        }
        if (tr) {
          const trEl = document.createElement('div');
          trEl.className = 'lgh-meta__translated';
          trEl.textContent = tr;
          row.appendChild(trEl);
        }
        metaSection.appendChild(row);
      }

      frag.appendChild(metaSection);
    }

    // ── Body blocks: translated only ──────────────────────────────────────────
    const blocks = translated.blocks || [];
    if (blocks.length > 0) {
      const bodySection = document.createElement('div');
      bodySection.className = 'lgh-detail-body';

      for (const block of blocks) {
        const el = document.createElement('div');
        const level = block.level ? block.level : '';
        el.className = `lgh-block lgh-block--${block.type}${level}`;
        el.textContent = block.text || '';
        el.dataset.blockIndex = String(block.index);
        bodySection.appendChild(el);
      }

      frag.appendChild(bodySection);
    }

    if (!frag.childNodes.length) {
      const empty = document.createElement('div');
      empty.className = 'lgh-block lgh-block--paragraph';
      empty.style.color = '#999';
      empty.textContent = 'No translatable content found.';
      frag.appendChild(empty);
    }

    _bodyEl.appendChild(frag);
  }

  // ── Error state ────────────────────────────────────────────────────────────

  function showError(jobId, errMsg) {
    if (jobId && jobId !== _currentJobId) return;

    const isNoKey = typeof errMsg === 'string' && errMsg.includes('NO_API_KEY');

    if (isNoKey) {
      setStatus('API key required · Open Options', 'error');
      if (_bodyEl) {
        _bodyEl.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'lgh-block lgh-block--paragraph';
        wrap.style.cssText = 'color:#b91c1c;line-height:1.6';

        const msg = document.createElement('div');
        msg.textContent = '⚠ No API key configured.';
        msg.style.fontWeight = '600';

        const detail = document.createElement('div');
        detail.style.marginTop = '8px';
        detail.textContent =
          'Open the extension Options page and enter your DeepL (or Google) API key. ' +
          'Then reload this page.';

        wrap.appendChild(msg);
        wrap.appendChild(detail);
        _bodyEl.appendChild(wrap);
      }
    } else {
      setStatus('Translation failed — check console for details', 'error');
      if (_bodyEl) {
        _bodyEl.innerHTML = '';
        const errEl = document.createElement('div');
        errEl.className = 'lgh-block lgh-block--paragraph';
        errEl.style.color = '#b91c1c';
        errEl.textContent = 'Error: ' + (errMsg || 'unknown error');
        _bodyEl.appendChild(errEl);
      }
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────────

  function clearDetail() {
    _currentJobId = null;
    if (_bodyEl) _bodyEl.innerHTML = '';
    setStatus('Click a job to see translation');
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  function getBodyEl()         { return _bodyEl; }
  function getPanelEl()        { return _panelEl; }
  function getCurrentJobId()   { return _currentJobId; }
  function setCurrentJobId(id) { _currentJobId = id; }

  return {
    mount,
    unmount,
    setStatus,
    showLoading,
    renderDetail,
    showError,
    clearDetail,
    getBodyEl,
    getPanelEl,
    getCurrentJobId,
    setCurrentJobId,
  };
})();
