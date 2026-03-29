/**
 * background.js — MV3 Service Worker (ES module).
 *
 * Responsibilities:
 *  - Receive TRANSLATE messages from content scripts.
 *  - Check the LRU cache before calling the translation API.
 *  - Call the appropriate translator (DeepL primary, Google stub).
 *  - If no API key is configured, return original text unchanged (identity mode).
 *  - Respond with TRANSLATE_RESULT or TRANSLATE_ERROR.
 *
 * Message protocol (content → background):
 *   { type: "TRANSLATE", jobId, scope: "LIST"|"DETAIL", payload }
 *
 *   LIST payload:
 *     { text: string, structured: { title, company, location, snippet } }
 *
 *   DETAIL payload:
 *     { meta: { title, company, location }, blocks: [{type, level?, text, index}] }
 *
 * Message protocol (background → content, via sendResponse):
 *   LIST result:
 *     { type: "TRANSLATE_RESULT", jobId, scope: "LIST",
 *       translated: { title, company, location, snippet } }
 *
 *   DETAIL result:
 *     { type: "TRANSLATE_RESULT", jobId, scope: "DETAIL",
 *       translated: {
 *         meta: {
 *           title:    { original, translated },
 *           company:  { original, translated },
 *           location: { original, translated },
 *         },
 *         blocks: [{type, level?, text (translated), index}]
 *       }
 *     }
 */

import * as Cache  from './cache/translationCache.js';
import * as DeepL  from './translator/deepl.js';
import * as Google from './translator/google.js';

const LOG = '[LGH-BG]';

// ── Settings ───────────────────────────────────────────────────────────────

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      ['lgh_apiKey', 'lgh_targetLang', 'lgh_provider'],
      resolve
    );
  });
}

// ── Translation dispatcher ─────────────────────────────────────────────────

/**
 * Translate an array of texts in batches.
 * Falls back to identity (original text) when apiKey is absent.
 *
 * @param {string[]} texts
 * @param {string}   targetLang
 * @param {string}   apiKey
 * @param {string}   provider  — 'deepl' | 'google'
 * @returns {Promise<string[]>}
 */
async function callTranslator(texts, targetLang, apiKey, provider) {
  if (!apiKey) {
    // Caller must check apiKey before reaching here; this is a safety net.
    throw new Error('NO_API_KEY');
  }

  const BATCH   = 50;
  const results = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH);
    const translated = provider === 'google'
      ? await Google.translate(chunk, targetLang, apiKey)
      : await DeepL.translate(chunk, targetLang, apiKey);
    results.push(...translated);
  }

  return results;
}

// ── LIST scope handler ─────────────────────────────────────────────────────

async function handleList(jobId, payload, settings) {
  const {
    lgh_apiKey:     apiKey     = '',
    lgh_targetLang: targetLang = 'KO',
    lgh_provider:   provider   = 'deepl',
  } = settings;

  // Explicit early-return for missing API key so the panel shows a clear message
  if (!apiKey) {
    console.log(LOG, 'LIST no API key for job', jobId);
    return {
      type: 'TRANSLATE_ERROR', jobId, scope: 'LIST',
      error: 'NO_API_KEY: Open extension Options to add your DeepL or Google API key',
    };
  }

  const text       = (payload && payload.text)       || '';
  const structured = (payload && payload.structured) || {};

  if (!text) {
    return { type: 'TRANSLATE_RESULT', jobId, scope: 'LIST', translated: structured };
  }

  // Cache check — key includes targetLang so different languages get separate entries
  const cached = await Cache.get(text, targetLang);
  if (cached) {
    console.log(LOG, 'cache hit LIST', jobId);
    return { type: 'TRANSLATE_RESULT', jobId, scope: 'LIST', translated: cached };
  }

  const parts = [
    structured.title    || '',
    structured.company  || '',
    structured.location || '',
    structured.snippet  || '',
  ];

  const results = await callTranslator(parts, targetLang, apiKey, provider);

  const translated = {
    title:    results[0] !== undefined ? results[0] : parts[0],
    company:  results[1] !== undefined ? results[1] : parts[1],
    location: results[2] !== undefined ? results[2] : parts[2],
    snippet:  results[3] !== undefined ? results[3] : parts[3],
  };

  if (apiKey) await Cache.set(text, targetLang, translated);

  return { type: 'TRANSLATE_RESULT', jobId, scope: 'LIST', translated };
}

// ── DETAIL scope handler ───────────────────────────────────────────────────

