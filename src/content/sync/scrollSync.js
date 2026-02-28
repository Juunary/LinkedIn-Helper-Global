window.LGH = window.LGH || {};

/**
 * ScrollSync — synchronises the scroll position of the translated right panel
 * body with LinkedIn's original job detail scroll container.
 *
 * Strategy: ratio-based sync.
 *   ratio = source.scrollTop / (source.scrollHeight - source.clientHeight)
 *   target.scrollTop = ratio * (target.scrollHeight - target.clientHeight)
 *
 * The scroll listener is throttled to 32 ms to prevent performance issues.
 * A flag prevents feedback loops when the target's scroll triggers the source.
 *
 * Public API:
 *   attach(sourceEl, targetEl)  — start sync; replaces any previous attachment
 *   detach()                    — stop sync and clean up
 *   isActive()                  → boolean
 */
window.LGH.ScrollSync = (function () {
  let _sourceEl  = null;
  let _targetEl  = null;
  let _handler   = null;
  let _active    = false;
  let _syncing   = false; // re-entrancy guard

  function attach(sourceScrollEl, targetScrollEl) {
    detach();
    if (!sourceScrollEl || !targetScrollEl) return;

    _sourceEl = sourceScrollEl;
    _targetEl = targetScrollEl;
    _active   = true;

    _handler = window.LGH.throttle(_onScroll, 32);
    _sourceEl.addEventListener('scroll', _handler, { passive: true });
  }

  function _onScroll() {
    if (_syncing || !_sourceEl || !_targetEl) return;
    const src = _sourceEl;
    const tgt = _targetEl;

    const srcRange = src.scrollHeight - src.clientHeight;
    if (srcRange <= 0) return;

    const ratio = Math.min(1, Math.max(0, src.scrollTop / srcRange));
    const tgtRange = tgt.scrollHeight - tgt.clientHeight;
    if (tgtRange <= 0) return;

    _syncing = true;
    tgt.scrollTop = ratio * tgtRange;
    // Use rAF to clear the guard after the browser has painted
    requestAnimationFrame(() => { _syncing = false; });
  }

  function detach() {
    if (_sourceEl && _handler) {
      _sourceEl.removeEventListener('scroll', _handler);
    }
    _sourceEl = null;
    _targetEl = null;
    _handler  = null;
    _active   = false;
    _syncing  = false;
  }

  function isActive() { return _active; }

  return { attach, detach, isActive };
})();
