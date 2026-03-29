window.LGH = window.LGH || {};

/**
 * PanelHost — creates and manages the single Shadow DOM host element that
 * contains both translation panels. All extension UI lives inside this shadow root
 * so that LinkedIn's styles cannot interfere and we never touch LinkedIn's own DOM.
 *
 * Only one host element is ever injected into document.body.
 */
window.LGH.PanelHost = (function () {
  const HOST_ID = 'lgh-panel-host';

  let _hostEl = null;
  let _shadow = null;

  // ── Base stylesheet injected into the shadow root ──────────────────────────
  // All panel CSS lives here. LinkedIn's global styles never bleed in.
  const BASE_CSS = `
    :host {
      all: initial;
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    /* ── Panel shell ──────────────────────────────────────────── */
    .lgh-panel {
      position: fixed;
      top: 52px;
      width: 260px;
      height: calc(100vh - 52px);
      background: #ffffff;
      border: 1px solid #d0dce8;
      border-radius: 8px 8px 0 0;
      box-shadow: 0 4px 16px rgba(0,0,0,0.13);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 9990;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 13px;
      color: #1d2226;
      transition: transform 0.22s ease, opacity 0.22s ease;
    }

    .lgh-panel--left  { left: 4px; }
    .lgh-panel--right { right: 4px; width: 300px; }

    /* ── Header ───────────────────────────────────────────────── */
    .lgh-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 10px;
      background: #0a66c2;
      color: #ffffff;
      flex-shrink: 0;
      user-select: none;
    }

    .lgh-panel__title {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.2px;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .lgh-panel__toggle-btn {
      background: none;
      border: none;
      color: #ffffff;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 3px;
      flex-shrink: 0;
      opacity: 0.85;
    }
    .lgh-panel__toggle-btn:hover { opacity: 1; background: rgba(255,255,255,0.15); }

    /* ── Status bar ───────────────────────────────────────────── */
    .lgh-panel__status {
      font-size: 11px;
      padding: 3px 10px;
      background: #f3f6f8;
      border-bottom: 1px solid #dce6f0;
      color: #666666;
      flex-shrink: 0;
      min-height: 20px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lgh-panel__status.lgh-status--loading { color: #0a66c2; }
    .lgh-panel__status.lgh-status--error   { color: #b91c1c; }
    .lgh-panel__status.lgh-status--ok      { color: #057642; }

    /* ── Scrollable body ──────────────────────────────────────── */
    .lgh-panel__body {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      scroll-behavior: smooth;
    }

    /* ── Job list cards (left panel) ──────────────────────────── */
    .lgh-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 6px;
      background: #fafbfc;
      transition: border-color 0.15s;
    }
    .lgh-card.lgh-loading {
      opacity: 0.55;
      border-style: dashed;
    }
    .lgh-card.lgh-error {
      border-color: #fca5a5;
      background: #fff5f5;
    }
    .lgh-card {
      transition: background-color 0.15s ease;
      cursor: default;
    }
    .lgh-card:hover,
    .lgh-card.lgh-highlight {
      background-color: #d1fae5;
      border-color: #6ee7b7;
    }
    .lgh-card__title    { font-weight: 600; font-size: 13px; color: #0a66c2; margin-bottom: 2px; line-height: 1.3; }
    .lgh-card__company  { font-size: 12px; color: #444444; }
    .lgh-card__location { font-size: 11px; color: #777777; margin-top: 2px; }
    .lgh-card__snippet  {
      font-size: 11px; color: #555555; margin-top: 5px;
      padding-top: 5px; border-top: 1px dashed #e0e0e0; line-height: 1.4;
    }

    /* ── Detail blocks (right panel) ─────────────────────────── */
    .lgh-block { margin-bottom: 9px; line-height: 1.55; word-break: break-word; }
    .lgh-block--heading1  { font-size: 16px; font-weight: 700; color: #1d2226; }
    .lgh-block--heading2  { font-size: 14px; font-weight: 600; color: #1d2226; margin-top: 14px; }
    .lgh-block--heading3  { font-size: 13px; font-weight: 600; color: #333333; margin-top: 10px; }
    .lgh-block--label     { font-size: 12px; color: #555555; }
    .lgh-block--paragraph { font-size: 13px; color: #1d2226; }
    .lgh-block--list-item {
      font-size: 13px; color: #1d2226;
      padding-left: 16px; position: relative; margin-bottom: 4px;
    }
    .lgh-block--list-item::before {
      content: "•"; position: absolute; left: 4px; color: #0a66c2;
    }

    /* ── Language selector (in left panel header) ─────────────── */
    .lgh-lang-wrap {
      position: relative;
      flex-shrink: 0;
      margin-right: 4px;
    }
    .lgh-lang-btn {
      background: rgba(255,255,255,0.18);
      border: 1px solid rgba(255,255,255,0.35);
      color: #ffffff;
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
      padding: 2px 5px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }
    .lgh-lang-btn:hover { background: rgba(255,255,255,0.28); }
    .lgh-lang-btn__caret { font-size: 9px; opacity: 0.8; }

    .lgh-lang-dropdown {
      display: none;
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      min-width: 130px;
      background: #ffffff;
      border: 1px solid #d0dce8;
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.18);
      z-index: 99999;
      overflow: hidden;
    }
    .lgh-lang-dropdown.lgh-open { display: block; }

    .lgh-lang-option {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 7px 11px;
      font-size: 12px;
      color: #1d2226;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.1s;
    }
    .lgh-lang-option:hover   { background: #f0f5fb; }
    .lgh-lang-option.active  { background: #e8f0fb; font-weight: 600; color: #0a66c2; }
    .lgh-lang-option__flag   { font-size: 16px; line-height: 1; }
    .lgh-lang-option__label  { flex: 1; }

    /* ── Detail meta section (right panel) ─────────────────────── */
    .lgh-detail-meta {
      padding-bottom: 10px;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 10px;
    }
    .lgh-meta-row       { margin-bottom: 5px; }
    .lgh-meta__original    { font-size: 11px; color: #999999; line-height: 1.3; }
    .lgh-meta__original--copyable {
      cursor: pointer;
      position: relative;
      display: inline-block;
      border-bottom: 1px dashed transparent;
      transition: color 0.12s, border-color 0.12s;
    }
    .lgh-meta__original--copyable:hover {
      color: #0a66c2;
      border-bottom-color: #0a66c2;
    }
    .lgh-copy-toast {
      position: absolute;
      left: 0;
      top: -22px;
      background: #1d2226;
      color: #fff;
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 1;
      transition: opacity 0.4s ease;
    }
    .lgh-copy-toast--fade { opacity: 0; }
    .lgh-meta__translated  { font-size: 13px; font-weight: 600; color: #1d2226; line-height: 1.3; }
    .lgh-meta-row--title .lgh-meta__translated { font-size: 15px; color: #0a66c2; }

    /* ── Selection Translator ─────────────────────────────────── */

    /* Floating "번역" button that appears to the right of a text selection */
    .lgh-sel-btn {
      position: fixed;
      z-index: 9999;
      background: #0a66c2;
      color: #ffffff;
      border: none;
      border-radius: 11px;
      padding: 3px 11px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.28);
      white-space: nowrap;
      user-select: none;
      transition: background 0.15s, transform 0.1s;
      pointer-events: auto;
    }
    .lgh-sel-btn:hover  { background: #004182; }
    .lgh-sel-btn:active { transform: scale(0.95); }

    /* Result popup */
    .lgh-sel-popup {
      position: fixed;
      z-index: 9999;
      background: #ffffff;
      border: 1px solid #d0dce8;
      border-radius: 8px;
      box-shadow: 0 4px 18px rgba(0,0,0,0.18);
      padding: 10px 12px 11px;
      max-width: 295px;
      min-width: 180px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 13px;
      color: #1d2226;
      pointer-events: auto;
    }

    .lgh-sel-popup__close {
      float: right;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 17px;
      line-height: 1;
      color: #aaaaaa;
      padding: 0 0 4px 6px;
      margin-left: 4px;
    }
    .lgh-sel-popup__close:hover { color: #333333; }

    .lgh-sel-popup__original {
      font-size: 11px;
      color: #999999;
      margin-bottom: 7px;
      padding-bottom: 7px;
      border-bottom: 1px dashed #e0e0e0;
      line-height: 1.45;
      word-break: break-word;
    }

    .lgh-sel-popup__body {
      font-size: 13px;
      font-weight: 500;
      color: #1d2226;
      line-height: 1.55;
      word-break: break-word;
    }
    .lgh-sel-popup__body--loading {
      color: #0a66c2;
      font-weight: 400;
      font-style: italic;
    }
    .lgh-sel-popup__body--error {
      font-size: 12px;
      font-weight: 400;
      color: #b91c1c;
    }

    /* ── FAB toggle buttons (shown on narrow screens) ─────────── */
    .lgh-fab {
      position: fixed;
      z-index: 9991;
      top: 56px;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: #0a66c2;
      color: #ffffff;
      border: none;
      cursor: pointer;
      font-size: 15px;
      display: none;          /* hidden by default — shown via media query */
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.28);
      transition: background 0.15s;
    }
    .lgh-fab:hover { background: #004182; }
    .lgh-fab--left  { left: 4px; }
    .lgh-fab--right { right: 4px; }

    /* ── Narrow screen: panels become slide-over overlays ─────── */
    @media (max-width: 1280px) {
      .lgh-fab { display: flex; }

      .lgh-panel--left {
        transform: translateX(calc(-100% - 12px));
        opacity: 0;
        pointer-events: none;
      }
      .lgh-panel--left.lgh-open {
        transform: translateX(0);
        opacity: 1;
        pointer-events: auto;
        z-index: 9995;
        box-shadow: 0 4px 28px rgba(0,0,0,0.28);
      }

      .lgh-panel--right {
        transform: translateX(calc(100% + 12px));
        opacity: 0;
        pointer-events: none;
      }
      .lgh-panel--right.lgh-open {
        transform: translateX(0);
        opacity: 1;
        pointer-events: auto;
        z-index: 9995;
        box-shadow: 0 4px 28px rgba(0,0,0,0.28);
      }
    }
  `;

  // ── Public API ─────────────────────────────────────────────────────────────

  function mount() {
    if (document.getElementById(HOST_ID)) return; // already present

    _hostEl = document.createElement('div');
    _hostEl.id = HOST_ID;
    // Deliberately set no style/class on _hostEl — all rendering is inside shadow DOM
    document.body.appendChild(_hostEl);

    _shadow = _hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = BASE_CSS;
    _shadow.appendChild(style);
  }

  function unmount() {
    if (_hostEl) {
      _hostEl.remove();
      _hostEl = null;
      _shadow = null;
    }
  }

  function getShadow()  { return _shadow; }
  function getHostEl()  { return _hostEl; }
  function isMounted()  { return _hostEl !== null; }

  return { mount, unmount, getShadow, getHostEl, isMounted };
})();
