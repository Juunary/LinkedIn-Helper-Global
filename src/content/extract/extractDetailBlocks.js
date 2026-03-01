window.LGH = window.LGH || {};

/**
 * Extract structured translation payload from a job detail container element.
 *
 * Returns:
 *   {
 *     meta: { title: string, company: string, location: string },
 *     blocks: Array<{ type, level?, text, index }>
 *   }
 *
 * - meta  : top-card fields rendered with original + translated (dual-line)
 * - blocks: description body rendered as translated-only text
 *
 * Block types: heading (level 1|2|3), paragraph, list-item
 *
 * @param {Element} detailEl
 * @returns {{ meta: {title:string, company:string, location:string}, blocks: Array }}
 */
window.LGH.extractDetailBlocks = function extractDetailBlocks(detailEl) {
  if (!detailEl) return { meta: { title: '', company: '', location: '' }, blocks: [] };

  const LOG = '[LGH-extract]';

  // ── Helpers ────────────────────────────────────────────────────────────────

  function firstText(selectors) {
    for (const sel of selectors) {
      try {
        const el = detailEl.querySelector(sel);
        if (el) {
          const t = (el.textContent || '').trim();
          if (t) return t;
        }
      } catch (_) {}
    }
    return '';
  }

  // ── Meta extraction (top-card fields) ─────────────────────────────────────

  const title = firstText([
    '.job-details-jobs-unified-top-card__job-title h1',
    '.jobs-unified-top-card__job-title h1',
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    'h1',
    'h2',
  ]);

  const company = firstText([
    '.job-details-jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__company-name',
    '[class*="company-name"]',
  ]);

  const location = firstText([
    '.job-details-jobs-unified-top-card__bullet',
    '.jobs-unified-top-card__bullet',
    '.job-details-jobs-unified-top-card__workplace-type',
    '.jobs-unified-top-card__workplace-type',
    '[class*="workplace-type"]',
    '[class*="tertiary-description"]',
  ]);

  const meta = { title, company, location };

  // ── Description body extraction ────────────────────────────────────────────

  const blocks = [];
  let idx = 0;

  function push(type, text, level) {
    const t = (text || '').trim();
    if (!t || t.length < 2) return;
    const block = { type, text: t, index: idx++ };
    if (level !== undefined) block.level = level;
    blocks.push(block);
  }

  // Try each selector in PRIORITY ORDER and use the first one with real content.
  // IMPORTANT: do NOT combine with join(',') — querySelector returns the first
  // element in DOM order, not the first matching selector. We need selector priority.
  //
  // NOTE on class matching: [class*="job-description"] does NOT match
  // "jobs-description__details" because "job-description" ≠ "jobs-description"
  // (the leading 's' breaks substring match). Selectors must be explicit.
  const DESC_SELECTORS = [
    // Current LinkedIn layout (2024-2026): the description wrapper
    '.jobs-description__details',
    // Alternate container names observed in the wild
    '[class*="jobs-description__details"]',
    '#job-details',
    '.jobs-description-content__text',
    '.jobs-box__html-content',
    '.jobs-description__content',
    '.jobs-description-content',
    '.jobs-description__container',
    '[class*="jobs-description__container"]',
    '[class*="jobs-description-content"]',
  ];

  const MIN_DESC_CHARS = 30;
  let descEl = null;

  for (const sel of DESC_SELECTORS) {
    try {
      const el = detailEl.querySelector(sel);
      if (el && (el.textContent || '').trim().length >= MIN_DESC_CHARS) {
        descEl = el;
        break;
      }
    } catch (_) {}
  }

  console.log(LOG, 'descEl found:', descEl ? (descEl.className || descEl.tagName) : 'none',
    '| text length:', descEl ? (descEl.textContent || '').trim().length : 0);

  if (descEl) {
    walkNode(descEl, push);

    // If walkNode produced no blocks (span-only flat structure), fall back to
    // innerText-based paragraph splitting which handles any inline DOM shape.
    if (blocks.length === 0) {
      console.log(LOG, 'walkNode found 0 blocks — using innerText fallback');
      _innerTextFallback(descEl, push);
    }
  } else {
    // Last resort: strip meta from full container text and use what's left
    console.warn(LOG, 'no description element found — using full-container fallback');
    const full = (detailEl.innerText || detailEl.textContent || '').trim();
    const stripped = full
      .replace(title, '')
      .replace(company, '')
      .replace(location, '')
      .trim();
    if (stripped.length > 10) _parseInnerText(stripped, push);
  }

  console.log(LOG, 'extracted blocks:', blocks.length,
    '| meta title:', title ? title.slice(0, 40) : '(none)');

  return { meta, blocks };
};

