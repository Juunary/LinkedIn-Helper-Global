/**
 * deepl.js — DeepL translation API adapter.
 *
 * Supports both Free tier (api-free.deepl.com, key ends with ":fx")
 * and Pro tier (api.deepl.com).
 *
 * Exported:
 *   translate(texts, targetLang, apiKey) → Promise<string[]>
 *     texts      — array of plain-text strings to translate
 *     targetLang — ISO language code e.g. "KO", "EN", "DE"
 *     apiKey     — DeepL auth key
 *   Throws on HTTP error or if apiKey is absent.
 */

const ENDPOINT_FREE = 'https://api-free.deepl.com/v2/translate';
const ENDPOINT_PRO  = 'https://api.deepl.com/v2/translate';

/**
 * @param {string[]} texts
 * @param {string}   targetLang
 * @param {string}   apiKey
 * @returns {Promise<string[]>}
 */
async function translate(texts, targetLang, apiKey) {
  if (!apiKey)            throw new Error('NO_API_KEY');
  if (!texts || texts.length === 0) return [];

  const endpoint = apiKey.trim().endsWith(':fx') ? ENDPOINT_FREE : ENDPOINT_PRO;

  // Build application/x-www-form-urlencoded body
  const params = new URLSearchParams();
  params.append('target_lang', targetLang.toUpperCase());
  params.append('tag_handling', 'text');
  for (const t of texts) {
    params.append('text', String(t));
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey.trim()}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch (_) {}
    throw new Error(`DeepL HTTP ${response.status}: ${detail.slice(0, 200)}`);
  }

  const json = await response.json();

  if (!json.translations) {
    throw new Error('DeepL returned unexpected response structure');
  }

  return json.translations.map(t => t.text);
}

export { translate };
