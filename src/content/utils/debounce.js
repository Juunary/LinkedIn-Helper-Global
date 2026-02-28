window.LGH = window.LGH || {};

/**
 * Returns a debounced version of fn that delays execution until after `delay` ms
 * of no calls. Used for MutationObserver reflow scheduling.
 * @param {Function} fn
 * @param {number} delay  milliseconds
 * @returns {Function}
 */
window.LGH.debounce = function debounce(fn, delay) {
  let timerId = null;
  return function debounced(...args) {
    if (timerId !== null) clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      fn.apply(this, args);
    }, delay);
  };
};
