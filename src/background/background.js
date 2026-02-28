/**
 * background.js — MV3 Service Worker (ES module).
 *
 * Responsibilities:
 *  - Receive TRANSLATE messages from content scripts.
 *  - Check the LRU cache before calling the translation API.
 *  - Call the appropriate translator (DeepL | Google).
 *  - If no API key is configured, return the original text unchanged (identity mode).
 *  - Respond with TRANSLATE_RESULT or TRANSLATE_ERROR.
 *
 * Message protocol (content → background):
 *   { type: "TRANSLATE", jobId, scope: "LIST"|"DETAIL", payload }
 *     LIST payload:   { text: string, structured: { title, company, location, snippet } }
 *     DETAIL payload: { blocks: [{type, level?, text, index}] }
 *
 * Message protocol (background → content, via sendResponse):
 *   { type: "TRANSLATE_RESULT", jobId, scope, translated }
 *   { type: "TRANSLATE_ERROR",  jobId, scope, error }
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
 * @param {string[]} texts
 * @param {string}   targetLang
 * @param {string}   apiKey
 * @param {string}   provider  — 'deepl' | 'google'
 * @returns {Promise<string[]>}
 */
async function callTranslator(texts, targetLang, apiKey, provider) {
  if (!apiKey) {
    // Identity fallback — works for testing without any API key
    return texts.map(t => t);
  }

  const BATCH = 50; // max texts per API call
  const results = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH);
    let translated;
    if (provider === 'google') {
      translated = await Google.translate(chunk, targetLang, apiKey);
    } else {
      translated = await DeepL.translate(chunk, targetLang, apiKey);
    }
    results.push(...translated);
  }

  return results;
}

// ── LIST scope handler ─────────────────────────────────────────────────────

async function handleList(jobId, payload, settings) {
  const { lgh_apiKey: apiKey = '', lgh_targetLang: targetLang = 'KO', lgh_provider: provider = 'deepl' } = settings;

  const text       = (payload && payload.text)       || '';
  const structured = (payload && payload.structured) || {};

  if (!text) {
    return { type: 'TRANSLATE_RESULT', jobId, scope: 'LIST', translated: structured };
  }

  // Cache check
  const cached = await Cache.get(text, targetLang);
  if (cached) {
    console.log(LOG, 'cache hit LIST', jobId);
    return { type: 'TRANSLATE_RESULT', jobId, scope: 'LIST', translated: cached };
  }

  // Build parts array for translation
  const parts = [
    structured.title    || '',
    structured.company  || '',
    structured.location || '',
    structured.snippet  || '',
  ];

  let translated;
  try {
    const results = await callTranslator(parts, targetLang, apiKey, provider);
    translated = {
      title:    results[0] !== undefined ? results[0] : parts[0],
      company:  results[1] !== undefined ? results[1] : parts[1],
      location: results[2] !== undefined ? results[2] : parts[2],
      snippet:  results[3] !== undefined ? results[3] : parts[3],
    };
  } catch (err) {
    throw err;
  }

  // Only cache when we had an actual API key (not identity)
  if (apiKey) await Cache.set(text, targetLang, translated);

  return { type: 'TRANSLATE_RESULT', jobId, scope: 'LIST', translated };
}

// ── DETAIL scope handler ───────────────────────────────────────────────────

async function handleDetail(jobId, payload, settings) {
  const { lgh_apiKey: apiKey = '', lgh_targetLang: targetLang = 'KO', lgh_provider: provider = 'deepl' } = settings;

  const blocks = (payload && payload.blocks) || [];

  if (blocks.length === 0) {
    return { type: 'TRANSLATE_RESULT', jobId, scope: 'DETAIL', translated: { blocks: [] } };
  }

  // Cache key = hash of all block texts concatenated
  const cacheText = blocks.map(b => b.text).join('\n');
  const cached = await Cache.get(cacheText, targetLang);
  if (cached) {
    console.log(LOG, 'cache hit DETAIL', jobId);
    return { type: 'TRANSLATE_RESULT', jobId, scope: 'DETAIL', translated: cached };
  }

  const texts = blocks.map(b => b.text || '');
  let translatedTexts;

  try {
    translatedTexts = await callTranslator(texts, targetLang, apiKey, provider);
  } catch (err) {
    throw err;
  }

  const translatedBlocks = blocks.map((b, i) => ({
    ...b,
    text: translatedTexts[i] !== undefined ? translatedTexts[i] : b.text,
  }));

  const result = { blocks: translatedBlocks };
  if (apiKey) await Cache.set(cacheText, targetLang, result);

  return { type: 'TRANSLATE_RESULT', jobId, scope: 'DETAIL', translated: result };
}

// ── Message listener ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'TRANSLATE') return false;

  const { jobId, scope, payload } = msg;

  // Return true immediately to keep the message channel open for async response
  (async () => {
    let settings;
    try {
      settings = await getSettings();
    } catch (err) {
      settings = {};
    }

    try {
      let response;
      if (scope === 'LIST') {
        response = await handleList(jobId, payload, settings);
      } else if (scope === 'DETAIL') {
        response = await handleDetail(jobId, payload, settings);
      } else {
        response = { type: 'TRANSLATE_ERROR', jobId, scope, error: `Unknown scope: ${scope}` };
      }
      sendResponse(response);
    } catch (err) {
      console.error(LOG, 'error handling', scope, jobId, err.message);
      sendResponse({ type: 'TRANSLATE_ERROR', jobId, scope, error: err.message });
    }
  })();

  return true; // keep sendResponse channel open
});
