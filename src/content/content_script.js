(function () {
  'use strict';

  const LGH    = window.LGH;
  const PREFIX = '[LGH]';

  function log(...a)  { console.log(PREFIX,  ...a); }
  function warn(...a) { console.warn(PREFIX, ...a); }

  // ── State ──────────────────────────────────────────────────────────────────

  let _initialized = false;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function isJobsPage() {
    return /linkedin\.com\/jobs/.test(location.href);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;
    if (!isJobsPage()) return;

    log('init', location.href);

    LGH.PanelHost.mount();
    const shadow = LGH.PanelHost.getShadow();
    if (!shadow) { warn('Shadow DOM unavailable — aborting'); return; }

    LGH.LeftPanel.mount(shadow);
    LGH.RightPanel.mount(shadow);

    LGH.ListObserver.start(_onCardVisible);
    LGH.DetailObserver.start(_onDetailChange);

    _initialized = true;
  }

  function destroy() {
    if (!_initialized) return;
    log('destroy');

    LGH.DetailObserver.stop();
    LGH.ListObserver.stop();
    LGH.ScrollSync.detach();

    LGH.LeftPanel.unmount();
    LGH.RightPanel.unmount();
    LGH.PanelHost.unmount();

    _initialized = false;
  }

  function reinit() {
    destroy();
    // Small pause to let LinkedIn's SPA finish rendering the new route
    setTimeout(init, 350);
  }

  // ── Observer callbacks ─────────────────────────────────────────────────────

  /**
   * Called by ListObserver when a job card scrolls into view.
   * @param {string} jobId
   * @param {{ title, company, location, snippet, raw }} payload
   */
  function _onCardVisible(jobId, payload) {
    LGH.LeftPanel.markLoading(jobId, payload);

    _sendTranslate({
      jobId,
      scope:   'LIST',
      payload: { text: payload.raw, structured: payload },
    }, function (response) {
      if (!response) return;
      if (response.type === 'TRANSLATE_RESULT') {
        LGH.LeftPanel.renderTranslation(response.jobId, response.translated);
        LGH.LeftPanel.setStatus('Translated ' + _cardCountLabel(), 'ok');
      } else if (response.type === 'TRANSLATE_ERROR') {
        LGH.LeftPanel.markError(response.jobId, response.error || 'error');
        LGH.LeftPanel.setStatus('Translation error', 'error');
      }
    });
  }

  /**
   * Called by DetailObserver when the visible job detail changes.
   * @param {string} jobId
   * @param {Array}  blocks
   * @param {Element|null} scrollEl
   */
  function _onDetailChange(jobId, blocks, scrollEl) {
    log('detail change', jobId, blocks.length, 'blocks');

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
      payload: { blocks },
    }, function (response) {
      if (!response) return;
      if (response.type === 'TRANSLATE_RESULT') {
        LGH.RightPanel.renderBlocks(response.jobId, response.translated.blocks || []);
      } else if (response.type === 'TRANSLATE_ERROR') {
        LGH.RightPanel.showError(response.jobId, response.error || 'error');
      }
    });
  }

  // ── Messaging ──────────────────────────────────────────────────────────────

  /**
   * Send a TRANSLATE message to the background service worker.
   * The callback receives the TRANSLATE_RESULT / TRANSLATE_ERROR response.
   */
  function _sendTranslate(msg, callback) {
    try {
      chrome.runtime.sendMessage(
        { type: 'TRANSLATE', ...msg },
        function (response) {
          if (chrome.runtime.lastError) {
            // Background service worker may have been inactive — log and continue
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

  // ── Route change handling ──────────────────────────────────────────────────

  LGH.RouteObserver.start(function (newUrl) {
    log('route →', newUrl);

    if (isJobsPage()) {
      if (!_initialized) {
        init();
      } else {
        // Same Jobs section, different search/job — reset without full teardown
        LGH.DetailObserver.resetLastJobId();
        LGH.ListObserver.clearRequestedIds();
        LGH.LeftPanel.clearCards();
        LGH.RightPanel.clearDetail();
        LGH.ScrollSync.detach();
      }
    } else {
      // Left the Jobs section entirely
      destroy();
    }
  });

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  init();

  // ── Helpers ────────────────────────────────────────────────────────────────

  let _cardCount = 0;
  const _origOnCardVisible = _onCardVisible;

  function _cardCountLabel() {
    return ''; // placeholder; could be wired to _cardMap size
  }

})();
