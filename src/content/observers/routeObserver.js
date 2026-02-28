window.LGH = window.LGH || {};

/**
 * RouteObserver — detects LinkedIn SPA navigation and fires a callback.
 *
 * LinkedIn uses the History API (pushState / replaceState) for navigation.
 * We patch both methods to emit a custom event, and also listen for popstate.
 * A 500 ms URL-polling interval acts as a safety net for edge cases.
 *
 * Only one RouteObserver can be active at a time (module-level singleton).
 *
 * Public API:
 *   start(onChange)  — onChange(newUrl: string) is called on every URL change
 *   stop()
 */
window.LGH.RouteObserver = (function () {
  const EVENT_NAME = 'lgh:locationchange';

  let _callback   = null;
  let _lastUrl    = '';
  let _pollTimer  = null;
  let _active     = false;

  // Patch history methods exactly once per page (guard via window flag)
  function _patchHistory() {
    if (window.__lghHistoryPatched) return;
    window.__lghHistoryPatched = true;

    function wrap(original) {
      return function (...args) {
        const ret = original.apply(this, args);
        window.dispatchEvent(new Event(EVENT_NAME));
        return ret;
      };
    }

    history.pushState    = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
  }

  function _onLocationChange() {
    const url = location.href;
    if (url === _lastUrl) return;
    _lastUrl = url;
    if (_callback) _callback(url);
  }

  function start(onChange) {
    if (_active) stop();

    _callback = onChange;
    _lastUrl  = location.href;
    _active   = true;

    _patchHistory();
    window.addEventListener(EVENT_NAME, _onLocationChange);
    window.addEventListener('popstate',  _onLocationChange);

    // Polling fallback — catches any route change the patches might miss
    _pollTimer = setInterval(() => {
      if (location.href !== _lastUrl) _onLocationChange();
    }, 500);
  }

  function stop() {
    window.removeEventListener(EVENT_NAME, _onLocationChange);
    window.removeEventListener('popstate',  _onLocationChange);
    if (_pollTimer !== null) { clearInterval(_pollTimer); _pollTimer = null; }
    _active   = false;
    _callback = null;
  }

  return { start, stop };
})();
