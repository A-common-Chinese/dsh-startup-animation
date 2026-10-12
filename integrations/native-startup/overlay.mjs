/* Optional overlay: claim once per tab before mounting, independently escapable. */
(() => {
  // Duplicate script injections must not create mutually inert focus traps.
  const owner = Symbol.for('dsh.native-startup.overlay');
  if (window[owner]) return;
  window[owner] = true;
  const start = async () => {
    let dismiss;
    try {
      const response = await fetch('/__dsh_startup/launch', { cache: 'no-store', headers: { 'X-DSH-Startup': 'launch' } });
      if (!response.ok) return;
      const { enabled, instance } = await response.json();
      if (enabled !== true || typeof instance !== 'string' || !instance) return;
      const key = `dsh-original-startup:${instance}`;
      try {
        if (sessionStorage.getItem(key)) return;
        // A refresh during playback must not restart the optional opening.
        sessionStorage.setItem(key, 'started');
      } catch {
        // Without a reliable tab claim, prefer the authenticated official UI.
        return;
      }
      const channel = crypto.randomUUID().replaceAll('-', '');
      const frame = document.createElement('iframe');
      frame.title = 'DSH startup animation';
      frame.setAttribute('allow', 'autoplay');
      const theme = document.documentElement?.dataset?.theme;
      const query = new URLSearchParams({ embed: '1', parentOrigin: location.origin, channel });
      frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647;background:#eeeae2';
      frame.src = '/__dsh_startup/startup-preview.html?' + query;
      // This parent-owned control still works if the child fails after ready.
      const exit = document.createElement('button');
      exit.type = 'button';
      exit.textContent = '返回 Harness';
      exit.setAttribute('aria-label', '退出可选开场，返回官方 Harness');
      exit.style.cssText = `position:fixed;right:16px;top:16px;z-index:2147483647;min-height:36px;padding:7px 12px;border:1px solid ${theme === 'dark' ? '#70838c' : '#9aa8ae'};background:${theme === 'dark' ? '#0b1116' : '#eef2f5'};color:${theme === 'dark' ? '#f2f4f2' : '#162126'};font:12px/1.4 system-ui,sans-serif;cursor:pointer`;
      const previousFocus = document.activeElement, inert = new Map();
      let deadline, observer, closed = false;
      const isolate = node => {
        if (node.nodeType !== 1 || node === frame || node === exit || inert.has(node)) return;
        inert.set(node, node.inert); node.inert = true;
      };
      const containFocus = event => { if (event.target !== frame && event.target !== exit) frame.focus(); };
      const escape = event => { if (event.key === 'Escape') dismiss(); };
      const close = event => {
        if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'dsh-startup' || event.data.channel !== channel) return;
        if (event.data.type === 'ready') clearTimeout(deadline);
        if (['complete', 'skip'].includes(event.data.type)) dismiss();
      };
      dismiss = () => {
        if (closed) return;
        closed = true;
        clearTimeout(deadline);
        observer?.disconnect();
        window.removeEventListener('focusin', containFocus, true);
        window.removeEventListener('message', close);
        window.removeEventListener('keydown', escape);
        exit.removeEventListener('click', dismiss);
        for (const [node, wasInert] of inert) node.inert = wasInert;
        frame.remove(); exit.remove();
        if (previousFocus?.isConnected && !previousFocus.inert) previousFocus.focus?.();
        try { sessionStorage.setItem(key, 'done'); } catch { /* The earlier claim is already sufficient. */ }
      };
      for (const node of document.body.children) isolate(node);
      observer = new MutationObserver(changes => {
        for (const change of changes) for (const node of change.addedNodes) isolate(node);
      });
      observer.observe(document.body, { childList: true });
      window.addEventListener('focusin', containFocus, true);
      window.addEventListener('message', close);
      window.addEventListener('keydown', escape);
      exit.addEventListener('click', dismiss);
      frame.addEventListener('error', dismiss, { once: true });
      // A missing asset must not cover the official UI indefinitely. Ready
      // playback has no duration limit; the return control remains available.
      deadline = setTimeout(dismiss, 15000);
      document.body.append(frame, exit); frame.focus();
    } catch (error) {
      dismiss?.();
      console.warn('DSH startup animation unavailable:', error.message);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
