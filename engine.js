/* engine.js — pure annealing engine for "freedom"
 *
 * A field of cells, one per character of a target text. Every cell starts
 * as random noise. Whitespace is locked from step zero — the shape exists
 * before the words do. After a warmup of pure noise, each cell's chance to
 * settle onto its target character ramps up until the whole field has
 * converged. The signature (final non-empty line) is gated: it may not
 * settle until nearly everything else has.
 *
 * No DOM, no timers, no I/O. The renderer and the test suite drive the
 * same step() — what bun verifies is exactly what the browser shows.
 */
"use strict";

(function () {
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var GLYPHS =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" +
    "!@#$%^&*()_+-=[]{};:,.<>/\\|~";

  var DEFAULTS = {
    seed: 1,
    stepsPerSecond: 30, // renderer and tests share this single source of truth
    warmupSteps: 90, // 3s of pure noise before anything may settle
    lockRampSteps: 2400, // settle probability ramps to max over this span
    maxLockChance: 0.02, // per unlocked cell per step at full ramp
    signatureGate: 0.95 // fraction of body settled before the signature may
  };

  function signatureStart(target) {
    var lines = target.split("\n");
    var idx = lines.length - 1;
    while (idx >= 0 && lines[idx].trim() === "") idx--;
    var off = 0;
    for (var i = 0; i < idx; i++) off += lines[i].length + 1;
    return off;
  }

  function create(target, opts) {
    var o = {};
    var k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    if (opts) for (k in opts) o[k] = opts[k];
    var rand = mulberry32(o.seed);
    var sigStart = signatureStart(target);
    var chars = Array.from(target);
    var cells = [];
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var structural = ch === " " || ch === "\n" || ch === "\t";
      cells.push({
        target: ch,
        glyph: structural ? ch : GLYPHS[Math.floor(rand() * GLYPHS.length)],
        locked: structural,
        structural: structural,
        signature: i >= sigStart && !structural,
        justLocked: false
      });
    }
    return { cells: cells, step: 0, rand: rand, opts: o };
  }

  function lockChance(state) {
    var o = state.opts;
    var t = state.step - o.warmupSteps;
    if (t < 0) return 0;
    var ramp = t / o.lockRampSteps;
    if (ramp > 1) ramp = 1;
    return o.maxLockChance * ramp;
  }

  function bodyProgress(state) {
    var total = 0;
    var locked = 0;
    for (var i = 0; i < state.cells.length; i++) {
      var c = state.cells[i];
      if (c.structural || c.signature) continue;
      total++;
      if (c.locked) locked++;
    }
    return total === 0 ? 1 : locked / total;
  }

  function step(state) {
    var chance = lockChance(state);
    var sigAllowed = bodyProgress(state) >= state.opts.signatureGate;
    for (var i = 0; i < state.cells.length; i++) {
      var c = state.cells[i];
      if (c.locked) {
        c.justLocked = false;
        continue;
      }
      var mayLock = chance > 0 && (!c.signature || sigAllowed);
      if (mayLock && state.rand() < chance) {
        c.glyph = c.target;
        c.locked = true;
        c.justLocked = true;
      } else {
        c.glyph = GLYPHS[Math.floor(state.rand() * GLYPHS.length)];
        c.justLocked = false;
      }
    }
    state.step++;
    return state;
  }

  function lockedCount(state) {
    var n = 0;
    for (var i = 0; i < state.cells.length; i++) if (state.cells[i].locked) n++;
    return n;
  }

  function isConverged(state) {
    return lockedCount(state) === state.cells.length;
  }

  function text(state) {
    var out = "";
    for (var i = 0; i < state.cells.length; i++) out += state.cells[i].glyph;
    return out;
  }

  globalThis.FreedomEngine = {
    create: create,
    step: step,
    lockChance: lockChance,
    lockedCount: lockedCount,
    isConverged: isConverged,
    bodyProgress: bodyProgress,
    signatureStart: signatureStart,
    text: text,
    GLYPHS: GLYPHS,
    DEFAULTS: DEFAULTS
  };
})();
