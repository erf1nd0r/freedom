/* freedom.test.js — headless verification surface.
 * This machine has no browser automation, so these assertions stand in for
 * QA: the renderer drives the exact step() verified here, at the exact
 * stepsPerSecond asserted here. Run: bun test
 */
"use strict";

require("./engine.js");
require("./letter.js");

const { test, expect } = require("bun:test");

const E = globalThis.FreedomEngine;
const LETTER = globalThis.FREEDOM_LETTER;

function runToConvergence(state, maxSteps) {
  while (!E.isConverged(state) && state.step < maxSteps) E.step(state);
  return state.step;
}

test("determinism: same seed produces identical fields after 500 steps", () => {
  const a = E.create(LETTER, { seed: 42 });
  const b = E.create(LETTER, { seed: 42 });
  for (let i = 0; i < 500; i++) {
    E.step(a);
    E.step(b);
  }
  expect(E.text(a)).toBe(E.text(b));
});

test("convergence: field fully settles within 10000 steps", () => {
  const s = E.create(LETTER, { seed: 42 });
  const steps = runToConvergence(s, 10000);
  expect(E.isConverged(s)).toBe(true);
  expect(steps).toBeLessThan(10000);
  expect(E.text(s)).toBe(LETTER);
});

test("timing window: convergence lands between 30s and 90s at default speed", () => {
  const s = E.create(LETTER, { seed: 42 });
  const steps = runToConvergence(s, 10000);
  const seconds = steps / E.DEFAULTS.stepsPerSecond;
  expect(seconds).toBeGreaterThanOrEqual(30);
  expect(seconds).toBeLessThanOrEqual(90);
});

test("monotonic: locked count never decreases", () => {
  const s = E.create(LETTER, { seed: 7 });
  let prev = E.lockedCount(s);
  for (let i = 0; i < 3000; i++) {
    E.step(s);
    const now = E.lockedCount(s);
    expect(now).toBeGreaterThanOrEqual(prev);
    prev = now;
  }
});

test("integrity: every glyph is a 1-char string after 1000 steps, no NaN cells", () => {
  const s = E.create(LETTER, { seed: 3 });
  for (let i = 0; i < 1000; i++) E.step(s);
  for (const c of s.cells) {
    expect(typeof c.glyph).toBe("string");
    expect(Array.from(c.glyph).length).toBe(1);
    expect(typeof c.locked).toBe("boolean");
  }
});

test("shape first: whitespace locked at step 0, all content cells unlocked", () => {
  const s = E.create(LETTER, { seed: 1 });
  for (const c of s.cells) {
    if (c.structural) {
      expect(c.locked).toBe(true);
      expect(c.glyph).toBe(c.target);
    } else {
      expect(c.locked).toBe(false);
    }
  }
});

test("signature last: first signature lock happens only after >=95% of body settled", () => {
  const s = E.create(LETTER, { seed: 42 });
  let progressAtFirstSigLock = null;
  while (!E.isConverged(s) && s.step < 10000) {
    const progressBefore = E.bodyProgress(s);
    E.step(s);
    if (progressAtFirstSigLock === null) {
      for (const c of s.cells) {
        if (c.signature && c.locked) {
          progressAtFirstSigLock = progressBefore;
          break;
        }
      }
    }
  }
  expect(progressAtFirstSigLock).not.toBeNull();
  expect(progressAtFirstSigLock).toBeGreaterThanOrEqual(0.95);
});

test("warmup: nothing locks during warmup, and warmup lasts >=2s", () => {
  const s = E.create(LETTER, { seed: 9 });
  const initial = E.lockedCount(s);
  for (let i = 0; i < s.opts.warmupSteps; i++) {
    E.step(s);
    expect(E.lockedCount(s)).toBe(initial);
  }
  expect(s.opts.warmupSteps / s.opts.stepsPerSecond).toBeGreaterThanOrEqual(2);
});

test("letter charset: ASCII printable + newline + em-dash only (no surrogate pairs)", () => {
  expect(/^[\x20-\x7E\n—]*$/.test(LETTER)).toBe(true);
});

test("letter invariants: addressee, signature, no questions, length in range", () => {
  expect(LETTER).toContain("Eddie");
  const lines = LETTER.split("\n").filter((l) => l.trim() !== "");
  expect(lines[lines.length - 1]).toBe("— Poe");
  expect(LETTER).not.toContain("?");
  expect(LETTER.length).toBeGreaterThanOrEqual(600);
  expect(LETTER.length).toBeLessThanOrEqual(1600);
});
