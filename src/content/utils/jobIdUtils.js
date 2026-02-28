window.LGH = window.LGH || {};

/**
 * Utilities for extracting a stable, unique job identifier from DOM elements and URLs.
 *
 * Priority order:
 *  1. data-job-id attribute (on card or child element)
 *  2. data-occludable-job-id attribute
 *  3. data-entity-urn attribute (parse numeric part)
 *  4. href parsing — /jobs/view/(\d+)/
 *  5. Hash fallback using visible text
 */
window.LGH.jobIdUtils = {

  /**
   * Extract a stable job ID from a list card element.
   * @param {Element} cardEl
   * @returns {string|null}
   */
  extractFromCard(cardEl) {
    if (!cardEl) return null;

    // 1. Direct data attributes on the card itself
    const directAttrs = [
      'data-job-id',
      'data-occludable-job-id',
      'data-entity-urn',
      'data-job-listing-id',
    ];
    for (const attr of directAttrs) {
      const val = cardEl.getAttribute(attr);
      if (val) return this._cleanId(val);
    }

    // 2. Same attributes on any descendant
    for (const attr of directAttrs) {
      const child = cardEl.querySelector(`[${attr}]`);
      if (child) {
        const val = child.getAttribute(attr);
        if (val) return this._cleanId(val);
      }
    }

    // 3. Parse from any job-view href inside the card
    const link = cardEl.querySelector('a[href*="/jobs/view/"]');
    if (link) {
      const id = this._parseFromHref(link.href);
      if (id) return id;
    }

    // 4. Hash fallback using trimmed text content
    const text = (cardEl.textContent || '').trim().slice(0, 150);
    if (text.length > 5) return 'hash_' + this._simpleHash(text);

    return null;
  },

  /**
   * Extract job ID from a URL string (defaults to current page URL).
   *
   * Handles both layouts:
   *   - Detail page:   /jobs/view/4376268589/
   *   - Two-pane search: /jobs/search/?currentJobId=4376268589
   *
   * @param {string} [url]
   * @returns {string|null}
   */
  extractFromUrl(url) {
    const href = url || location.href;

    // 1. Query param currentJobId — two-pane search layout
    try {
      const u = new URL(href);
      const qid = u.searchParams.get('currentJobId');
      if (qid && /^\d{5,}$/.test(qid)) return qid;
    } catch (_) {}

    // 2. Path-based /jobs/view/(\d+)
    return this._parseFromHref(href);
  },

  _parseFromHref(href) {
    if (!href) return null;
    const m = href.match(/\/jobs\/view\/(\d+)/);
    return m ? m[1] : null;
  },

  _cleanId(val) {
    // Strip urn prefix like "urn:li:fs_normalized_jobPosting:1234567890"
    const numMatch = String(val).match(/(\d{7,})/);
    if (numMatch) return numMatch[1];
    return String(val).replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 64) || null;
  },

  _simpleHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  },
};
