// All choreography lives here. Every function leaves content visible at rest: animations run
// "from" a hidden state to the element's natural state, so a missing library or a reduced-motion
// preference only removes the movement, never the content.

const g = window.gsap;
const has = !!g;
if (has) {
  const plugins = [window.Flip, window.SplitText, window.ScrambleTextPlugin, window.CustomEase].filter(Boolean);
  g.registerPlugin(...plugins);
  if (window.CustomEase) {
    window.CustomEase.create("ink", "M0,0 C0.12,0.72 0.2,1 1,1");
    window.CustomEase.create("settle", "M0,0 C0.3,0 0.1,1.18 0.5,1.06 0.72,0.99 0.84,1 1,1");
  }
  g.defaults({ ease: window.CustomEase ? "ink" : "power3.out", duration: 0.7 });
}

const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
export const reduced = () => !has || mq.matches || document.documentElement.dataset.motion === "reduce";
mq.addEventListener?.("change", () => document.documentElement.classList.toggle("motion-reduced", mq.matches));

const fade = (el, d = 0.18) => (has && el ? g.fromTo(el, { opacity: 0 }, { opacity: 1, duration: d, ease: "none", clearProps: "opacity" }) : null);

// ---------- page load ----------
const unhide = () => document.documentElement.classList.remove("pre");

export function intro({ headline, items }) {
  if (reduced()) { unhide(); fade([headline, ...items], 0.25); return; }
  const run = () => {
    const tl = g.timeline({ delay: 0.05 });
    if (window.SplitText) {
      let first = true;
      window.SplitText.create(headline, {
        type: "words,lines", mask: "lines", aria: "auto", autoSplit: true,
        onSplit: (self) => {
          if (!first) return null;
          first = false;
          return g.from(self.lines, { yPercent: 108, duration: 1.05, stagger: 0.09, ease: "expo.out" });
        },
      });
    } else {
      tl.from(headline, { y: 24, opacity: 0, duration: 0.9 }, 0);
    }
    tl.from(items, { y: 18, opacity: 0, duration: 0.8, stagger: 0.07, clearProps: "transform,opacity" }, 0.22);
    unhide();
  };
  (document.fonts?.ready || Promise.resolve()).then(run).catch(unhide);
}

export function cellsIn(cells) {
  if (!cells.length || reduced()) return;
  g.from(cells, {
    opacity: 0, scale: 0.15, duration: 0.55, ease: "back.out(2.6)",
    stagger: { each: 0.004, from: "start" }, clearProps: "transform,opacity", delay: 0.35,
  });
}

// Animate an element's height across a content change.
export function resize(el, mutate) {
  if (reduced() || !el) { mutate(); return Promise.resolve(); }
  const h0 = el.offsetHeight;
  mutate();
  const h1 = el.offsetHeight;
  if (Math.abs(h1 - h0) < 2) return Promise.resolve();
  return new Promise((done) => g.fromTo(el, { height: h0 }, { height: h1, duration: 0.5, ease: "power3.inOut", clearProps: "height", onComplete: done }));
}

// ---------- layout change between the landing view and the case view ----------
export function morph(targets, mutate) {
  if (reduced() || !window.Flip) { mutate(); return; }
  const state = window.Flip.getState(targets);
  mutate();
  window.Flip.from(state, {
    duration: 0.8, ease: "power3.inOut", nested: true, absolute: false, prune: true,
    onEnter: (els) => g.fromTo(els, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, delay: 0.25, clearProps: "all" }),
    onLeave: (els) => g.to(els, { opacity: 0, duration: 0.25 }),
  });
}

// ---------- a new entry in the thread ----------
export function enter(el, { delay = 0 } = {}) {
  if (!el) return;
  if (reduced()) { fade(el, 0.2); return; }
  g.from(el, { y: 22, opacity: 0, duration: 0.7, delay, clearProps: "transform,opacity" });
}

export function collapseIn(el) {
  if (!el) return;
  if (reduced()) return;
  g.from(el, { height: 0, opacity: 0, duration: 0.5, ease: "power2.out", clearProps: "height,opacity" });
}

// ---------- consult feed ----------
export function feedRow(row, idEl, id) {
  if (reduced()) { fade(row, 0.15); return; }
  g.from(row, { x: -14, opacity: 0, duration: 0.45, clearProps: "transform,opacity" });
  if (idEl && window.ScrambleTextPlugin) {
    g.to(idEl, { duration: 0.7, scrambleText: { text: id, chars: "0123456789()IVXArtnex", speed: 0.7, revealDelay: 0.15 } });
  }
}