async function handleDetail(jobId, payload, settings) {
  const {
    lgh_apiKey:     apiKey     = '',
    lgh_targetLang: targetLang = 'KO',
    lgh_provider:   provider   = 'deepl',
  } = settings;

  // Explicit early-return for missing API key so the panel shows a clear message
  if (!apiKey) {
    console.log(LOG, 'DETAIL no API key for job', jobId);
    return {
      type: 'TRANSLATE_ERROR', jobId, scope: 'DETAIL',
      error: 'NO_API_KEY: Open extension Options to add your DeepL or Google API key',
    };
  }

  // payload = { meta: {title, company, location}, blocks: [...] }
  const meta   = (payload && payload.meta)   || {};
  const blocks = (payload && payload.blocks) || [];

  console.log(LOG, 'DETAIL request — job:', jobId,
    '| targetLang:', targetLang,
    '| provider:', provider,
    '| blocks:', blocks.length,
    '| meta title:', (meta.title || '').slice(0, 40));

  const metaTexts = [
    meta.title    || '',
    meta.company  || '',
    meta.location || '',
  ];
  const bodyTexts = blocks.map(b => b.text || '');
  const allTexts  = [...metaTexts, ...bodyTexts];

  if (allTexts.every(t => !t)) {
    console.warn(LOG, 'DETAIL: all texts empty for job', jobId);
    return {
      type: 'TRANSLATE_RESULT', jobId, scope: 'DETAIL',
      translated: { meta: {}, blocks: [] },
    };
  }

  // Cache key covers all content (meta + body) so any text change invalidates it
  const cacheKey = allTexts.join('\n');
  const cached   = await Cache.get(cacheKey, targetLang);
  if (cached) {
    console.log(LOG, 'cache hit DETAIL', jobId);
    return { type: 'TRANSLATE_RESULT', jobId, scope: 'DETAIL', translated: cached };
  }

  // Translate meta + body in a single batch for context preservation
  const allTranslated = await callTranslator(allTexts, targetLang, apiKey, provider);

  const [tTitle, tCompany, tLocation, ...tBodyTexts] = allTranslated;

  const translatedMeta = {
    title:    { original: meta.title    || '', translated: tTitle    || '' },
    company:  { original: meta.company  || '', translated: tCompany  || '' },
    location: { original: meta.location || '', translated: tLocation || '' },
  };

  const translatedBlocks = blocks.map((b, i) => ({
    ...b,
    text: tBodyTexts[i] !== undefined ? tBodyTexts[i] : b.text,
  }));

  const result = { meta: translatedMeta, blocks: translatedBlocks };
  await Cache.set(cacheKey, targetLang, result);

  console.log(LOG, 'DETAIL response — job:', jobId,
    '| translated blocks:', translatedBlocks.length,
    '| targetLang:', targetLang);

  return { type: 'TRANSLATE_RESULT', jobId, scope: 'DETAIL', translated: result };
}

// ── SELECTION scope handler ────────────────────────────────────────────────

/**
 * Translate a single user-selected text string.
 * Uses a namespaced cache key (prefix '\x00sel\x00') to avoid collisions
 * with LIST / DETAIL cache entries.
 */
async function handleSelection(jobId, payload, settings) {
  const {
    lgh_apiKey:     apiKey     = '',
    lgh_targetLang: targetLang = 'KO',
    lgh_provider:   provider   = 'deepl',
  } = settings;

  if (!apiKey) {
    return { type: 'TRANSLATE_ERROR', jobId, scope: 'SELECTION', error: 'NO_API_KEY' };
  }

  const text = (payload && payload.text) || '';
  if (!text) {
    return { type: 'TRANSLATE_RESULT', jobId, scope: 'SELECTION', translated: '' };
  }

  const cacheKey = '\x00sel\x00' + text;
  const cached   = await Cache.get(cacheKey, targetLang);
  if (typeof cached === 'string') {
    console.log(LOG, 'cache hit SELECTION');
    return { type: 'TRANSLATE_RESULT', jobId, scope: 'SELECTION', translated: cached };
  }

  const results    = await callTranslator([text], targetLang, apiKey, provider);
  const translated = results[0] || '';
  await Cache.set(cacheKey, targetLang, translated);

  return { type: 'TRANSLATE_RESULT', jobId, scope: 'SELECTION', translated };
}

// ── Message listener ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'TRANSLATE') return false;

  const { jobId, scope, payload } = msg;

  (async () => {
    let settings;
    try {
      settings = await getSettings();
    } catch (_) {
      settings = {};
    }

    try {
      let response;
      if (scope === 'LIST') {
        response = await handleList(jobId, payload, settings);
      } else if (scope === 'DETAIL') {
        response = await handleDetail(jobId, payload, settings);
      } else if (scope === 'SELECTION') {
        response = await handleSelection(jobId, payload, settings);
      } else {
        response = { type: 'TRANSLATE_ERROR', jobId, scope, error: `Unknown scope: ${scope}` };
      }
      sendResponse(response);
    } catch (err) {
      console.error(LOG, 'error handling', scope, jobId, err.message);
      sendResponse({ type: 'TRANSLATE_ERROR', jobId, scope, error: err.message });
    }
  })();

  return true; // keep sendResponse channel open for async response
});