/**
 * innerText-based fallback for description containers that use only inline elements
 * (spans/anchors) with no semantic block structure.
 * Uses the browser's rendered text which respects CSS line breaks and visibility.
 *
 * @param {Element} el
 * @param {Function} push
 */
function _innerTextFallback(el, push) {
  // innerText respects CSS (hidden elements, br, block-level whitespace)
  const raw = (typeof el.innerText !== 'undefined' ? el.innerText : el.textContent) || '';
  _parseInnerText(raw, push);
}

/**
 * Split a raw text string (innerText output) into structured blocks.
 * Double newlines → paragraph breaks; "• …" or "- …" lines → list-items.
 *
 * @param {string} raw
 * @param {Function} push
 */
function _parseInnerText(raw, push) {
  // Normalise Windows line endings
  const normalised = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split on double+ newlines to get paragraph-clusters
  const paragraphs = normalised.split(/\n{2,}/);

  for (const para of paragraphs) {
    const lines = para.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    if (lines.length === 1) {
      // Single line — detect list bullet or plain paragraph
      const line = lines[0];
      if (/^[•\-–*]\s+/.test(line)) {
        push('list-item', line.replace(/^[•\-–*]\s+/, ''));
      } else {
        push('paragraph', line);
      }
    } else {
      // Multi-line block — check if all lines look like list items
      const allBullets = lines.every(l => /^[•\-–*]\s+/.test(l));
      if (allBullets) {
        for (const line of lines) {
          push('list-item', line.replace(/^[•\-–*]\s+/, ''));
        }
      } else {
        // Mixed or plain — join as one paragraph (preserves context for translation)
        push('paragraph', lines.join(' '));
      }
    }
  }
}

/**
 * Recursively walk a DOM subtree, converting semantic elements to translation blocks.
 * Handles both well-structured HTML (<p>/<ul>/<li>) and LinkedIn's span-heavy output.
 */
function walkNode(node, push) {
  if (!node) return;

  const BLOCK_TAGS = new Set(['div', 'section', 'article', 'main', 'aside', 'figure', 'header', 'footer']);
  const SKIP_TAGS  = new Set(['script', 'style', 'noscript', 'svg', 'img', 'button', 'input', 'select', 'textarea']);

  for (const child of node.childNodes) {
    // ── Text nodes ──────────────────────────────────────────────────────────
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent || '').trim();
      if (t.length > 2) push('paragraph', t);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = child.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;

    const text = (child.textContent || '').trim();
    if (!text) continue;

    // ── Semantic headings ────────────────────────────────────────────────────
    if (tag === 'h1') {
      push('heading', text, 1);
    } else if (tag === 'h2') {
      push('heading', text, 2);
    } else if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      push('heading', text, 3);

    // ── Bold/strong as sub-heading when not inside a list/para ──────────────
    } else if (tag === 'strong' || tag === 'b') {
      if (!child.closest('p, li')) push('heading', text, 3);

    // ── Lists — collect all li at any depth ──────────────────────────────────
    } else if (tag === 'ul' || tag === 'ol') {
      for (const li of child.querySelectorAll('li')) {
        // Only direct-child li (avoid double-counting nested lists)
        if (li.parentElement === child || li.parentElement.closest('ul,ol') === child) {
          const liText = (li.textContent || '').trim();
          if (liText) push('list-item', liText);
        }
      }
    } else if (tag === 'li') {
      push('list-item', text);

    // ── Paragraphs ────────────────────────────────────────────────────────────
    } else if (tag === 'p') {
      const hasSub = child.querySelector('ul, ol, h1, h2, h3, h4, h5, h6');
      if (hasSub) walkNode(child, push);
      else push('paragraph', text);

    // ── Block containers (div, section, article, …) ──────────────────────────
    } else if (BLOCK_TAGS.has(tag)) {
      const hasSemantic = child.querySelector('p, ul, ol, h1, h2, h3, h4, h5, h6, strong, b');
      if (hasSemantic) {
        walkNode(child, push);
      } else {
        // No semantic children — treat the whole block as one paragraph
        // (covers LinkedIn's span-only or text-in-div patterns)
        if (text.length > 2) push('paragraph', text);
      }

    // ── Inline elements (span, a, em, i, …) ─────────────────────────────────
    // Capture when they are direct content-level children (not already inside
    // a block element we are about to recurse into).
    } else {
      const isInsideBlock = child.parentElement &&
        child.parentElement.closest('p, li, h1, h2, h3, h4, h5, h6');
      if (!isInsideBlock && text.length > 5) {
        // Check if this inline element contains block children that should be walked
        const hasBlockChild = child.querySelector('p, ul, ol, h1, h2, h3, div, section');
        if (hasBlockChild) {
          walkNode(child, push);
        } else {
          push('paragraph', text);
        }
      }
    }
  }
}
