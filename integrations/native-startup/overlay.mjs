/* Uses the shared animation's authenticated parent completion protocol.
 *
 * LOCAL PATCH (this machine): the ending used to remove the film instantly, so
 * the official Harness appeared in one frame. It now cross-fades:
 *   0 ms    film fades out (520 ms) while the Harness sits behind it, dimmed
 *   540 ms  film removed, underlying nodes released, Harness settles to full
 *   1020 ms inline styles cleared
 * Reapply after reinstalling the package:
 *   copy this file over node_modules/@dsh-rust/native-startup/overlay.mjs
 */
(() => {
  const REVEAL_MS = 520;
  const SETTLE_MS = 480;
  const dbg = (event, detail = '') => { try { fetch('/__dsh_startup/debug?from=overlay&event=' + encodeURIComponent(event) + '&detail=' + encodeURIComponent(detail), { cache: 'no-store' }); } catch (_) {} };
  const start = async () => {
    try {
      const response = await fetch('/__dsh_startup/launch', { cache: 'no-store', headers: { 'X-DSH-Startup': 'launch' } });
      if (!response.ok) return;
      const { enabled, instance } = await response.json();
      const key = `dsh-original-startup:${instance}`;
      let seen = false;
      try { seen = Boolean(sessionStorage.getItem(key)); } catch { /* Storage may be disabled. */ }
      dbg('mount-check', `enabled=${enabled} seen=${seen} instance=${instance}`);
      if (!enabled || seen) return;
      const channel = crypto.randomUUID().replaceAll('-', '');
      const frame = document.createElement('iframe');
      frame.title = 'DSH startup animation';
      frame.setAttribute('allow', 'autoplay');
      frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647;background:#eeeae2';
      frame.src = '/__dsh_startup/startup-preview.html?' + new URLSearchParams({ embed: '1', parentOrigin: location.origin, channel });
      const previousFocus = document.activeElement, inert = new Map();
      const isolate = node => {
        if (node.nodeType !== 1 || node === frame || inert.has(node)) return;
        inert.set(node, node.inert); node.inert = true;
      };
      for (const node of document.body.children) isolate(node);
      const observer = new MutationObserver(changes => {
        for (const change of changes) for (const node of change.addedNodes) isolate(node);
      });
      observer.observe(document.body, { childList: true });
      const containFocus = event => { if (event.target !== frame) frame.focus(); };
      window.addEventListener('focusin', containFocus, true);
      // The element the official Harness renders into; it settles from dim to full
      // as the film dissolves, instead of appearing at full brightness in one tick.
      const surface = document.getElementById('root') ||
        [...document.body.children].find(node => node !== frame && node.nodeType === 1) || null;
      let deadline, closing = false;
      const dismiss = () => {
        dbg('dismiss', `closing=${closing} surface=${Boolean(surface)}`);
        if (closing) return; // 'complete' and Escape can race
        closing = true;
        clearTimeout(deadline);
        observer.disconnect();
        window.removeEventListener('focusin', containFocus, true);
        try { sessionStorage.setItem(key, 'done'); } catch { /* Never block returning to Harness. */ }
        const easing = 'cubic-bezier(.4,0,.2,1)';
        frame.style.transition = `opacity ${REVEAL_MS}ms ${easing}, transform ${REVEAL_MS + 120}ms ${easing}`;
        frame.style.transform = 'scale(1.012)';
        frame.style.opacity = '0';
        if (surface) {
          surface.style.transition = `opacity ${SETTLE_MS}ms ${easing}`;
          surface.style.opacity = '0.55';
        }
        const finish = () => {
          for (const [node, wasInert] of inert) node.inert = wasInert;
          dbg('finish', 'frame removed');
          frame.remove();
          window.removeEventListener('message', close);
          window.removeEventListener('keydown', escape);
          if (surface) surface.style.opacity = '1';
          if (previousFocus?.isConnected && !previousFocus.inert) previousFocus.focus?.();
          setTimeout(() => {
            if (surface) { surface.style.transition = ''; surface.style.opacity = ''; }
          }, SETTLE_MS + 40);
        };
        setTimeout(finish, REVEAL_MS + 20);
      };
      const escape = event => { if (event.key === 'Escape') dismiss(); };
      const close = event => {
        // LOCAL PATCH: origin equality cannot hold when the window is dsh-app://app and
        // the film is served over http. event.source is the unforgeable check that matters.
        if (event.source !== frame.contentWindow || event.data?.source !== 'dsh-startup' || event.data.channel !== channel) return;
        // LOCAL PATCH: any iframe message proves the animation is alive; the old code
        // cleared the fail-open timer only on 'ready', so a slow start killed the show.
        clearTimeout(deadline);
        if (event.data.type === 'ready') { /* cleared above */ }
        dbg('message', String(event.data.type));
        if (['complete', 'skip'].includes(event.data.type)) dismiss();
      };
      window.addEventListener('message', close);
      window.addEventListener('keydown', escape);
      frame.addEventListener('error', dismiss, { once: true });
      // Fail open to the official UI if a missing asset prevents the shared
      // animation from announcing readiness. A ready sequence has no timeout.
      deadline = setTimeout(dismiss, 30000);
      document.body.append(frame); frame.focus();
    } catch (error) { console.warn('DSH startup animation unavailable:', error.message); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
