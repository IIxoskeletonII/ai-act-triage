// The deck's behaviour: names, the generated visuals (the Act map, unit bars, the agreement grid),
// the chrome (brand, place in the talk, a progress map built like the Act map), and the motion.
// Motion follows the tool's rule: every element is complete at rest and animations run *from* a
// hidden state, so reduced motion, print and a missing library only remove movement, never content.
(function () {
  "use strict";

  const root = document.documentElement;
  const qs = location.search;
  const PRINT = /print-pdf/i.test(qs);
  const RECEIVER = /receiver/i.test(qs);
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const forcedReduce = /[?&]motion=reduce\b/.test(qs);
  const g = window.gsap;
  const still = () => PRINT || RECEIVER || !g || forcedReduce || mq.matches;
  mq.addEventListener?.("change", () => root.classList.toggle("reduce-motion", forcedReduce || mq.matches));

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  if (g) {
    g.registerPlugin(...[window.SplitText, window.CustomEase, window.ScrambleTextPlugin].filter(Boolean));
    if (window.CustomEase) {
      window.CustomEase.create("ink", "M0,0 C0.12,0.72 0.2,1 1,1");
      window.CustomEase.create("settle", "M0,0 C0.3,0 0.1,1.18 0.5,1.06 0.72,0.99 0.84,1 1,1");
    }
    g.defaults({ ease: window.CustomEase ? "ink" : "power3.out", duration: 0.8 });
    g.config({ nullTargetWarn: false });
  }

  // ---------------------------------------------------------------- names
  // Each member is { name, id } (id: matricola); a plain string is accepted as a name.
  const TEAM = window.DECK_TEAM || { E: { name: "Eliya Allam" } };
  const member = (k) => {
    const m = TEAM[k];
    return typeof m === "string" ? { name: m } : (m || { name: k });
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  $$("[data-speaker]").forEach((el) => { el.textContent = member(el.dataset.speaker).name; });
  $$("[data-team]").forEach((ul) => {
    ul.innerHTML = ["E", "A", "B", "C"].filter((k) => TEAM[k]).map((k) => {
      const m = member(k);
      return `<li><span class="team__name">${esc(m.name)}</span>${m.id ? `<span class="team__id">${esc(m.id)}</span>` : ""}</li>`;
    }).join("");
  });

  // ---------------------------------------------------------------- generated visuals
  const OUTLINE = window.ACT_OUTLINE || [];
  // Provisions the architecture diagram shows being consulted for the CV-ranking case (PG1).
  const HIT = ["Art 2", "Art 3", "Art 5", "Art 9", "Art 14", "Art 43", "Art 49", "Art 50"];
  const READ = ["Art 6", "Annex III"];

  $$('[data-map="outline"]').forEach((el) => {
    el.innerHTML = OUTLINE.map((ch) => `<div class="amap__row"><b>${ch.id}</b><div class="amap__cells">${
      ch.items.map((id) => `<i class="cell" data-id="${id}"></i>`).join("")}</div></div>`).join("");
  });
  $$('[data-map="flat"]').forEach((el) => {
    el.dataset.tier = "high-risk";
    el.innerHTML = OUTLINE.flatMap((ch) => ch.items).map((id) => {
      const cls = READ.includes(id) ? " is-read is-cited" : HIT.includes(id) ? " is-hit" : "";
      return `<i class="cell${cls}" data-id="${id}"></i>`;
    }).join("");
  });
  $$(".ubar[data-n]").forEach((el) => {
    const n = +el.dataset.n, on = +el.dataset.on;
    el.innerHTML = Array.from({ length: n }, (_, i) => `<i class="u${i < on ? " on" : ""}"></i>`).join("");
  });
  $$("[data-cells]").forEach((el) => {
    el.innerHTML = Array.from({ length: +el.dataset.cells }, () => '<i class="u"></i>').join("");
  });

  // Agreement analysis, eval/results_agreement.json (Phase 3e de-leaked runs, 20 v2 dev cases).
  const CASES = ["T1", "T2", "T3", "T4", "T5", "N1", "N2", "N3", "E1", "E2", "E3", "N6", "N7", "N8", "N4", "N5", "A1", "A2", "N9", "N10"];
  const ROWS = [
    { k: "sr", label: "Sonnet · RAG", sub: "frontier model, with retrieval", fails: ["E1", "N7", "N6", "A1"] },
    { k: "hr", label: "Haiku · RAG", sub: "much smaller, with retrieval", fails: ["E1", "N7", "N6", "N5"] },
    { k: "sp", label: "Sonnet · parametric", sub: "no retrieval", fails: ["E1", "N7"] },
    { k: "hp", label: "Haiku · parametric", sub: "no retrieval", fails: ["E1", "N7"] },
  ];
  const SPLIT = ["N6", "N5", "A1"];
  const WHY = { sr: ["N6", "A1"], hr: ["N6", "N5"] };
  $$("[data-agrid]").forEach((el) => {
    let h = '<div></div>' + CASES.map((c) => `<div class="ch" data-c="${c}"${SPLIT.includes(c) ? " data-split" : ""}>${c}</div>`).join("") + "<div></div>";
    ROWS.forEach((r) => {
      h += `<div class="rl" data-r="${r.k}">${r.label}<small>${r.sub}</small></div>`;
      h += CASES.map((c) => {
        const fail = r.fails.includes(c);
        const why = fail && (WHY[r.k] || []).includes(c) ? " data-why" : "";
        return `<i class="u ${fail ? "fail" : "on"}" data-r="${r.k}" data-c="${c}"${SPLIT.includes(c) ? " data-split" : ""}${why} title="${r.label}, ${c}: ${fail ? "fail" : "pass"}"></i>`;
      }).join("");
      h += `<div class="sc" data-r="${r.k}">${20 - r.fails.length}/20</div>`;
    });
    el.innerHTML = h;
  });

  // Leader lines from the three disagreement columns to their explanations (layout px, unscaled).
  function layoutLeaders() {
    $$(".whys").forEach((whys) => {
      const agree = whys.closest(".agree");
      const svg = $("svg", whys);
      const w = whys.offsetWidth, hgt = 40;
      if (!w) return; // slide not laid out yet; runs again when it is shown
      svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`);
      const top = 2;
      $$("path[data-lead]", svg).forEach((p) => {
        const c = p.dataset.lead;
        const head = $(`.agrid .ch[data-c="${c}"]`, agree);
        const card = $(`.why[data-why-for="${c}"]`, whys);
        if (!head || !card) return;
        const x = head.offsetLeft + head.offsetWidth / 2;
        const cx = card.offsetLeft + card.offsetWidth / 2;
        p.setAttribute("d", `M${x} ${top} V12 L${cx} ${hgt - 2}`);
      });
    });
  }

  // ---------------------------------------------------------------- chrome
  const PARTS = { I: "Introduction", II: "Related work", III: "Methodology", IV: "Results", V: "Conclusion", Anx: "Appendix" };
  const slides = $$(".reveal .slides > section");
  const main = slides.filter((s) => s.dataset.part !== "Anx");
  const appendix = slides.filter((s) => s.dataset.part === "Anx");
  const pad = (n) => String(n).padStart(2, "0");

  function chromeHTML(index) {
    const s = slides[index];
    const part = s.dataset.part;
    const inApx = part === "Anx";
    const ai = appendix.indexOf(s); // 0 is the divider
    const no = inApx ? (ai === 0 ? "Backup" : `A${ai} / ${appendix.length - 1}`) : `${pad(main.indexOf(s) + 1)} / ${main.length}`;
    const groups = Object.keys(PARTS).map((p) => {
      const cells = slides.map((x, i) => (x.dataset.part === p ? `<i class="pc${i < index ? " is-read" : i === index ? " is-now" : ""}"></i>` : "")).join("");
      return `<div class="pmap__g${p === part ? " is-here" : ""}"><b>${p}</b><span class="pmap__cells">${cells}</span></div>`;
    }).join("");
    return `<div class="chrome__top">
        <div class="brand"><span class="mark"><span>§</span></span><b>AI Act Triage</b></div>
        <div class="where"><span class="where__sec">${part}</span><span class="where__label">${PARTS[part]}</span><span class="where__no">${no}</span></div>
      </div>
      <div class="chrome__foot">
        <div class="pmap">${groups}</div>
        <span class="pill"><i></i>Regulation (EU) 2024/1689</span>
      </div>`;
  }

  let chrome = null;
  function mountChrome() {
    if (PRINT) {
      slides.forEach((s, i) => {
        if (s.dataset.chrome === "none") return;
        const c = document.createElement("div");
        c.className = "chrome";
        c.setAttribute("aria-hidden", "true");
        c.innerHTML = chromeHTML(i);
        s.appendChild(c);
      });
      return;
    }
    chrome = document.createElement("div");
    chrome.className = "chrome";
    chrome.setAttribute("aria-hidden", "true");
    $(".reveal .slides").appendChild(chrome);
  }
  function updateChrome(index) {
    if (!chrome) return;
    chrome.innerHTML = chromeHTML(index);
    chrome.classList.toggle("is-hidden", slides[index].dataset.chrome === "none");
    if (!still()) {
      const now = $(".pc.is-now", chrome);
      if (now) g.fromTo(now, { scale: 2.2 }, { scale: 1, duration: 0.9, ease: "elastic.out(1, 0.45)", clearProps: "transform" });
    }
  }

  // ---------------------------------------------------------------- motion helpers
  const hiddenByFragment = (el) => !!el.closest(".fragment:not(.visible)");
  // Leaving a slide mid-animation must leave its elements at rest, not frozen half-way: DOM tweens
  // are reverted (inline styles removed); counters and typing are killed, which restores their text.
  const live = new Set();
  const track = (t) => { if (t) live.add(t); return t; };
  function killAll() {
    live.forEach((t) => {
      if (t.vars && t.vars.onInterrupt) t.kill();
      else if (t.revert) t.revert();
      else if (t.kill) t.kill();
      if (t._restore) t._restore();
    });
    live.clear();
    stopAmbient();
  }

  function lines(el) {
    if (!window.SplitText) return [el];
    if (!el._split) el._split = window.SplitText.create(el, { type: "lines", mask: "lines", linesClass: "ln", aria: "auto" });
    return el._split.lines;
  }
  function riseLines(el, delay = 0) {
    return track(g.from(lines(el), { yPercent: 112, duration: 1.05, stagger: 0.085, ease: "expo.out", delay }));
  }
  function countUp(el, delay = 0) {
    const node = el.firstChild;
    if (!node || node.nodeType !== 3) return;
    const m = /^(\D*)(\d+)(.*)$/s.exec(node.nodeValue);
    if (!m) return;
    const [, pre, num, post] = m;
    const o = { v: 0 };
    track(g.to(o, {
      v: +num, duration: 1.1, delay, ease: "power2.out",
      onUpdate: () => { node.nodeValue = pre + Math.round(o.v) + post; },
      onComplete: () => { node.nodeValue = pre + num + post; },
      onInterrupt: () => { node.nodeValue = pre + num + post; },
    }));
  }
  function sweep(marks, delay = 0.2) {
    if (!marks.length) return;
    track(g.fromTo(marks, { backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%", duration: 0.9, stagger: 0.35, delay, ease: "power2.inOut", clearProps: "backgroundSize" }));
  }
  function fill(cells, delay = 0, each = 0.03) {
    if (!cells.length) return;
    track(g.from(cells, { scale: 0.2, opacity: 0, duration: 0.55, ease: "back.out(2.4)", stagger: each, delay, clearProps: "transform,opacity" }));
  }
  function draw(paths, delay = 0, dur = 0.7) {
    paths.forEach((p, i) => {
      track(g.fromTo(p, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: dur, delay: delay + i * 0.05, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" }));
    });
  }
  function offsetTopIn(el, ancestor) {
    let y = 0;
    for (let n = el; n && n !== ancestor; n = n.offsetParent) y += n.offsetTop;
    return y;
  }
  // A tag drops in on its string and swings to rest around its pivot: the pin for a short string,
  // otherwise the point where the string leaves the top of the slide. It always ends upright and still
  // (the QR code has to be scannable).
  function swing(tag, delay = 0) {
    const section = tag.closest("section");
    const y = offsetTopIn(tag, section);
    const str = $(".tag__string", tag);
    const len = str ? str.offsetHeight - 34 : y;
    const pivot = Math.min(y, len);
    g.set(tag, { transformOrigin: `50% ${-pivot}px` });
    const tl = g.timeline({ delay });
    tl.from(tag, { y: -y - 700, duration: 1.15, ease: "power3.out" }, 0)
      .fromTo(tag, { rotation: pivot < 300 ? 11 : 7 }, { rotation: 0, duration: 2.6, ease: "elastic.out(1, 0.3)", clearProps: "transform" }, 0.2);
    return track(tl);
  }

  // ---------------------------------------------------------------- title ambience: the agent reading
  let ambient = null;
  function startAmbient(section) {
    const cells = $$(".title-map .cell", section);
    if (!cells.length) return;
    const tick = () => {
      const c = cells[Math.floor(Math.random() * cells.length)];
      c.classList.add("is-hit");
      setTimeout(() => { c.classList.remove("is-hit"); c.classList.add("is-read"); }, 700);
      setTimeout(() => c.classList.remove("is-read"), 2300);
    };
    ambient = setInterval(tick, 260);
  }
  function stopAmbient() {
    if (ambient) clearInterval(ambient);
    ambient = null;
    $$(".title-map .cell").forEach((c) => c.classList.remove("is-hit", "is-read"));
  }

  // ---------------------------------------------------------------- scenes
  // enter(section): runs when a slide becomes current. Builds run when a fragment is shown.
  const SCENES = {
    title(s) {
      fill($$(".title-map .cell", s), 0.1, 0.0045);
      swing($(".title-tag .tag", s), 0.35);
      startAmbient(s);
    },
    what(s) {
      const el = $("[data-type]", s);
      if (!el || hiddenByFragment(el)) return;
      const text = el.dataset.full || (el.dataset.full = el.textContent);
      const o = { n: 0 };
      track(g.to(o, {
        n: text.length, duration: 1.7, delay: 0.7, ease: "none",
        onStart: () => { el.textContent = ""; },
        onUpdate: () => { el.textContent = text.slice(0, Math.round(o.n)); },
        onComplete: () => { el.textContent = text; },
        onInterrupt: () => { el.textContent = text; },
      }));
    },
    arch(s) {
      const nodes = $$(".arch > .node:not(.node--added), .arch > .tool", s);
      const order = [0, 1, 2, 3, 4, 5, 6]; // desc, agent, tool, tool, act, verdict, guard
      const tl = track(g.timeline({ delay: 0.35 }));
      const [desc, agent, t1, t2, act, verdict, guard] = order.map((i) => nodes[i]);
      const P = (n) => $(`.arch__svg [data-draw="${n}"]`, s);
      const step = (el, at) => tl.from(el, { y: 22, opacity: 0, duration: 0.6, clearProps: "transform,opacity" }, at);
      const dash = (p, at, d = 0.45) => p && tl.fromTo(p, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: d, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" }, at);
      step(desc, 0); dash(P(1), 0.35); step(agent, 0.6);
      dash(P(2), 1.0); step(t1, 1.05); step(act, 1.25);
      const cells = $$(".flatmap .cell", act);
      tl.from(cells, { opacity: 0, scale: 0.3, duration: 0.4, stagger: 0.004, ease: "back.out(2)", clearProps: "transform,opacity" }, 1.35);
      const lit = cells.filter((c) => c.classList.contains("is-hit") || c.classList.contains("is-read"));
      const cited = cells.filter((c) => c.classList.contains("is-cited"));
      tl.call(() => lit.forEach((c) => c.classList.remove("is-hit", "is-read", "is-cited")), null, 1.3);
      lit.forEach((c, i) => tl.call(() => {
        c.classList.add(cited.includes(c) ? "is-read" : "is-hit");
        g.fromTo(c, { scale: 2 }, { scale: 1, duration: 0.8, ease: "elastic.out(1, 0.45)", clearProps: "transform" });
      }, null, 1.9 + i * 0.12));
      dash(P(3), 2.9); step(t2, 2.95);
      dash(P(4), 3.3); step(verdict, 3.55);
      tl.call(() => cited.forEach((c) => c.classList.add("is-cited")), null, 3.7);
      dash(P(5), 4.0); step(guard, 4.25);
      dash(P(6), 4.6, 0.4);
      const tag = $(".arch-tag .tag", s);
      g.set(tag, { transformOrigin: "50% -72px" });
      tl.from(tag, { y: -40, opacity: 0, duration: 0.5, ease: "power2.out" }, 4.85)
        .fromTo(tag, { rotation: 8 }, { rotation: 0, duration: 2.2, ease: "elastic.out(1, 0.3)", clearProps: "transform" }, 4.85);
      // The map's resting state (what was read and cited) must survive an interrupted build.
      tl._restore = () => {
        lit.forEach((c) => c.classList.add(cited.includes(c) ? "is-read" : "is-hit"));
        cited.forEach((c) => c.classList.add("is-cited"));
      };
    },
    eval(s) { fill($$(".set__cells .u", s), 0.5, 0.012); },
    exp(s) {
      $$(".score__cell", s).forEach((cell, i) => {
        if (hiddenByFragment(cell) || !$(".ubar", cell) || hiddenByFragment($(".ubar", cell))) return;
        const row = Math.floor(i / 2);
        fill($$(".u.on", cell), 0.5 + row * 0.25, 0.025);
        const n = $(".score__n", cell);
        if (n) countUp(n, 0.5 + row * 0.25);
      });
    },
    agree(s) {
      const cells = $$(".agrid .u", s);
      track(g.from(cells, { scale: 0.2, opacity: 0, duration: 0.5, ease: "back.out(2.2)", stagger: { each: 0.012, grid: [4, 20], from: "start", axis: "x" }, delay: 0.45, clearProps: "transform,opacity" }));
    },
    value(s) {
      $$(".card", s).forEach((card) => {
        if (hiddenByFragment(card)) return;
        $$("[data-count]", card).forEach((n) => countUp(n, 0.45));
        track(g.from($$(".fork > *", card), { x: -16, opacity: 0, duration: 0.6, stagger: 0.12, delay: 0.6, clearProps: "transform,opacity" }));
      });
    },
    limits(s) {
      track(g.from($$(".lim .ring", s), { scale: 0, duration: 0.6, ease: "back.out(3)", stagger: 0.09, delay: 0.5, clearProps: "transform" }));
    },
    demo(s) { swing($(".tag", s), 0.5); },
    end(s) { swing($(".end-tag .tag", s), 0.6); },
  };

  const BUILDS = {
    cost(el) {
      countUp($(".big-num", el), 0.15);
      sweep($$("mark", el), 0.6);
    },
    today(el) { track(g.from($$("li", el), { x: 30, opacity: 0, duration: 0.7, stagger: 0.12, clearProps: "transform,opacity" })); },
    hook(el) { riseLines(el); },
    out(el) {
      track(g.from($$(".out__ex > *", el), { x: 24, opacity: 0, duration: 0.6, stagger: 0.07, delay: 0.15, clearProps: "transform,opacity" }));
      sweep($$("mark", el), 0.5);
    },
    gap(el) { track(g.from($$("b", el), { opacity: 0.25, duration: 0.5, stagger: 0.18, delay: 0.35, ease: "power1.out", clearProps: "opacity" })); },
    added(el) {
      const s = el.closest("section");
      const loop = $('.arch__svg [data-draw="7"]', s);
      if (loop) draw([loop], 0.1, 1.0);
      track(g.from($$(".added .node, .added .tool", s), { y: 18, duration: 0.7, stagger: 0.12, delay: 0.2, clearProps: "transform" }));
    },
    cut(el) { track(g.from($$(".cut li", el), { x: 26, opacity: 0, duration: 0.6, stagger: 0.08, clearProps: "transform,opacity" })); },
    idtree(el) {
      track(g.from($$(".tree div", el), { x: -20, opacity: 0, duration: 0.5, stagger: 0.12, delay: 0.15, clearProps: "transform,opacity" }));
      track(g.from($$(".vrow", el), { y: 16, opacity: 0, duration: 0.6, stagger: 0.18, delay: 0.55, clearProps: "transform,opacity" }));
    },
    bars(el) {
      fill($$(".u.on", el), 0.1, 0.025);
      $$(".score__n", el).forEach((n) => countUp(n, 0.1));
    },
    abl(el) { fill($$(".u.on", el), 0.25, 0.006); },
    verdict(el) {
      const stamp = $(".stamp", el);
      const tl = track(g.timeline());
      tl.from(stamp, { scale: 2.4, opacity: 0, rotation: -14, duration: 0.55, ease: "expo.in" }, 0.05)
        .fromTo(el, { x: 0 }, { x: 6, duration: 0.05, repeat: 5, yoyo: true, ease: "none", clearProps: "transform" }, 0.6)
        .from($$("p", el), { y: 18, opacity: 0, duration: 0.7, stagger: 0.18, clearProps: "transform,opacity" }, 0.75);
    },
    whys(el) {
      draw($$("path[data-lead]", el), 0.05, 0.6);
      track(g.from($$(".why", el), { y: 20, opacity: 0, duration: 0.7, stagger: 0.12, delay: 0.3, clearProps: "transform,opacity" }));
    },
    panel(el) {
      $$("[data-count]", el).forEach((n) => countUp(n, 0.2));
      sweep($$("mark", el), 0.6);
      fill($$(".flag .u", el), 0.4, 0.1);
    },
    trio(el) { sweep($$("mark", el), 0.5); },
    easy(el) { riseLines($(".easy", el), 0.05); },
  };

  function enter(section) {
    killAll();
    if (still()) return;
    const items = $$("[data-in]", section).filter((el) => !hiddenByFragment(el));
    if (items.length) track(g.from(items, { y: 30, opacity: 0, duration: 0.95, stagger: 0.06, delay: 0.12, clearProps: "transform,opacity" }));
    $$("[data-split]", section).filter((el) => !hiddenByFragment(el)).forEach((el) => riseLines(el, 0.08));
    const scene = SCENES[section.dataset.id];
    if (scene) scene(section);
  }

  function build(fragments) {
    if (still()) return;
    fragments.forEach((f) => {
      const fn = BUILDS[f.dataset.build];
      if (fn) fn(f);
    });
  }

  // ---------------------------------------------------------------- reveal
  mountChrome();
  const deck = window.Reveal;
  deck.initialize({
    width: 1920, height: 1080, margin: 0, minScale: 0.05, maxScale: 4,
    center: false, hash: true, fragmentInURL: true, history: false,
    controls: false, progress: false, slideNumber: false, overview: true,
    transition: "ink", backgroundTransition: "none", viewDistance: 3,
    pdfSeparateFragments: false, pdfMaxPagesPerSlide: 1,
    scrollActivationWidth: null,
    defaultTiming: 60,
    plugins: window.RevealNotes ? [window.RevealNotes] : [],
  }).then(() => {
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    fonts.then(() => {
      layoutLeaders();
      updateChrome(deck.getIndices().h);
      enter(deck.getCurrentSlide());
      root.classList.add("is-ready");
    });
  });
  deck.on("slidechanged", (e) => {
    layoutLeaders();
    updateChrome(e.indexh);
    enter(e.currentSlide);
  });
  deck.on("fragmentshown", (e) => build(e.fragments || [e.fragment]));
  deck.on("overviewshown", () => chrome && chrome.classList.add("is-hidden"));
  deck.on("overviewhidden", () => updateChrome(deck.getIndices().h));
})();
