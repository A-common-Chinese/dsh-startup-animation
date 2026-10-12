/* Fixed English narration, generated ahead of time from a reference voice.
   No OS speech engine, live TTS, dynamic names, or per-plugin announcements. */
(() => {
  'use strict';
  let unlocked = false, muted = false, active = false, generation = 0;
  let context, source, controller, finishPlayback;
  const cache = new Map();
  // Browser audio promises/events can stay pending when autoplay or an output
  // device is interrupted. Optional narration must never hold the startup gate.
  async function bounded(promise, milliseconds, signal) {
    let timer, aborted;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        const fail = () => reject(new Error('Narration unavailable'));
        timer = setTimeout(fail, milliseconds);
        aborted = fail;
        if (signal?.aborted) fail(); else signal?.addEventListener('abort', aborted, { once: true });
      })]);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', aborted); }
  }
  function cancel() {
    generation++; active = false;
    controller?.abort(); controller = null;
    finishPlayback?.(true);
  }
  async function unlock() {
    unlocked = true;
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if ((!context || context.state === 'closed') && Audio) context = new Audio();
    if (context?.state === 'suspended') { try { await bounded(context.resume(), 2000); } catch (_) {} }
  }
  function clip(index, state) {
    if (!Number.isInteger(index) || index < 0 || index > 5) return null;
    if (index === 3 && state.inventoryMode === 'mounted') return 'phase-3-mounted';
    if (index === 4) {
      if (state.inventory?.status !== 'complete') return 'load-unavailable';
      if (state.inventory.issues?.length) return 'load-warning';
    }
    return `phase-${index}`;
  }
  async function play(name, id) {
    try {
      if (!context || context.state !== 'running') return;
      let buffer = cache.get(name);
      if (!buffer) {
        controller = new AbortController(); const current = controller;
        try {
          buffer = await bounded((async () => {
            const response = await fetch(`/assets/voice/${name}.wav`, { signal: current.signal });
            if (!response.ok) throw new Error('Narration asset unavailable');
            return context.decodeAudioData(await response.arrayBuffer());
          })(), 10000, current.signal);
        } finally { current.abort(); if (controller === current) controller = null; }
        if (id !== generation) return;
        cache.set(name, buffer);
      }
      if (id !== generation) return;
      await new Promise(resolve => {
        const player = context.createBufferSource(); player.buffer = buffer;
        player.connect(context.destination); source = player;
        let timer, settled = false;
        const finish = (stop = false) => {
          if (settled) return;
          settled = true; clearTimeout(timer); player.onended = null;
          if (stop) { try { player.stop(); } catch (_) {} }
          try { player.disconnect(); } catch (_) {}
          if (source === player) source = null;
          if (finishPlayback === finish) finishPlayback = null;
          resolve();
        };
        finishPlayback = finish;
        player.onended = () => finish();
        const duration = Number.isFinite(buffer.duration) && buffer.duration > 0 ? buffer.duration : 8;
        timer = setTimeout(() => finish(true), Math.min(30000, (duration + 2) * 1000));
        try { player.start(); } catch (_) { finish(true); }
      });
    } catch (_) { /* Missing audio cannot trap startup; no system-TTS fallback. */ }
  }
  function phase(index, state = {}) {
    cancel();
    if (!unlocked || muted) return;
    const name = clip(index, state), id = generation;
    if (!name) return;
    active = true;
    play(name, id).finally(() => { if (id === generation) active = false; });
  }
  globalThis.DSHVoice = Object.freeze({
    unlock, phase, cancel,
    setMuted(value) { muted = Boolean(value); if (muted) cancel(); },
    get busy() { return active; },
  });
  globalThis.addEventListener('pagehide', () => { cancel(); if (context && context.state !== 'closed') context.close(); context = null; });
})();
