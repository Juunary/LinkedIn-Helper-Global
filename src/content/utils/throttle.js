window.LGH = window.LGH || {};

/**
 * Returns a throttled version of fn that executes at most once per `delay` ms.
 * Uses timestamp comparison — safe for scroll/resize handlers.
 * @param {Function} fn
 * @param {number} delay  milliseconds (16–50 recommended for scroll)
 * @returns {Function}
 */
window.LGH.throttle = function throttle(fn, delay) {
  let lastTime = 0;
  return function throttled(...args) {
    const now = Date.now();
    if (now - lastTime >= delay) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
};
