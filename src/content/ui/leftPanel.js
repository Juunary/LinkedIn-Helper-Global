window.LGH = window.LGH || {};

/**
 * LeftPanel — renders translated job list cards + hosts the language selector.
 *
 * Header layout:  [Job List · Translation]  [🇰🇷▾]  [×]
 *
 * Language selector:
 *   - Reads/writes `lgh_targetLang` in chrome.storage.local.
 *   - On selection calls window.LGH.onLanguageChange(code) so content_script.js
 *     can clear caches and re-trigger translation for both panels.
 *   - Click-outside closes the dropdown.
 *
 * Public API:
 *   mount(shadowRoot)
 *   unmount()
 *   setStatus(msg, type?)
 *   markLoading(jobId, rawData)
 *   renderTranslation(jobId, translated)
 *   markError(jobId, errMsg)
 *   clearCards()
 *   updateLangDisplay(code)   — sync flag button without opening dropdown
 *   getBodyEl()
 */
window.LGH.LeftPanel = (function () {
  let _panelEl  = null;
  let _headerEl = null;
  let _statusEl = null;
  let _bodyEl   = null;
  let _fabEl    = null;
  let _isOpen   = false;

  let _langBtnFlagEl  = null;
  let _langDropdownEl = null;
  let _currentLang    = 'KO';

  // jobId → card DOM element
  const _cardMap = new Map();

  // jobId → original LinkedIn card element (for click-through)
  const _linkedinCardMap = new Map();

  // Currently highlighted jobId (to clear stale highlights safely)
  let _highlightedJobId = null;

  // ── Language definitions ───────────────────────────────────────────────────

  const LANGUAGES = [
    { code: 'KO',    flag: '🇰🇷', label: '한국어'  },
    { code: 'EN-US', flag: '🇺🇸', label: 'English' },
    { code: 'JA',    flag: '🇯🇵', label: '日本語'  },
    { code: 'ZH',    flag: '🇨🇳', label: '中文'    },
    { code: 'DE',    flag: '🇩🇪', label: 'Deutsch'  },
    { code: 'ES',    flag: '🇪🇸', label: 'Español'  },
  ];

  function _flagForCode(code) {
    const found = LANGUAGES.find(l => l.code === code);
    return found ? found.flag : '🌐';
  }

  // ── Language selector ──────────────────────────────────────────────────────

  function _buildLangSelector() {
    const wrap = document.createElement('div');
    wrap.className = 'lgh-lang-wrap';

    // Button showing current flag
    const btn = document.createElement('button');
    btn.className = 'lgh-lang-btn';
    btn.setAttribute('aria-label', 'Select translation language');
    btn.setAttribute('title', 'Change target language');

    _langBtnFlagEl = document.createElement('span');
    _langBtnFlagEl.className = 'lgh-lang-btn__flag';
    _langBtnFlagEl.textContent = _flagForCode(_currentLang);

    const caret = document.createElement('span');
    caret.className = 'lgh-lang-btn__caret';
    caret.textContent = '▾';

    btn.appendChild(_langBtnFlagEl);
    btn.appendChild(caret);
    btn.addEventListener('click', _toggleDropdown);

    // Dropdown list
    _langDropdownEl = document.createElement('div');
    _langDropdownEl.className = 'lgh-lang-dropdown';
    _langDropdownEl.setAttribute('role', 'listbox');

    for (const lang of LANGUAGES) {
      const opt = document.createElement('div');
      opt.className = 'lgh-lang-option' + (lang.code === _currentLang ? ' active' : '');
      opt.setAttribute('role', 'option');
      opt.dataset.code = lang.code;

      const flagEl = document.createElement('span');
      flagEl.className = 'lgh-lang-option__flag';
      flagEl.textContent = lang.flag;

      const labelEl = document.createElement('span');
      labelEl.className = 'lgh-lang-option__label';
      labelEl.textContent = lang.label;

      opt.appendChild(flagEl);
      opt.appendChild(labelEl);
      opt.addEventListener('click', () => _selectLang(lang.code));
      _langDropdownEl.appendChild(opt);
    }

    wrap.appendChild(btn);
    wrap.appendChild(_langDropdownEl);
    return wrap;
  }

  function _toggleDropdown(e) {
    e.stopPropagation();
    const isOpen = _langDropdownEl.classList.toggle('lgh-open');
    if (isOpen) {
      setTimeout(() => document.addEventListener('click', _closeDropdown, { once: true }), 0);
    }
  }

  function _closeDropdown() {
    if (_langDropdownEl) _langDropdownEl.classList.remove('lgh-open');
  }

  function _selectLang(code) {
    _closeDropdown();
    updateLangDisplay(code);
    chrome.storage.local.set({ lgh_targetLang: code });
    if (typeof window.LGH.onLanguageChange === 'function') {
      window.LGH.onLanguageChange(code);
    }
  }

  // ── Mount ──────────────────────────────────────────────────────────────────

  function mount(shadowRoot) {
    if (_panelEl) return; // idempotent

    // Load persisted lang (async — updates display once result arrives)
    chrome.storage.local.get('lgh_targetLang', function (result) {
      const stored = result.lgh_targetLang || 'KO';
      if (stored !== _currentLang) updateLangDisplay(stored);
    });

    // FAB for narrow screens
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

    // Header: [title][lang-selector][×]
    _headerEl = document.createElement('div');
    _headerEl.className = 'lgh-panel__header';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'lgh-panel__title';
    titleSpan.textContent = 'Job List · Translation';

    const langWrap = _buildLangSelector();

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'lgh-panel__toggle-btn';
    toggleBtn.setAttribute('aria-label', 'Close panel');
    toggleBtn.title = 'Close';
    toggleBtn.textContent = '×';
    toggleBtn.addEventListener('click', _toggle);

    _headerEl.appendChild(titleSpan);
    _headerEl.appendChild(langWrap);
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
    document.removeEventListener('click', _closeDropdown);
    if (_panelEl) { _panelEl.remove(); _panelEl = null; }
    if (_fabEl)   { _fabEl.remove();   _fabEl = null; }
    _headerEl        = null;
    _statusEl        = null;
    _bodyEl          = null;
    _langBtnFlagEl   = null;
    _langDropdownEl  = null;
    _highlightedJobId = null;
    _cardMap.clear();
    _linkedinCardMap.clear();
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

  function renderTranslation(jobId, translated) {
    const card = _getOrCreateCard(jobId);
    card.classList.remove('lgh-loading', 'lgh-error');
    _renderCardContent(card, translated);
  }

  function markError(jobId, errMsg) {
    const card = _getOrCreateCard(jobId);
    card.classList.remove('lgh-loading');
    card.classList.add('lgh-error');
    _renderCardContent(card, {
      title: errMsg || 'Translation failed',
      company: '', location: '', snippet: '',
    });
  }

  function clearCards() {
    if (_bodyEl) _bodyEl.innerHTML = '';
    _cardMap.clear();
    _linkedinCardMap.clear();
    _highlightedJobId = null;
    setStatus('Scroll to translate cards');
  }

  /** Sync the flag button to `code` without opening the dropdown. */
  function updateLangDisplay(code) {
    _currentLang = code;
    if (_langBtnFlagEl) _langBtnFlagEl.textContent = _flagForCode(code);
    if (_langDropdownEl) {
      _langDropdownEl.querySelectorAll('.lgh-lang-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.code === code);
      });
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  function _getOrCreateCard(jobId) {
    if (_cardMap.has(jobId)) return _cardMap.get(jobId);
    const card = document.createElement('div');
    card.className = 'lgh-card';
    card.dataset.jobId = jobId;
    card.style.cursor = 'pointer';
    card.addEventListener('click', function () {
      const linkedinCard = _linkedinCardMap.get(jobId);
      if (!linkedinCard) return;
      // Click the job anchor inside the LinkedIn card — triggers LinkedIn's own navigation
      const anchor = linkedinCard.querySelector('a[href*="/jobs/view/"]');
      if (anchor) {
        anchor.click();
      } else {
        linkedinCard.click();
      }
    });
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

  /**
   * Highlight the translated card matching a hovered LinkedIn card, and
   * auto-scroll the panel body so the card is centred.
   *
   * Stale-highlight safety: always clears the previous highlight before setting
   * the new one, so recycled-DOM false-leaves never leave cards stuck green.
   *
   * @param {string}  jobId
   * @param {boolean} active  — true = entering, false = leaving
   */
  function highlightCard(jobId, active) {
    // ── Entering ────────────────────────────────────────────────────────────
    if (active) {
      // Clear any previously highlighted card (handles missed mouseleave)
      if (_highlightedJobId && _highlightedJobId !== jobId) {
        const prev = _cardMap.get(_highlightedJobId);
        if (prev) prev.classList.remove('lgh-highlight');
      }

      const card = _cardMap.get(jobId);
      if (!card) return;

      card.classList.add('lgh-highlight');
      _highlightedJobId = jobId;

      // Auto-scroll: centre the card vertically in the panel body
      if (_bodyEl) {
        const cardRect = card.getBoundingClientRect();
        const bodyRect = _bodyEl.getBoundingClientRect();
        // Distance from the card's centre to the panel body's centre
        const delta = (cardRect.top + cardRect.height / 2) -
                      (bodyRect.top  + bodyRect.height / 2);
        _bodyEl.scrollTop += delta;
      }

    // ── Leaving ─────────────────────────────────────────────────────────────
    } else {
      // Only clear if this job is still the active one
      // (guards against recycled-element events with mismatched IDs)
      if (_highlightedJobId === jobId) {
        const card = _cardMap.get(jobId);
        if (card) card.classList.remove('lgh-highlight');
        _highlightedJobId = null;
      }
    }
  }

  /**
   * Store the original LinkedIn card element for a jobId.
   * Used to forward clicks from the translated card to the real LinkedIn card.
   * @param {string}  jobId
   * @param {Element} linkedinCardEl
   */
  function bindLinkedInCard(jobId, linkedinCardEl) {
    if (jobId && linkedinCardEl) _linkedinCardMap.set(jobId, linkedinCardEl);
  }

  return {
    mount,
    unmount,
    setStatus,
    markLoading,
    renderTranslation,
    markError,
    clearCards,
    updateLangDisplay,
    getBodyEl,
    highlightCard,
    bindLinkedInCard,
  };
})();
