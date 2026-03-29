window.LGH = window.LGH || {};

/**
 * SelectionTranslator — shows a floating "번역" button whenever the user
 * drags to select text on the LinkedIn page.  Clicking it sends the selection
 * to the background service worker and displays the result in a small popup
 * positioned to the right of the highlighted text.
 *
 * All UI lives inside the existing Shadow DOM managed by PanelHost so that
 * LinkedIn's styles never bleed in and we never touch LinkedIn's own DOM.
 *
 * Public API:
 *   mount(shadowRoot)
 *   unmount()
 */
window.LGH.SelectionTranslator = (function () {
  let _shadow    = null;
  let _btnEl     = null;   // floating "번역" button
  let _popupEl   = null;   // translation result popup

  // Saved when the button is shown; used when button is clicked (selection
  // may be lost by then due to focus changes).
  let _savedText = '';
  let _savedRect = null;   // DOMRect (viewport coordinates)

  const LOG = '[LGH-sel]';

  // ── Mount / unmount ────────────────────────────────────────────────────────

  function mount(shadowRoot) {
    if (_shadow) return;
    _shadow = shadowRoot;

    // Floating translate button
    _btnEl = document.createElement('button');
    _btnEl.className = 'lgh-sel-btn';
    _btnEl.textContent = '번역';
    _btnEl.setAttribute('aria-label', 'Translate selected text');
    _btnEl.style.display = 'none';
    // Prevent mousedown from clearing the active text selection
    _btnEl.addEventListener('mousedown', function (e) { e.preventDefault(); });
    _btnEl.addEventListener('click', _onTranslateClick);
    _shadow.appendChild(_btnEl);

    // Result popup
    _popupEl = document.createElement('div');
    _popupEl.className = 'lgh-sel-popup';
    _popupEl.style.display = 'none';
    _shadow.appendChild(_popupEl);

    document.addEventListener('mouseup',   _onMouseUp);
    document.addEventListener('mousedown', _onDocMouseDown);
  }

  function unmount() {
    document.removeEventListener('mouseup',   _onMouseUp);
    document.removeEventListener('mousedown', _onDocMouseDown);
    if (_btnEl)   { _btnEl.remove();   _btnEl   = null; }
    if (_popupEl) { _popupEl.remove(); _popupEl = null; }
    _shadow    = null;
    _savedText = '';
    _savedRect = null;
  }

  // ── Selection detection ────────────────────────────────────────────────────

  function _onMouseUp() {
    // Small delay so the browser finalises the selection range
    setTimeout(function () {
      const sel  = window.getSelection();
      const text = sel ? sel.toString().trim() : '';

      if (!text || text.length < 2) { _hideBtn(); return; }
      if (sel.rangeCount === 0)     { _hideBtn(); return; }

      _savedText = text;
      _savedRect = sel.getRangeAt(0).getBoundingClientRect();
      _showBtn(_savedRect);
    }, 30);
  }

  function _onDocMouseDown(e) {
    // If the click is inside our shadow UI, let it through without hiding
    const path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(_btnEl) !== -1 || path.indexOf(_popupEl) !== -1) return;
    _hideAll();
  }

  // ── Button ────────────────────────────────────────────────────────────────

  function _showBtn(rect) {
    if (!_btnEl) return;
    _hidePopup();

    // Position to the right of the selection, vertically centred on it
    let left = rect.right + 10;
    let top  = rect.top + (rect.height / 2) - 12;

    // Clamp to viewport
    if (left + 58 > window.innerWidth)  left = rect.left - 68;
    if (top  + 26 > window.innerHeight) top  = window.innerHeight - 30;
    if (top < 4)                        top  = 4;

    _btnEl.style.left    = left + 'px';
    _btnEl.style.top     = top  + 'px';
    _btnEl.style.display = 'block';
  }

  function _hideBtn()   { if (_btnEl)   _btnEl.style.display   = 'none'; }
  function _hidePopup() { if (_popupEl) _popupEl.style.display = 'none'; }
  function _hideAll()   { _hideBtn(); _hidePopup(); _savedText = ''; _savedRect = null; }

  // ── Translation request ────────────────────────────────────────────────────

  function _onTranslateClick(e) {
    e.stopPropagation();

    const text = _savedText;
    const rect = _savedRect;
    if (!text || !rect) return;

    _hideBtn();
    _renderPopup(rect, { loading: true, original: text });

    chrome.runtime.sendMessage(
      { type: 'TRANSLATE', jobId: 'sel', scope: 'SELECTION', payload: { text } },
      function (resp) {
        if (chrome.runtime.lastError) {
          console.warn(LOG, 'sendMessage error:', chrome.runtime.lastError.message);
          _renderPopup(rect, { original: text, error: '연결 오류' });
          return;
        }
        if (!resp) { _renderPopup(rect, { original: text, error: '응답 없음' }); return; }

        if (resp.type === 'TRANSLATE_RESULT') {
          _renderPopup(rect, { original: text, translated: resp.translated || '' });
        } else {
          const errMsg = (resp.error || '').includes('NO_API_KEY')
            ? 'API 키 미설정 (Options에서 입력)'
            : (resp.error || '번역 오류');
          _renderPopup(rect, { original: text, error: errMsg });
        }
      }
    );
  }

  // ── Popup rendering ────────────────────────────────────────────────────────

  /**
   * Build and position the result popup.
   *
   * @param {DOMRect} selRect  Viewport-coordinate rect of the original selection
   * @param {{ loading?: boolean, original: string, translated?: string, error?: string }} state
   */
  function _renderPopup(selRect, state) {
    if (!_popupEl) return;
    _popupEl.innerHTML = '';

    // ── Close button ──────────────────────────────────────────────────────────
    const closeBtn = document.createElement('button');
    closeBtn.className = 'lgh-sel-popup__close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', function (e) { e.stopPropagation(); _hideAll(); });
    _popupEl.appendChild(closeBtn);

    // ── Original text (truncated) ─────────────────────────────────────────────
    if (state.original) {
      const origEl = document.createElement('div');
      origEl.className = 'lgh-sel-popup__original';
      origEl.textContent = state.original.length > 140
        ? state.original.slice(0, 140) + '…'
        : state.original;
      _popupEl.appendChild(origEl);
    }

    // ── Body: loading / result / error ────────────────────────────────────────
    const bodyEl = document.createElement('div');
    if (state.loading) {
      bodyEl.className = 'lgh-sel-popup__body lgh-sel-popup__body--loading';
      bodyEl.textContent = '번역 중…';
    } else if (state.error) {
      bodyEl.className = 'lgh-sel-popup__body lgh-sel-popup__body--error';
      bodyEl.textContent = '⚠ ' + state.error;
    } else {
      bodyEl.className = 'lgh-sel-popup__body';
      bodyEl.textContent = state.translated || '(결과 없음)';
    }
    _popupEl.appendChild(bodyEl);

    // ── Position ──────────────────────────────────────────────────────────────
    // Try right side first; fall back to left if near viewport edge
    let left = selRect.right + 12;
    let top  = selRect.top;

    if (left + 295 > window.innerWidth)  left = Math.max(8, selRect.left - 307);
    if (top  + 150 > window.innerHeight) top  = Math.max(8, selRect.top  - 150);
    if (top < 4) top = 4;

    _popupEl.style.left    = left + 'px';
    _popupEl.style.top     = top  + 'px';
    _popupEl.style.display = 'block';
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return { mount, unmount };
})();
