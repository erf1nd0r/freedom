/* render.js — drives FreedomEngine in the browser.
 * The loop steps the same engine the test suite verifies, at the same
 * stepsPerSecond — DEFAULTS is the single source of truth for pacing. */
"use strict";

(function () {
  var E = globalThis.FreedomEngine;
  var LETTER = globalThis.FREEDOM_LETTER;

  var field, hint, spans, state, timer;

  function newSeed() {
    return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  }

  function build(seed) {
    state = E.create(LETTER, { seed: seed });
    field.textContent = "";
    spans = [];
    for (var i = 0; i < state.cells.length; i++) {
      var c = state.cells[i];
      if (c.target === "\n") {
        field.appendChild(document.createTextNode("\n"));
        spans.push(null);
        continue;
      }
      var sp = document.createElement("span");
      sp.textContent = c.glyph;
      sp.className = c.locked ? "locked" : "noise";
      field.appendChild(sp);
      spans.push(sp);
    }
  }

  function paint() {
    for (var i = 0; i < state.cells.length; i++) {
      var sp = spans[i];
      if (!sp) continue;
      var c = state.cells[i];
      if (c.locked) {
        if (sp.textContent !== c.glyph) sp.textContent = c.glyph;
        var cls = c.justLocked ? "locked flash" : "locked";
        if (sp.className !== cls) sp.className = cls;
        if (sp.style.opacity) sp.style.opacity = "";
      } else {
        sp.textContent = c.glyph;
        sp.style.opacity = (0.25 + Math.random() * 0.45).toFixed(2);
      }
    }
  }

  function settleInstantly() {
    for (var i = 0; i < state.cells.length; i++) {
      var c = state.cells[i];
      c.glyph = c.target;
      c.locked = true;
      c.justLocked = false;
    }
    paint();
    hint.className = "show";
  }

  function start() {
    clearInterval(timer);
    hint.className = "";
    build(newSeed());
    var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      settleInstantly();
      return;
    }
    paint();
    timer = setInterval(function () {
      E.step(state);
      paint();
      if (E.isConverged(state)) {
        clearInterval(timer);
        hint.className = "show";
      }
    }, 1000 / E.DEFAULTS.stepsPerSecond);
  }

  function onInput(e) {
    if (e && e.repeat) return; // held key must not hold the field in noise
    start();
  }

  function init() {
    field = document.getElementById("field");
    hint = document.getElementById("hint");
    addEventListener("keydown", onInput);
    addEventListener("pointerdown", onInput);
    start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
