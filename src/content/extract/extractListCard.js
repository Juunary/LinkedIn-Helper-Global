window.LGH = window.LGH || {};

/**
 * Extract a concise, translatable text payload from a LinkedIn job list card element.
 *
 * Returns { title, company, location, snippet, raw }
 * where `raw` is a pipe-joined string suitable for sending to the translator,
 * and the individual fields allow structured re-rendering after translation.
 *
 * Uses multiple selector fallbacks to survive LinkedIn DOM changes.
 *
 * @param {Element} cardEl
 * @returns {{ title:string, company:string, location:string, snippet:string, raw:string }|null}
 */
window.LGH.extractListCard = function extractListCard(cardEl) {
  if (!cardEl) return null;

  function first(selectors) {
    for (const sel of selectors) {
      try {
        const el = cardEl.querySelector(sel);
        if (el) {
          const text = (el.textContent || '').trim();
          if (text) return text;
        }
      } catch (_) { /* bad selector — skip */ }
    }
    return '';
  }

  const title = first([
    '.job-card-list__title--link',
    '.job-card-list__title',
    '.job-card-container__link strong',
    '.jobs-unified-top-card__job-title',
    'a[aria-label] strong',
    'h3',
    'h4',
  ]);

  const company = first([
    '.job-card-container__company-name',
    '.job-card-list__company-name',
    '.job-card-container__primary-description',
    '.artdeco-entity-lockup__subtitle span',
    '.job-card-container__subtitle',
  ]);

  const location = first([
    '.job-card-container__metadata-item--workplace-type',
    '.job-card-container__metadata-item',
    '.job-card-list__footer-wrapper li:first-child',
    '.artdeco-entity-lockup__caption li',
    '[class*="workplace-type"]',
    '[class*="location"]',
  ]);

  const snippet = first([
    '.job-card-list__insight strong',
    '.job-card-container__insight',
    '.job-card-container__metadata-wrapper',
    '.job-card-list__insight',
  ]).slice(0, 200);

  const raw = [title, company, location, snippet]
    .filter(Boolean)
    .join(' | ');

  return { title, company, location, snippet, raw };
};
