window.LGH = window.LGH || {};

/**
 * _makeScrollSync — factory that returns an independent scroll-sync instance.
 *
 * Strategy: ratio-based sync.
 *   ratio = source.scrollTop / (source.scrollHeight - source.clientHeight)
 *   target.scrollTop = ratio * (target.scrollHeight - target.clientHeight)
 *
 * The scroll listener is throttled to 32 ms.
 * A _syncing flag prevents feedback loops.
 *
 * Two instances are created:
 *   window.LGH.ScrollSync     — LinkedIn detail scroll ↔ right panel body
 *   window.LGH.ListScrollSync — LinkedIn list scroll   ↔ left panel body
 */
function _makeScrollSync() {
  let _sourceEl = null;
  let _targetEl = null;
  let _handler  = null;
  let _active   = false;
  let _syncing  = false;

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

    const srcRange = _sourceEl.scrollHeight - _sourceEl.clientHeight;
    if (srcRange <= 0) return;

    const ratio    = Math.min(1, Math.max(0, _sourceEl.scrollTop / srcRange));
    const tgtRange = _targetEl.scrollHeight - _targetEl.clientHeight;
    if (tgtRange <= 0) return;

    _syncing = true;
    _targetEl.scrollTop = ratio * tgtRange;
    requestAnimationFrame(() => { _syncing = false; });
  }

  function detach() {
    if (_sourceEl && _handler) _sourceEl.removeEventListener('scroll', _handler);
    _sourceEl = null;
    _targetEl = null;
    _handler  = null;
    _active   = false;
    _syncing  = false;
  }

  function isActive() { return _active; }

  return { attach, detach, isActive };
}

// Detail panel scroll sync (LinkedIn detail scroll → right panel body)
window.LGH.ScrollSync     = _makeScrollSync();

// List panel scroll sync (LinkedIn list scroll → left panel body)
window.LGH.ListScrollSync = _makeScrollSync();
