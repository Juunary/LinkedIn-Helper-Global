'use strict';

const STORAGE_KEYS = ['lgh_apiKey', 'lgh_targetLang', 'lgh_provider'];

function $(id) { return document.getElementById(id); }

// ── Load saved settings into form ──────────────────────────────────────────

function loadSettings() {
  chrome.storage.local.get(STORAGE_KEYS, function (result) {
    if (result.lgh_apiKey)     $('apiKey').value     = result.lgh_apiKey;
    if (result.lgh_targetLang) $('targetLang').value = result.lgh_targetLang;
    if (result.lgh_provider)   $('provider').value   = result.lgh_provider;
  });
}

// ── Save form values to storage ────────────────────────────────────────────

function saveSettings(e) {
  e.preventDefault();

  const data = {
    lgh_apiKey:     $('apiKey').value.trim(),
    lgh_targetLang: $('targetLang').value,
    lgh_provider:   $('provider').value,
  };

  chrome.storage.local.set(data, function () {
    showStatus('save-status', 'Saved!', false);
  });
}

// ── Clear cache ────────────────────────────────────────────────────────────

function clearCache() {
  chrome.storage.local.get('lgh_cache_index', function (result) {
    const index    = Array.isArray(result.lgh_cache_index) ? result.lgh_cache_index : [];
    const toRemove = [...index, 'lgh_cache_index'];

    chrome.storage.local.remove(toRemove, function () {
      const count = index.length;
      showStatus('cache-status', `Cleared ${count} entr${count === 1 ? 'y' : 'ies'}`, false);
    });
  });
}

// ── Status helper ──────────────────────────────────────────────────────────

function showStatus(elementId, message, isError) {
  const el = $(elementId);
  if (!el) return;
  el.textContent = message;
  el.className   = isError ? 'error' : '';
  setTimeout(function () {
    el.textContent = '';
    el.className   = '';
  }, 3000);
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  loadSettings();
  $('options-form').addEventListener('submit', saveSettings);
  $('clear-cache-btn').addEventListener('click', clearCache);
});
