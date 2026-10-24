/* Deterministic playback state. No DOM, timers, sound, or inference calls. */
(() => {
  'use strict';
  const durations = Object.freeze([2.1, 1.8, 2.2, 3.4, 1.8, 2.5]);
  const lateranoDurations = Object.freeze([3.4, 2.6, 3.6, 4.2, 2.8, 3.8]);
  /* LOCAL PATCH: fingerprint gate v2 - the ready stage (4) no longer waits for a click. */
  const checkpoints = Object.freeze([0, 2]);
  const total = Math.round(durations.reduce((sum, n) => sum + n, 0) * 1000) / 1000;
  class Sequence {
    constructor(interactive = true) {
      this.interactive = interactive;
      this.durations = durations;
      this.total = total;
      this.choices = [0, 0, 0, 0, 0];
      this.restart();
    }
    setDurations(values) {
      if (!Array.isArray(values) || values.length !== 6) return false;
      const next = Array.from(values);
      if (!next.every(value => Number.isFinite(value) && value > 0 && value <= 60)) return false;
      const progress = this.progress;
      this.durations = Object.freeze(next);
      // Remove sum-only floating point noise without rounding tiny valid timings to zero.
      this.total = Number(next.reduce((sum, value) => sum + value, 0).toPrecision(15));
      this.elapsed = progress * next[this.phase];
      return true;
    }
    restart() { this.phase = 0; this.elapsed = 0; this.playing = false; this.completed = false; this.barriers = new Set(); }
    hold(phase) { if (Number.isInteger(phase) && phase >= 0 && phase <= 5) this.barriers.add(phase); }
    release(phase) { this.barriers.delete(phase); }
    get held() { return this.playing && this.barriers.has(this.phase) && this.elapsed >= this.durations[this.phase]; }
    get progress() { return Math.min(1, this.elapsed / this.durations[this.phase]); }
    get waiting() { return this.interactive && !this.playing && !this.completed && this.elapsed === 0 && checkpoints.includes(this.phase); }
    get time() { return Math.min(this.total, this.durations.slice(0, this.phase).reduce((s, n) => s + n, 0) + this.elapsed); }
    choose(index) {
      if (this.phase === 5 || !Number.isInteger(index) || index < 0 || index > 2) return false;
      this.choices[this.phase] = index; return true;
    }
    play() { if (this.completed) this.restart(); this.playing = true; }
    pause() { this.playing = false; }
    jump(phase) {
      if (!Number.isInteger(phase) || phase < 0 || phase > 5) return;
      this.phase = phase; this.elapsed = 0;
      this.completed = false; this.playing = false;
    }
    seek(time) {
      if (!Number.isFinite(time)) return;
      const { durations, total } = this;
      time = Math.max(0, Math.min(total, time));
      this.phase = 0;
      while (this.phase < 5 && time >= durations[this.phase] - 1e-9) { time -= durations[this.phase]; this.phase++; }
      this.elapsed = Math.max(0, Math.min(durations[this.phase], time));
      this.completed = this.phase === 5 && this.elapsed >= durations[5] - 1e-9;
      this.playing = false;
    }
    tick(delta) {
      if (!this.playing || !Number.isFinite(delta) || delta <= 0) return;
      const { durations } = this;
      this.elapsed += delta;
      while (this.elapsed >= durations[this.phase] - 1e-9) {
        if (this.barriers.has(this.phase)) { this.elapsed = durations[this.phase]; break; }
        const rest = Math.max(0, this.elapsed - durations[this.phase]);
        if (this.phase === 5) { this.elapsed = durations[5]; this.completed = true; this.playing = false; break; }
        this.phase++;
        this.elapsed = 0;
        if (this.interactive && checkpoints.includes(this.phase)) { this.playing = false; break; }
        this.elapsed = rest;
      }
    }
  }
  globalThis.DSHBoot = Object.freeze({ Sequence, durations, lateranoDurations, total, checkpoints });
})();
