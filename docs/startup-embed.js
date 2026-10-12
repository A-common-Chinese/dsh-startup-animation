/* A narrow completion bridge for the React Harness startup gate.
   Parent skip requests go through the preview's own access guard. */
(() => {
  'use strict';
  let target = null, channel = '', finished = false;
  let skipRequest = null;
  try {
    const params = new URLSearchParams(location.search);
    const origin = new URL(params.get('parentOrigin'));
    const candidate = params.get('channel') || '';
    // LOCAL PATCH: accept a non-http parent (the desktop window is dsh-app://app). The
    // channel is a random per-mount value, and the parent re-validates event.source.
    if (parent !== window && params.get('embed') === '1' &&
        /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(params.get('parentOrigin') || '') &&
        /^[a-zA-Z0-9_-]{16,128}$/.test(candidate)) {
      target = params.get('parentOrigin');
      channel = candidate;
    }
  } catch (_) { /* Invalid or missing embedding options keep standalone behavior. */ }
  function send(type) {
    if (target) parent.postMessage({ source: 'dsh-startup', channel, type }, '*'); // LOCAL PATCH: a custom-scheme parent has no comparable origin
  }
  window.addEventListener('message', event => {
    if (!target || finished || event.source !== parent) return; // LOCAL PATCH: see above
    const data = event.data;
    if (!data || data.source !== 'dsh-harness' || data.channel !== channel || data.type !== 'request-skip') return;
    skipRequest?.();
  });
  globalThis.DSHEmbed = Object.freeze({
    get embedded() { return target !== null; },
    onSkipRequest(handler) { if (!finished && typeof handler === 'function') skipRequest = handler; },
    ready() { send('ready'); },
    // The parent rechecks its own backend cookie before opening the workbench.
    unlocked() { if (!finished) send('unlocked'); },
    profileChanged() { if (!finished) send('profile-changed'); },
    finish(reason) {
      if (!target || finished || !['complete', 'skip'].includes(reason)) return false;
      finished = true;
      skipRequest = null;
      send(reason);
      return true;
    },
  });
})();
