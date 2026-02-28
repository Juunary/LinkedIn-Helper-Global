/**
 * translationCache.js — Simple LRU translation cache backed by chrome.storage.local.
 *
 * Cache key format:  lgh_c_<hash(text|targetLang|PROVIDER_VER)>
 * Index key:         lgh_cache_index   (ordered array of cache keys, oldest first)
 *
 * LRU policy:
 *  - On set: move key to end of index array (most recently used).
 *  - If index exceeds MAX_ENTRIES: evict from the front.
 *
 * Exported functions:
 *   get(text, targetLang)           → Promise<value | null>
 *   set(text, targetLang, value)    → Promise<void>
 *   clearAll()                      → Promise<void>
 */

const CACHE_PREFIX   = 'lgh_c_';
const INDEX_KEY      = 'lgh_cache_index';
const MAX_ENTRIES    = 500;
const PROVIDER_VER   = 'v1';

function _hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function _makeKey(text, targetLang) {
  return CACHE_PREFIX + _hash(text + '|' + targetLang + '|' + PROVIDER_VER);
}

async function _getIndex() {
  return new Promise(resolve => {
    chrome.storage.local.get(INDEX_KEY, result => {
      resolve(Array.isArray(result[INDEX_KEY]) ? result[INDEX_KEY] : []);
    });
  });
}

async function _setIndex(index) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [INDEX_KEY]: index }, resolve);
  });
}

/**
 * Retrieve a cached translation.
 * @param {string} text
 * @param {string} targetLang
 * @returns {Promise<any|null>}
 */
async function get(text, targetLang) {
  const key = _makeKey(text, targetLang);
  return new Promise(resolve => {
    chrome.storage.local.get(key, result => {
      resolve(Object.prototype.hasOwnProperty.call(result, key) ? result[key] : null);
    });
  });
}

/**
 * Store a translation result, updating the LRU index.
 * @param {string} text
 * @param {string} targetLang
 * @param {any}    value
 * @returns {Promise<void>}
 */
async function set(text, targetLang, value) {
  const key   = _makeKey(text, targetLang);
  const index = await _getIndex();

  // Move key to end (most-recently-used position)
  const pos = index.indexOf(key);
  if (pos !== -1) index.splice(pos, 1);
  index.push(key);

  // Evict oldest entries if over limit
  const toEvict = index.splice(0, Math.max(0, index.length - MAX_ENTRIES));
  if (toEvict.length > 0) {
    await new Promise(resolve => chrome.storage.local.remove(toEvict, resolve));
  }

  // Persist the new entry and updated index atomically
  await new Promise(resolve => {
    chrome.storage.local.set({ [key]: value, [INDEX_KEY]: index }, resolve);
  });
}

/**
 * Remove all cache entries and reset the index.
 * @returns {Promise<void>}
 */
async function clearAll() {
  const index = await _getIndex();
  const toRemove = [...index, INDEX_KEY];
  await new Promise(resolve => chrome.storage.local.remove(toRemove, resolve));
}

export { get, set, clearAll };