export function hits(chips) {
  if (!chips.length) return;
  if (reduced()) { fade(chips, 0.15); return; }
  g.from(chips, { y: 6, opacity: 0, scale: 0.92, duration: 0.4, stagger: 0.06, clearProps: "all" });
}

export function pulse(cell) {
  if (!cell || reduced()) return;
  g.fromTo(cell, { scale: 2.1, zIndex: 3 }, { scale: 1, zIndex: 0, duration: 0.9, ease: "elastic.out(1, 0.45)", clearProps: "transform,zIndex" });
}

export function readingSwap(box, render) {
  if (reduced()) { render(); return; }
  g.to(box, {
    opacity: 0, y: -6, duration: 0.18, ease: "power1.in",
    onComplete: () => { render(); g.fromTo(box, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, clearProps: "transform,opacity" }); },
  });
}

export function scan(line, textEl) {
  if (!line || reduced()) { if (line) line.style.display = "none"; return null; }
  const h = textEl.clientHeight || 120;
  return g.fromTo(line, { y: 0 }, { y: Math.max(0, h - 24), duration: 2.6, ease: "sine.inOut", repeat: -1, yoyo: true });
}

// ---------- clarifying question ----------
export function question(card) {
  if (!card) return;
  const text = card.querySelector(".question__text");
  const rest = Array.from(card.querySelectorAll(".question__eyebrow, .question__mark, .question__why, .answer, .question__baseline"));
  if (reduced()) { fade(card, 0.25); return; }
  const tl = g.timeline();
  tl.from(card, { y: 26, opacity: 0, scale: 0.985, duration: 0.75, clearProps: "transform,opacity" });
  if (window.SplitText && text) {
    const split = window.SplitText.create(text, { type: "words", aria: "auto" });
    tl.from(split.words, { opacity: 0, y: 10, filter: "blur(4px)", duration: 0.5, stagger: 0.022, onComplete: () => split.revert() }, 0.2);
  }
  tl.from(rest, { opacity: 0, y: 10, duration: 0.5, stagger: 0.08, clearProps: "transform,opacity" }, 0.35);
  return tl;
}

