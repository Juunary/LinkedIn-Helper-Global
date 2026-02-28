/**
 * google.js — Google Cloud Translation API adapter (stub).
 *
 * This is a placeholder. To use it, replace the stub body with a real
 * call to the official Google Cloud Translation v2 or v3 API.
 *
 * Exported:
 *   translate(texts, targetLang, apiKey) → Promise<string[]>
 */

/**
 * @param {string[]} texts
 * @param {string}   targetLang
 * @param {string}   apiKey
 * @returns {Promise<string[]>}
 */
async function translate(texts, targetLang, apiKey) {
  // TODO: implement with Google Cloud Translation API
  // Reference: https://cloud.google.com/translate/docs/reference/rest/v2/translations/list
  //
  // Example endpoint:
  //   POST https://translation.googleapis.com/language/translate/v2?key=<apiKey>
  //   body: { q: texts, target: targetLang, format: "text" }
  //
  // For now, return identity (original text) so the extension stays functional.
  console.warn('[LGH-BG] Google translator is a stub — returning original text');
  return texts.map(t => t);
}

export { translate };
