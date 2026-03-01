(function () {
  'use strict';

  const LGH    = window.LGH;
  const PREFIX = '[LGH]';

  function log(...a)  { console.log(PREFIX,  ...a); }
  function warn(...a) { console.warn(PREFIX, ...a); }

  // ── State ──────────────────────────────────────────────────────────────────

  let _initialized = false;

  // Version counter for DETAIL requests — incremented on each new request.
  // The callback closes over its value at dispatch time and drops stale responses
  // (rapid job switching / language change mid-flight).
  let _detailReqId = 0;

  // Tracks the "search context" (URL without currentJobId) so we can distinguish
  // a job-card click (only currentJobId changes → keep list) from a real search
  // change (different keywords / pagination → clear list).
  let _lastSearchContext = '';

  // ── Helpers ────────────────────────────────────────────────────────────────

  function isJobsPage() {
    return /linkedin\.com\/jobs/.test(location.href);
  }

  /**
   * /jobs/view/<id>/ is a single-job page with no list pane.
   * /jobs/search/ or /jobs/collections/ have the two-pane layout with a list.
   */
  function isSearchPage() {
    return /linkedin\.com\/jobs\/(search|collections|recommended)/.test(location.href);
  }

  /**
   * Returns a stable key for the current search context by stripping currentJobId
   * from the URL. If two URLs produce the same key, only a job card was clicked
   * (the search results list is unchanged).
   */
  function _getSearchContext(url) {
    try {
      const u = new URL(url);
      u.searchParams.delete('currentJobId');
      return u.pathname + '?' + u.searchParams.toString();
    } catch (_) {
      return url;
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;
    if (!isJobsPage()) return;

    log('init', location.href);
    _lastSearchContext = _getSearchContext(location.href);

    LGH.PanelHost.mount();
    const shadow = LGH.PanelHost.getShadow();
    if (!shadow) { warn('Shadow DOM unavailable — aborting'); return; }

    LGH.LeftPanel.mount(shadow);
    LGH.RightPanel.mount(shadow);

    // ListObserver only makes sense on two-pane search layouts.
    // /jobs/view/<id>/ is a single-job page — no list container exists there.
    if (isSearchPage()) {
      LGH.ListObserver.start(
        _onCardVisible,
        function (listScrollEl) {
          const leftBody = LGH.LeftPanel.getBodyEl();
          if (listScrollEl && leftBody) {
            LGH.ListScrollSync.attach(listScrollEl, leftBody);
            log('ListScrollSync attached to', listScrollEl.className || listScrollEl.tagName);
          }
        },
        function (jobId, isEntering) {
          LGH.LeftPanel.highlightCard(jobId, isEntering);
        }
      );
    } else {
      log('single-job page — ListObserver skipped');
    }
    LGH.DetailObserver.start(_onDetailChange);

    _initialized = true;
  }

  function destroy() {
    if (!_initialized) return;
    log('destroy');

    LGH.DetailObserver.stop();
    LGH.ListObserver.stop();
    LGH.ScrollSync.detach();
    LGH.ListScrollSync.detach();

    LGH.LeftPanel.unmount();
    LGH.RightPanel.unmount();
    LGH.PanelHost.unmount();

    _lastSearchContext = '';
    _initialized = false;
  }

  // ── Observer callbacks ─────────────────────────────────────────────────────

  /**
   * Called by ListObserver when a job card scrolls into view.
   * @param {string} jobId
   * @param {{ title, company, location, snippet, raw }} payload
   */
  function _onCardVisible(jobId, payload, linkedinCardEl) {
    LGH.LeftPanel.markLoading(jobId, payload);
    if (linkedinCardEl) LGH.LeftPanel.bindLinkedInCard(jobId, linkedinCardEl);

    _sendTranslate({
      jobId,
      scope:   'LIST',
      payload: { text: payload.raw, structured: payload },
    }, function (response) {
      if (!response) return;
      if (response.type === 'TRANSLATE_RESULT') {
        LGH.LeftPanel.renderTranslation(response.jobId, response.translated);
        LGH.LeftPanel.setStatus('Translated', 'ok');
      } else if (response.type === 'TRANSLATE_ERROR') {
        LGH.LeftPanel.markError(response.jobId, response.error || 'error');
        LGH.LeftPanel.setStatus('Translation error', 'error');
      }
    });
  }

  /**
   * Called by DetailObserver when the visible job detail changes.
   * detailPayload = { meta: {title, company, location}, blocks: [...] }
   *
   * @param {string} jobId
   * @param {{ meta: {title,company,location}, blocks: Array }} detailPayload
   * @param {Element|null} scrollEl
   */
  function _onDetailChange(jobId, detailPayload, scrollEl) {
    log('detail change', jobId,
        'blocks:', (detailPayload && detailPayload.blocks && detailPayload.blocks.length) || 0);

    // Bump version — in-flight responses for the previous job will be dropped
    const myReqId = ++_detailReqId;

    LGH.RightPanel.setCurrentJobId(jobId);
    LGH.RightPanel.showLoading(jobId);

    // Attach scroll sync to the LinkedIn detail scroll container
    const rightBody = LGH.RightPanel.getBodyEl();
    if (scrollEl && rightBody) {
      LGH.ScrollSync.attach(scrollEl, rightBody);
    }

    _sendTranslate({
      jobId,
      scope:   'DETAIL',
      payload: detailPayload,   // { meta: {...}, blocks: [...] }
    }, function (response) {
      // Drop stale: user switched job or changed language between dispatch and callback
      if (_detailReqId !== myReqId) return;

      if (!response) return;
      if (response.type === 'TRANSLATE_RESULT') {
        LGH.RightPanel.renderDetail(response.jobId, response.translated);
      } else if (response.type === 'TRANSLATE_ERROR') {
        LGH.RightPanel.showError(response.jobId, response.error || 'error');
      }
    });
  }

  // ── Messaging ──────────────────────────────────────────────────────────────

  function _sendTranslate(msg, callback) {
    try {
      chrome.runtime.sendMessage(
        { type: 'TRANSLATE', ...msg },
        function (response) {
          if (chrome.runtime.lastError) {
            warn('sendMessage error:', chrome.runtime.lastError.message);
            return;
          }
          if (callback) callback(response);
        }
      );
    } catch (err) {
      warn('sendMessage threw:', err.message);
    }
  }

  // ── Language change controller ─────────────────────────────────────────────

  /**
   * Called by LeftPanel's language selector after the new lang is saved to storage.
   * Resets both panels and forces re-translation at the new target language.
   * Exposed on window.LGH so leftPanel.js can call it without circular imports.
   *
   * @param {string} lang  — new language code (storage already updated by caller)
   */
  window.LGH.onLanguageChange = function (lang) {
    log('language changed to', lang);

    // List panel: clear cards so IntersectionObserver re-fires for all visible cards
    LGH.LeftPanel.clearCards();
    LGH.ListObserver.clearRequestedIds();

    // Detail panel: force immediate re-extract + re-translate (no DOM mutation needed)
    LGH.RightPanel.clearDetail();
    LGH.ScrollSync.detach();
    LGH.DetailObserver.resetLastJobId();
    LGH.DetailObserver.retrigger();
  };

  // ── Route change handling ──────────────────────────────────────────────────

  LGH.RouteObserver.start(function (newUrl) {
    log('route →', newUrl);

    if (isJobsPage()) {
      if (!_initialized) {
        init();
      } else {
        const newCtx = _getSearchContext(newUrl);
        const searchChanged = newCtx !== _lastSearchContext;
        _lastSearchContext = newCtx;

        // Detail always resets on any navigation
        LGH.DetailObserver.resetLastJobId();
        LGH.RightPanel.clearDetail();
        LGH.ScrollSync.detach();

        // If we just navigated TO a search page (e.g. from /jobs/view/ → /jobs/search/),
        // ListObserver may not have been started yet — start it now.
        if (isSearchPage() && !LGH.ListObserver.isActive()) {
          log('navigated to search page — starting ListObserver');
          LGH.ListObserver.start(
            _onCardVisible,
            function (listScrollEl) {
              const leftBody = LGH.LeftPanel.getBodyEl();
              if (listScrollEl && leftBody) LGH.ListScrollSync.attach(listScrollEl, leftBody);
            },
            function (jobId, isEntering) {
              LGH.LeftPanel.highlightCard(jobId, isEntering);
            }
          );
        }

        // List only resets when the search results themselves changed
        if (searchChanged) {
          log('search context changed — clearing list');
          LGH.ListObserver.clearRequestedIds();
          LGH.LeftPanel.clearCards();
          // Detach and re-attach list scroll sync (container may be rebuilt)
          LGH.ListScrollSync.detach();
          setTimeout(function () {
            const scrollEl = LGH.ListObserver.findScrollContainer();
            const leftBody = LGH.LeftPanel.getBodyEl();
            if (scrollEl && leftBody) LGH.ListScrollSync.attach(scrollEl, leftBody);
          }, 800);
        }
      }
    } else {
      destroy();
    }
  });

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  init();

})();