// ---------- the dossier reveal ----------
export function dossier(el) {
  if (!el) return;
  if (reduced()) { fade(el, 0.25); return; }
  const q = (s) => Array.from(el.querySelectorAll(s));
  const tl = g.timeline();
  const from = (sel, vars, at) => { const t = q(sel); if (t.length) tl.from(t, vars, at); };
  const sweep = (sel, vars, at) => { const t = q(sel); if (t.length) tl.fromTo(t, { backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%", ...vars }, at); };
  tl.from(q(".verdict__top > *"), { opacity: 0, y: 8, duration: 0.4, stagger: 0.06, clearProps: "all" }, 0);
  const tierName = el.querySelector(".verdict__tier h2");
  if (tierName && window.SplitText) {
    const split = window.SplitText.create(tierName, { type: "chars", aria: "auto" });
    tl.from(split.chars, { yPercent: 70, opacity: 0, rotate: 6, duration: 0.6, stagger: 0.025, ease: "back.out(2)", onComplete: () => split.revert() }, 0.08);
  }
  from(".verdict__tier svg", { scale: 0.4, rotate: -25, opacity: 0, duration: 0.7, ease: "back.out(2.2)", clearProps: "all" }, 0.05);
  from(".verdict__conf, .verdict__meaning, .verdict__rationale, .verdict__check", { opacity: 0, y: 12, duration: 0.55, stagger: 0.07, clearProps: "all" }, 0.3);
  from(".findings", { opacity: 0, y: 24, duration: 0.7, clearProps: "all" }, 0.55);
  from(".fact, .confirm__item", { opacity: 0, x: -10, duration: 0.45, stagger: 0.06, clearProps: "all" }, 0.75);
  sweep(".fact.from-answer .fact__text", { duration: 0.8, ease: "power2.inOut", stagger: 0.12 }, 1.2);
  from(".section--law .section-head, .lawcard, .law__key", { opacity: 0, y: 22, duration: 0.6, stagger: 0.08, clearProps: "all" }, 0.95);
  sweep(".lawcard__cited mark", { duration: 0.9, ease: "power2.inOut", stagger: 0.1 }, 1.4);
  from(".section--steps .section-head, .ob", { opacity: 0, y: 14, duration: 0.45, stagger: 0.045, clearProps: "all" }, 1.15);
  from(".provenance, .refine, .dossier__actions", { opacity: 0, y: 12, duration: 0.5, stagger: 0.08, clearProps: "all" }, 1.4);
  return tl;
}

// ---------- the triage tag ----------
export function tagEnter(tag) {
  if (!tag) return;
  if (reduced()) { fade(tag, 0.2); return; }
  g.fromTo(tag, { y: -70, rotation: -9, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: 1.4, ease: "elastic.out(1, 0.42)", clearProps: "transform,opacity" });
}

export function tagSway(tag) {
  if (!tag || reduced()) return null;
  return g.to(tag, { rotation: 2.2, duration: 1.9, ease: "sine.inOut", yoyo: true, repeat: -1, transformOrigin: "50% 18px" });
}

export function tagSettle(tag) {
  if (!tag) return;
  g?.killTweensOf(tag);
  if (reduced()) { g?.set(tag, { rotation: 0 }); return; }
  g.fromTo(tag, { rotation: -5 }, { rotation: 0, duration: 1.6, ease: "elastic.out(1, 0.3)", transformOrigin: "50% 18px", clearProps: "transform" });
}

export function tear(strips, onDone) {
  if (!strips.length) { onDone?.(); return; }
  if (reduced()) {
    has ? g.to(strips, { opacity: 0, duration: 0.15, onComplete: () => { strips.forEach((s) => (s.hidden = true)); onDone?.(); } })
        : (strips.forEach((s) => (s.hidden = true)), onDone?.());
    return;
  }
  // Tear from the bottom strip upwards, the way a paper triage tag is torn down to its category.
  const order = strips.slice().reverse();
  const tl = g.timeline({ delay: 0.55, onComplete: () => { strips.forEach((s) => (s.hidden = true)); onDone?.(); } });
  order.forEach((s, i) => {
    const dir = i % 2 ? 1 : -1;
    tl.to(s, { rotation: dir * 5, duration: 0.14, ease: "power1.out", transformOrigin: dir > 0 ? "0% 0%" : "100% 0%" }, i * 0.16)
      .to(s, { y: 160 + i * 30, x: dir * (26 + i * 8), rotation: dir * (22 + i * 6), opacity: 0, duration: 0.85, ease: "power2.in" }, i * 0.16 + 0.12);
  });
  tl.to(order, { height: 0, duration: 0.45, ease: "power2.inOut" }, order.length * 0.16 + 0.35);
}

// ---------- reader dialog ----------
export function readerOpen(panel, narrow) {
  if (reduced()) { fade(panel, 0.18); return; }
  g.fromTo(panel, narrow ? { yPercent: 100 } : { xPercent: 100 }, { xPercent: 0, yPercent: 0, duration: 0.6, ease: "expo.out", clearProps: "transform" });
}

export function readerClose(panel, narrow, done) {
  if (reduced()) { done(); return; }
  g.to(panel, { ...(narrow ? { yPercent: 100 } : { xPercent: 100 }), duration: 0.32, ease: "power2.in", onComplete: () => { g.set(panel, { clearProps: "transform" }); done(); } });
}

export function highlight(marks) {
  if (!marks.length || reduced()) return;
  g.fromTo(marks, { backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%", duration: 0.9, delay: 0.35, ease: "power2.inOut", stagger: 0.08 });
}

// ---------- small things ----------
export function typeInto(field, text, done) {
  if (reduced() || text.length > 260) { field.value = text; done(); return; }
  const state = { n: 0 };
  g.to(state, {
    n: text.length, duration: Math.min(1.1, 0.25 + text.length * 0.008), ease: "none",
    onUpdate: () => { field.value = text.slice(0, Math.round(state.n)); field.dispatchEvent(new Event("input")); },
    onComplete: () => { field.value = text; field.dispatchEvent(new Event("input")); done(); },
  });
}

export function toast(el) {
  if (reduced()) return;
  g.fromTo(el, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(2)" });
}

export function scrollTo(el, offset = 84) {
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, y), behavior: reduced() ? "auto" : "smooth" });
}

export function countUp(el, to) {
  if (!el) return;
  if (reduced()) { el.textContent = to; return; }
  const s = { n: 0 };
  g.to(s, { n: to, duration: 0.8, ease: "power2.out", onUpdate: () => (el.textContent = Math.round(s.n)) });
}
