window.LGH = window.LGH || {};

/**
 * Extract structured translation blocks from a job detail container element.
 *
 * Returns an ordered array of block objects:
 *   { type: 'heading'|'paragraph'|'list-item'|'label', level?: number, text: string, index: number }
 *
 * Block types map to rendering classes:
 *   heading (level 1|2|3) → h1/h2/subheading style
 *   paragraph             → body text
 *   list-item             → bulleted line
 *   label                 → secondary metadata (company, location)
 *
 * @param {Element} detailEl
 * @returns {Array<{type:string, level?:number, text:string, index:number}>}
 */
window.LGH.extractDetailBlocks = function extractDetailBlocks(detailEl) {
  if (!detailEl) return [];

  const blocks = [];
  let idx = 0;

  function push(type, text, level) {
    const t = (text || '').trim();
    if (!t || t.length < 2) return;
    const block = { type, text: t, index: idx++ };
    if (level !== undefined) block.level = level;
    blocks.push(block);
  }

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

  // ── Job title ──────────────────────────────────────────────────────────────
  const title = firstText([
    '.job-details-jobs-unified-top-card__job-title h1',
    '.jobs-unified-top-card__job-title h1',
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    'h1',
    'h2',
  ]);
  if (title) push('heading', title, 1);

  // ── Company / location metadata ────────────────────────────────────────────
  const meta = firstText([
    '.job-details-jobs-unified-top-card__primary-description-container',
    '.jobs-unified-top-card__subtitle-primary-grouping',
    '.jobs-unified-top-card__company-name',
    '.job-details-jobs-unified-top-card__company-name',
  ]);
  if (meta) push('label', meta);

  // ── Job description body ───────────────────────────────────────────────────
  const descEl = detailEl.querySelector([
    '.jobs-description-content__text',
    '.jobs-description__content .jobs-box__html-content',
    '#job-details',
    '.jobs-description-content',
    '.job-description',
    '[class*="description-content"]',
    '[class*="job-description"]',
  ].join(','));

  if (descEl) {
    walkNode(descEl, push);
  } else {
    // Fallback: grab all visible text from the container
    const fallback = (detailEl.textContent || '').trim();
    if (fallback.length > 10) push('paragraph', fallback.slice(0, 3000));
  }

  return blocks;
};

/**
 * Recursively walk a DOM subtree, converting semantic elements to blocks.
 * Avoids duplicating text that has already been captured by a parent node.
 */
function walkNode(node, push) {
  if (!node) return;

  const BLOCK_TAGS = new Set(['div', 'section', 'article', 'main', 'aside', 'figure']);
  const SKIP_TAGS  = new Set(['script', 'style', 'noscript', 'svg', 'img', 'button', 'input']);

  for (const child of node.childNodes) {
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

    if (tag === 'h1') {
      push('heading', text, 1);
    } else if (tag === 'h2') {
      push('heading', text, 2);
    } else if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      push('heading', text, 3);
    } else if (tag === 'strong' || tag === 'b') {
      // Treat lone <strong> as a sub-heading only when it's a direct meaningful block
      if (!child.closest('p, li')) push('heading', text, 3);
    } else if (tag === 'ul' || tag === 'ol') {
      for (const li of child.querySelectorAll('li')) {
        const liText = (li.textContent || '').trim();
        if (liText) push('list-item', liText);
      }
    } else if (tag === 'li') {
      push('list-item', text);
    } else if (tag === 'p') {
      // Paragraph — recurse only if it has sub-structure; otherwise treat as atomic
      const hasSub = child.querySelector('ul, ol, h1, h2, h3, h4, h5, h6');
      if (hasSub) walkNode(child, push);
      else push('paragraph', text);
    } else if (BLOCK_TAGS.has(tag)) {
      // Only recurse if the block contains sub-structure; avoid double-capturing
      const hasSub = child.querySelector('p, ul, ol, h1, h2, h3, h4, h5, h6, strong, b');
      if (hasSub) walkNode(child, push);
      else if (text.length > 2) push('paragraph', text);
    } else if (tag === 'span' || tag === 'a') {
      // Inline elements — only capture if they carry significant standalone text
      if (text.length > 10 && !child.parentElement?.closest('p, li, h1, h2, h3, h4, h5, h6')) {
        push('paragraph', text);
      }
    }
  }
}
