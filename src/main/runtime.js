'use strict';

// Live state that shouldn't be written to disk on every tick, kept in the
// main process so it survives a widget window being recreated (for example
// when the window mode changes). Times come from a monotonic clock, so wall
// clock changes and sleep don't make a stopwatch drift or jump backwards.

const now = () => Number(process.hrtime.bigint() / 1000n) / 1000; // ms, monotonic

class Runtime {
  constructor() {
    this.stopwatches = new Map();
  }

  stopwatch(id) {
    if (!this.stopwatches.has(id)) this.stopwatches.set(id, { running: false, startedAt: 0, accumulated: 0, laps: [] });
    return this.stopwatches.get(id);
  }

  elapsed(s) {
    return s.accumulated + (s.running ? now() - s.startedAt : 0);
  }

  snapshot(id) {
    const s = this.stopwatch(id);
    return { running: s.running, elapsed: this.elapsed(s), laps: s.laps.slice() };
  }

  stopwatchAction(id, action) {
    const s = this.stopwatch(id);
    switch (action) {
      case 'start':
        if (!s.running) { s.running = true; s.startedAt = now(); }
        break;
      case 'pause':
        if (s.running) { s.accumulated = this.elapsed(s); s.running = false; }
        break;
      case 'lap':
        if (s.running) s.laps.unshift(this.elapsed(s));
        break;
      case 'reset':
        s.running = false; s.accumulated = 0; s.laps = [];
        break;
    }
    return this.snapshot(id);
  }

  forget(id) {
    this.stopwatches.delete(id);
  }
}

module.exports = { Runtime };
