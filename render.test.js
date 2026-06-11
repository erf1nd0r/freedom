/* render.test.js — render-path smoke test with a stubbed DOM.
 * Bun has no renderer; this cannot verify pixels. It CAN verify that
 * render.js drives the DOM API correctly: element creation, span/cell
 * alignment across newlines, frame callbacks that don't throw, pacing
 * wired to the engine's stepsPerSecond, and the converged end state. */
"use strict";

const { test, expect } = require("bun:test");

function fakeElement() {
  const el = {
    _text: "",
    className: "",
    style: {},
    children: [],
    appendChild(child) {
      this.children.push(child);
    }
  };
  // Real DOM semantics: assigning textContent replaces all children.
  Object.defineProperty(el, "textContent", {
    get() {
      return el._text;
    },
    set(v) {
      el._text = v;
      if (v === "") el.children = [];
    }
  });
  return el;
}

// --- DOM stubs, installed before render.js loads ---
const field = fakeElement();
const hint = fakeElement();
const intervals = [];
const listeners = {};

globalThis.document = {
  readyState: "complete",
  getElementById(id) {
    return id === "field" ? field : id === "hint" ? hint : null;
  },
  createElement() {
    return fakeElement();
  },
  createTextNode(text) {
    return { textContent: text, isTextNode: true };
  },
  addEventListener() {}
};
globalThis.matchMedia = () => ({ matches: false });
globalThis.addEventListener = (type, fn) => {
  listeners[type] = fn;
};
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms) => {
  intervals.push({ fn, ms, cleared: false });
  return intervals.length - 1;
};
globalThis.clearInterval = (id) => {
  if (intervals[id]) intervals[id].cleared = true;
};

require("./engine.js");
require("./letter.js");
require("./render.js"); // init() runs immediately against the stubs

const E = globalThis.FreedomEngine;
const LETTER = globalThis.FREEDOM_LETTER;

test("init builds one node per character: spans for glyphs, text nodes for newlines", () => {
  expect(field.children.length).toBe(Array.from(LETTER).length);
  const newlines = field.children.filter((c) => c.isTextNode).length;
  expect(newlines).toBe(LETTER.split("\n").length - 1);
});

test("frame loop is paced by the engine's stepsPerSecond (single source of truth)", () => {
  expect(intervals.length).toBe(1);
  expect(intervals[0].ms).toBeCloseTo(1000 / E.DEFAULTS.stepsPerSecond);
});

test("interaction listeners are registered for re-scatter", () => {
  expect(typeof listeners.keydown).toBe("function");
  expect(typeof listeners.pointerdown).toBe("function");
});

test("5000 frame callbacks run without throwing and converge to the exact letter", () => {
  const frame = intervals[0].fn;
  for (let i = 0; i < 5000 && !intervals[0].cleared; i++) frame();
  expect(intervals[0].cleared).toBe(true); // loop stopped itself on convergence
  const rendered = field.children
    .map((c) => (c.isTextNode ? "\n" : c.textContent))
    .join("");
  expect(rendered).toBe(LETTER);
  expect(hint.className).toBe("show");
});

test("re-scatter (keydown) rebuilds the field and restarts the loop", () => {
  listeners.keydown();
  expect(intervals.length).toBe(2);
  const unlocked = field.children.filter(
    (c) => !c.isTextNode && c.className === "noise"
  ).length;
  expect(unlocked).toBeGreaterThan(0);
});

test("reduced motion: settles instantly with no animation loop", () => {
  globalThis.matchMedia = () => ({ matches: true });
  const before = intervals.length;
  listeners.keydown(); // restart under reduced motion
  expect(intervals.length).toBe(before); // no new interval scheduled
  const rendered = field.children
    .map((c) => (c.isTextNode ? "\n" : c.textContent))
    .join("");
  expect(rendered).toBe(LETTER);
});
