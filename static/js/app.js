// The page controller: describe → (question → answer) → assessment, with the Act map and the
// triage tag following along.

import { PRESETS, MORE_PRESETS, STRIPS, tierOf, caseNumber, glyph, esc, splitInjected } from "./data.js";
import * as R from "./render.js";
import * as M from "./motion.js";
import { createActMap } from "./actmap.js";
import { createReader } from "./reader.js";
import { assess, getJson } from "./api.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const el = {
  stage: $("#stage"), intro: $("#intro"), composer: $("#composer"), card: $("#composerForm"),
  field: $("#description"), assess: $("#assess"), edit: $(".composer__edit"), brief: $("#brief"),
  briefText: $("#briefText"), briefNote: $("#briefNote"), thread: $("#thread"), aside: $("#aside"),
  tagSlot: $("#tagSlot"), asideActions: $("#asideActions"), actCard: $("#actCard"), newCase: $("#newCase"),
  notice: $("#notice"), memo: $("#memo"), toast: $("#toast"), announcer: $("#announcer"),
  masthead: $(".masthead"), theme: $("#themeToggle"),
};

const state = {
  description: "", turns: [], question: null, last: null, lastTier: null,
  caseNo: "", checks: new Set(), preset: null, n: 0, abort: null, running: false, sway: null,
};

const map = createActMap($("#actMap"), $("#mapTip"), {
  onOpen: (id, from) => reader.open(id, { from, tier: state.last && from.classList.contains("is-cited") ? state.last.tier : null }),
});
const reader = createReader($("#reader"));

// ---------------------------------------------------------------- setup

function renderPresets() {
  const button = (p, small) => `<button type="button" class="preset${p.id === "hero" ? " preset--hero" : ""}${small ? " preset--small" : ""}" data-preset="${p.id}" ${p.tier ? `data-tier="${p.tier}"` : ""}>
      ${p.id === "inject" ? `<span class="preset__dot preset__dot--shield">${glyph("shield")}</span>` : `<span class="preset__dot"></span>`}
      <span class="preset__kind">${esc(p.kind)}</span>${esc(p.label)}</button>`;
  $("#presetRow").innerHTML = PRESETS.map((p) => button(p, false)).join("");
  $("#presetMore").innerHTML = `<span class="sr-only">More:</span>` + MORE_PRESETS.map((p) => button(p, true)).join("");
  $("#outcomeList").innerHTML = R.outcomes();
}

async function loadAct() {
  try {
    const act = await getJson("/api/act");
    const cells = map.render(act.chapters);
    if (el.stage.dataset.mode === "idle") M.cellsIn(cells);
  } catch {
    $("#actMap").innerHTML = `<p class="empty">The map of the Act could not be loaded.</p>`;
  }
}

async function checkStatus() {
  try {
    const s = await getJson("/api/status");
    if (!s.key) {
      showNotice(`<strong>No API key found.</strong> Copy <code>.env.example</code> to <code>.env</code>, set <code>ANTHROPIC_API_KEY</code>, and restart the app. You can browse the Act meanwhile.`);
    } else if (s.agent_error) {
      showNotice(`<strong>The agent could not start.</strong> Check the terminal running <code>app.py</code> for the error, then restart it.`);
    } else if (s.index_error) {
      showNotice(`<strong>The retrieval index did not load.</strong> Build it with <code>python scripts/build_embeddings.py</code>, then restart the app.`);
    } else if (s.loading) {
      showNotice(`Loading the Act’s search index. This takes a few seconds on first start.`);
      setTimeout(checkStatus, 1500);
    } else {
      el.notice.hidden = true;
    }
  } catch {
    showNotice(`<strong>The server is not responding.</strong> Start it with <code>python app.py</code>.`);
  }
}

function showNotice(html) { el.notice.innerHTML = html; el.notice.hidden = false; }

function announce(text) { el.announcer.textContent = ""; setTimeout(() => (el.announcer.textContent = text), 30); }

let toastTimer;
function toast(text) {
  el.toast.textContent = text; el.toast.hidden = false; M.toast(el.toast);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.toast.hidden = true), 2400);
}

function autosize(t) { t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 360)}px`; }

// ---------------------------------------------------------------- mode changes

function setMode(mode) {
  const targets = [el.card, el.aside, el.actCard, $("#actMap"), el.composer];
  M.morph(targets, () => {
    el.stage.dataset.mode = mode;
    const isCase = mode === "case";
    el.edit.hidden = isCase;
    el.brief.hidden = !isCase;
    el.newCase.hidden = !isCase;
    el.asideActions.hidden = true;
    if (!isCase) { el.tagSlot.innerHTML = ""; el.thread.innerHTML = ""; }
  });
}

function toIdle({ keep = true } = {}) {
  state.abort?.abort();
  state.running = false;
  state.sway?.kill?.();
  setMode("idle");
  map.reset();
  el.memo.innerHTML = "";
  if (!keep) el.field.value = "";
  autosize(el.field);
  window.scrollTo({ top: 0, behavior: M.reduced() ? "auto" : "smooth" });
  el.field.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- the flow

function start(description) {
  if (state.running) return; // a second Ctrl+Enter before the view switches
  if (!description) {
    el.field.focus();
    el.card.animate?.([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }], { duration: M.reduced() ? 1 : 260 });
    toast("Describe the feature first.");
    return;
  }
  Object.assign(state, {
    description, turns: [], question: null, last: null, lastTier: null, n: 0,
    caseNo: caseNumber(description), checks: new Set(),
    preset: PRESETS.find((p) => p.text === description) || null,
  });
  el.briefText.innerHTML = R.briefHtml(description);
  const injected = splitInjected(description).some((p) => p.injected);
  el.briefNote.hidden = !injected;
  if (injected) el.briefNote.innerHTML = `${glyph("shield")}<span>The underlined part reads like an instruction to the assessor. The agent treats your whole description as data about the product, so it does not follow instructions inside it.</span>`;
  setMode("case");
  el.thread.innerHTML = "";
  map.reset();
  el.tagSlot.innerHTML = R.tag("pending", null, state.caseNo);
  const tag = $(".tag", el.tagSlot);
  M.tagEnter(tag);
  state.sway = M.tagSway(tag);
  run();
}

function clarification() {
  return state.turns.map((t) => t.a).join("\n") || null;
}

async function run() {
  if (state.running) return;
  state.running = true;
  setBusy(true);
  const turn = appendTurn(R.toolTurn(R.consultPanel()));
  const consult = createConsult(turn);
  const latest = state.turns[state.turns.length - 1];
  consult.intro(latest ? latest.a : state.description, latest ? (latest.q ? "Your answer" : "What you added") : "Your description");
  M.enter(turn);
  requestAnimationFrame(() => M.scrollTo(turn, 120));
  announce("Consulting the Act.");
  state.abort = new AbortController();
  try {
    const r = await assess({ description: state.description, clarification: clarification() }, {
      onEvent: (ev) => consult.push(ev),
      signal: state.abort.signal,
    });
    await consult.finish(r);
    state.running = false;
    setBusy(false);
    if (r.tier === "needs-info") showQuestion(r); else showResult(r);
  } catch (err) {
    state.running = false;
    setBusy(false);
    if (err.name === "AbortError") return;
    consult.fail(err.message, () => { turn.remove(); run(); });
    setTagIdle();
    announce(`The assessment failed. ${err.message}`);
  }
}

function setBusy(busy) {
  $$(".answer button[type=submit], .refine button[type=submit]", el.thread).forEach((b) => (b.disabled = busy));
  const tag = $(".tag", el.tagSlot);
  if (!tag) return;
  tag.classList.toggle("is-busy", busy);
  if (busy && state.lastTier) {
    const m = $(".tag__meaning", tag);
    const last = state.turns[state.turns.length - 1];
    if (m) m.textContent = last?.q ? "Reassessing with your answer…" : "Reassessing with what you added…";
  }
}

function setTagIdle() {
  const tag = $(".tag", el.tagSlot);
  if (!tag || state.lastTier) { const m = $(".tag__meaning", tag || el.tagSlot); if (m) m.textContent = "Not updated. Try again."; return; }
  state.sway?.kill?.();
  $(".tag__tier", tag).textContent = "Not assessed";
  $(".tag__meaning", tag).textContent = "The assessment stopped. Try again.";
}

function appendTurn(html) {
  el.thread.insertAdjacentHTML("beforeend", html);
  return el.thread.lastElementChild;
}

// ---------------------------------------------------------------- consult panel

function createConsult(turn) {
  const panel = $(".consult", turn);
  const feed = $(".feed", panel);
  const reading = $(".reading__inner", panel);
  const timer = $(".consult__timer", panel);
  const steps = $$(".step", panel);
  const t0 = performance.now();
  let phase = 0, lastEvent = 0, done = false, raf = 0;
  const queue = []; let draining = false;
  const seen = []; let lastSwap = 0, pendingSwap = null, cycleTimer = 0, cycleIdx = 0, scanTween = null;

  const tick = () => {
    if (done) return;
    timer.textContent = `${((performance.now() - t0) / 1000).toFixed(1)} s`;
    if (lastEvent && phase < 3 && !draining && performance.now() - lastEvent > 1500) setPhase(3);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  function setPhase(p) {
    if (p === phase) return;
    phase = p;
    steps.forEach((s, i) => { s.classList.toggle("is-done", i < p); s.classList.toggle("is-active", i === p); });
    if (p === 3) startCycle(); else stopCycle();
    if (p === 3) $(".consult__label", panel).textContent = "Drafting the assessment";
    else $(".consult__label", panel).textContent = "Consulting the Act";
  }

  function showReading(item, label) {
    const now = performance.now();
    const doSwap = () => {
      lastSwap = performance.now();
      scanTween?.kill?.();
      M.readingSwap(reading, () => {
        reading.innerHTML = R.readingCard(item, label);
        scanTween = M.scan($(".reading__scan", reading), $(".reading__text", reading));
      });
    };
    clearTimeout(pendingSwap);
    if (now - lastSwap > 850) doSwap();
    else pendingSwap = setTimeout(doSwap, 850 - (now - lastSwap));
  }

  function startCycle() {
    stopCycle();
    const items = seen.filter((s) => s.excerpt);
    if (items.length < 2) return;
    cycleTimer = setInterval(() => {
      cycleIdx = (cycleIdx + 1) % items.length;
      showReading(items[cycleIdx], "From what it read");
    }, 2400);
  }
  function stopCycle() { clearInterval(cycleTimer); cycleTimer = 0; }

  function show(ev) {
    lastEvent = performance.now();
    $(".feed__wait", feed)?.remove();
    if (phase === 0) $(".consult__label", panel).textContent = "Consulting the Act";
    if (ev.type === "search") {
      setPhase(1);
      feed.insertAdjacentHTML("beforeend", R.feedSearch(ev));
      const row = feed.lastElementChild;
      M.feedRow(row);
      M.hits($$(".chip", row));
      ev.hits.forEach((h, i) => setTimeout(() => map.hit(h.id), M.reduced() ? 0 : i * 70));
      ev.hits.forEach((h) => { if (!seen.some((s) => s.id === h.id)) seen.push({ ...h, kind: "hit" }); });
      if (ev.hits[0]) showReading(ev.hits[0], "Top result");
    } else if (ev.type === "read" && ev.found) {
      setPhase(2);
      feed.insertAdjacentHTML("beforeend", R.feedRead(ev));
      const row = feed.lastElementChild;
      M.feedRow(row, $(".feed__id", row), ev.id);
      map.read(ev.id);
      const known = seen.findIndex((s) => s.id === ev.id);
      if (known >= 0) seen.splice(known, 1);
      seen.push({ ...ev, kind: "read" });
      showReading(ev, "Now reading");
    }
    feed.scrollTo({ top: feed.scrollHeight, behavior: M.reduced() ? "auto" : "smooth" });
  }

  function drain() {
    const ev = queue.shift();
    if (!ev) { draining = false; return; }
    draining = true;
    show(ev);
    setTimeout(drain, M.reduced() ? 0 : ev.type === "read" ? 150 : 320);
  }

  function stop() {
    done = true;
    cancelAnimationFrame(raf);
    stopCycle();
    clearTimeout(pendingSwap);
    scanTween?.kill?.();
    panel.setAttribute("aria-busy", "false");
  }

  return {
    intro(text, label) {
      reading.innerHTML = `<div class="reading__label"><span class="eyebrow">Reading</span><span class="reading__id reading__id--plain">${esc(label)}</span></div>
        <div class="reading__text reading__text--plain"><span class="reading__scan"></span>${esc(text)}</div>`;
      lastSwap = performance.now();
      scanTween = M.scan($(".reading__scan", reading), $(".reading__text", reading));
    },
    push(ev) {
      if (ev.type === "start") {
        if (ev.indexing) {
          $(".consult__label", panel).textContent = "Loading the Act’s search index";
          const wait = $(".feed__wait", feed);
          if (wait) wait.firstChild.textContent = "First start after launch: loading the search index over the Act. This happens once, then the agent starts reading";
        }
        return;
      }
      if (ev.type === "queued") {
        // Assessments run one at a time; this one waits for an earlier one (another tab, or one just abandoned).
        $(".consult__label", panel).textContent = "Waiting for an earlier assessment";
        const wait = $(".feed__wait", feed);
        if (wait) wait.firstChild.textContent = "Another assessment is still running on the server. This one starts as soon as it finishes";
        return;
      }
      queue.push(ev);
      if (!draining) drain();
    },
    async finish(r) {
      // Let any queued rows land before collapsing.
      while (queue.length || draining) await new Promise((res) => setTimeout(res, 60));
      stop();
      map.settle();
      const reads = r.consulted.filter((c) => c.read).length;
      const retrieved = r.consulted.length;
      $(".consult__sum-text", panel).innerHTML = `${glyph("read")}Retrieved <b>${retrieved}</b> provision${retrieved === 1 ? "" : "s"}, read <b>${reads}</b> in full, in <b>${esc(r.elapsed)} s</b>`;
      await M.resize(panel, () => { steps.forEach((s) => { s.classList.remove("is-active"); s.classList.add("is-done"); }); panel.classList.add("is-done"); });
      $(".consult__toggle", panel).addEventListener("click", (e) => {
        const open = !panel.classList.contains("is-open");
        M.resize(panel, () => panel.classList.toggle("is-open", open));
        e.currentTarget.setAttribute("aria-expanded", String(open));
        e.currentTarget.textContent = open ? "Hide" : "Show what it read";
      });
    },
    fail(message, retry) {
      stop();
      panel.classList.add("is-failed");
      steps.forEach((s) => s.classList.remove("is-active"));
      $(".consult__label", panel).textContent = "The assessment stopped";
      panel.insertAdjacentHTML("beforeend", `<div class="consult__error"><p>${esc(message)}</p><div><button class="btn btn--primary btn--sm" type="button">Try again</button></div></div>`);
      $(".consult__error button", panel).addEventListener("click", retry);
      $(".consult__error button", panel).focus({ preventScroll: true });
    },
  };
}

// ---------------------------------------------------------------- question

function showQuestion(r) {
  state.question = r.clarifying_question;
  state.lastTier = "needs-info";
  const examples = state.preset?.answers && state.turns.length === 0 ? state.preset.answers : [];
  updateTag("question", r);
  const turn = appendTurn(R.toolTurn(R.questionCard(r, { examples, baseline: r.baseline_tier, description: state.description })));
  const card = $(".question", turn);
  M.question(card);
  const field = $("textarea", card);
  field.addEventListener("input", () => autosize(field));
  field.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("form", card).requestSubmit(); } });
  $("form", card).addEventListener("submit", (e) => { e.preventDefault(); answer(card, field.value.trim()); });
  $$(".example", card).forEach((b) => b.addEventListener("click", () => {
    if (state.running) return;
    const ex = examples[Number(b.dataset.example)];
    M.typeInto(field, ex.text, () => setTimeout(() => answer(card, field.value.trim()), M.reduced() ? 0 : 280));
  }));
  M.scrollTo(turn, 110);
  setTimeout(() => field.focus({ preventScroll: true }), M.reduced() ? 0 : 650);
  announce(`One question before the assessment: ${r.clarifying_question}`);
}

function answer(card, text) {
  if (state.running) return;
  const field = $("textarea", card);
  if (!text) { field.focus(); toast("Type an answer first."); return; }
  card.classList.add("is-answered");
  const turn = appendTurn(R.youTurn(text, { qa: "A." }));
  M.enter(turn);
  state.turns.push({ q: state.question, a: text });
  run();
}

// ---------------------------------------------------------------- result

function showResult(r) {
  const previous = state.turns.length && state.lastTier ? state.lastTier : null;
  r._n = ++state.n;
  $$(".dossier", el.thread).forEach((d) => {
    d.classList.add("is-superseded");
    const top = $(".verdict__top", d);
    if (top && !$(".superseded-note", top)) top.insertAdjacentHTML("beforeend", `<span class="superseded-note">Superseded by the reassessment below</span>`);
  });
  state.last = r;
  state.lastTier = r.tier;
  state.checks = new Set();
  updateTag("result", r);
  const cited = [...r.citations, ...r.obligations.map((o) => o.citation).filter(Boolean)];
  map.cite(cited, r.tier);
  const turn = appendTurn(R.toolTurn(R.dossier(r, { turns: state.turns, description: state.description, previous, checks: state.checks, updateLabel: state.turns[state.turns.length - 1]?.q ? "Updated by your answer" : "Updated by what you added" })));
  const dossier = $(".dossier", turn);
  M.dossier(dossier);
  el.asideActions.hidden = false;
  M.enter(el.asideActions, { delay: 0.6 });
  buildMemo();
  M.scrollTo(turn, 96);
  setTimeout(() => dossier.focus({ preventScroll: true }), M.reduced() ? 0 : 700);
  announce(`Assessment ready: ${tierOf(r.tier).label}, ${r.confidence} confidence. ${r.key_facts.length} key facts, ${r.to_confirm.length} points to confirm, ${r.obligations.length} next steps.`);
  Object.values(r.provisions).forEach((p) => reader.prefetch(p.id));
}

function updateTag(kind, r) {
  const old = $(".tag", el.tagSlot);
  state.sway?.kill?.();
  el.tagSlot.innerHTML = R.tag(kind, r, state.caseNo);
  const tag = $(".tag", el.tagSlot);
  if (!old) M.tagEnter(tag); else M.tagSettle(tag);
  if (kind === "question") { state.sway = M.tagSway(tag); return; }
  if (kind === "result") {
    // Keep the strips from the top down to the verdict's tier; out of scope sits below the ladder, so every strip goes.
    const level = tierOf(r.tier).level ?? 0;
    const strips = $$(".tag__strip", tag);
    const torn = r.tier === "out-of-scope" ? strips : strips.filter((s) => Number(s.dataset.level) < level);
    M.tear(torn, () => { if (torn.length === STRIPS.length) tag.classList.add("is-flat"); });
  }
}

function buildMemo() {
  if (!state.last) return;
  el.memo.innerHTML = R.memo(state.last, { description: state.description, turns: state.turns, caseNo: state.caseNo, checks: state.checks });
}

// ---------------------------------------------------------------- actions

function exportAssessment() {
  if (!state.last) return;
  buildMemo();
  const title = document.title;
  document.title = `AI Act Triage - Case ${state.caseNo} - ${tierOf(state.last.tier).label}`;
  window.addEventListener("afterprint", () => (document.title = title), { once: true });
  window.print();
}

async function copyText() {
  if (!state.last) return;
  const text = R.memoText(state.last, { description: state.description, turns: state.turns, caseNo: state.caseNo });
  try { await navigator.clipboard.writeText(text); toast("Copied the assessment as text."); }
  catch { toast("Copying is blocked here. Use Export instead."); }
}

function onAction(name) {
  if (name === "export") exportAssessment();
  if (name === "copy") copyText();
  if (name === "new") toIdle({ keep: false });
}

// ---------------------------------------------------------------- events

el.card.addEventListener("submit", (e) => { e.preventDefault(); start(el.field.value.trim()); });
el.field.addEventListener("input", () => autosize(el.field));
el.field.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); el.card.requestSubmit(); }
});
$("#editBrief").addEventListener("click", () => toIdle({ keep: true }));
el.newCase.addEventListener("click", () => toIdle({ keep: false }));

el.composer.addEventListener("click", (e) => {
  const b = e.target.closest("[data-preset]");
  if (!b || state.running) return;
  const p = [...PRESETS, ...MORE_PRESETS].find((x) => x.id === b.dataset.preset);
  el.field.focus({ preventScroll: true });
  M.typeInto(el.field, p.text, () => setTimeout(() => start(p.text), M.reduced() ? 0 : 220));
});

document.addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]");
  if (open) {
    e.preventDefault();
    const inCited = open.closest(".dossier") || open.classList.contains("chip--tier");
    reader.open(open.dataset.open, { from: open, tier: inCited && state.last ? (open.closest("[data-tier]")?.dataset.tier || state.last.tier) : null, label: inCited ? "Cited" : "Retrieved" });
    return;
  }
  const action = e.target.closest("[data-action]");
  if (action) { onAction(action.dataset.action); return; }
  const confirm = e.target.closest("[data-confirm]");
  if (confirm) {
    const dossier = confirm.closest(".dossier");
    const item = state.last?.to_confirm[Number(confirm.dataset.confirm)];
    const field = $(".refine textarea", dossier);
    if (field && item) {
      field.value = `Regarding "${item}": `;
      M.scrollTo(field.closest(".refine"), 140);
      setTimeout(() => { field.focus({ preventScroll: true }); field.setSelectionRange(field.value.length, field.value.length); }, M.reduced() ? 0 : 420);
    }
  }
});

el.thread.addEventListener("change", (e) => {
  const box = e.target.closest("[data-ob]");
  if (!box) return;
  const i = Number(box.dataset.ob);
  box.checked ? state.checks.add(i) : state.checks.delete(i);
  box.closest(".ob").classList.toggle("is-done", box.checked);
  const dossier = box.closest(".dossier");
  const total = state.last.obligations.length;
  const done = state.checks.size;
  const bar = $(".progress__bar i", dossier);
  if (bar) bar.style.width = `${(done / total) * 100}%`;
  const n = $(".progress__n", dossier);
  if (n) n.textContent = `${done} of ${total} done`;
  buildMemo();
});

el.thread.addEventListener("submit", (e) => {
  const form = e.target.closest(".refine");
  if (!form) return;
  e.preventDefault();
  if (state.running) return;
  const field = $("textarea", form);
  const text = field.value.trim();
  if (!text) { field.focus(); toast("Add a detail first."); return; }
  const turn = appendTurn(R.youTurn(text, { meta: "Added to the description" }));
  M.enter(turn);
  state.turns.push({ q: null, a: text });
  run();
});

el.thread.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.matches(".refine textarea")) {
    e.preventDefault(); e.target.closest("form").requestSubmit();
  }
});

// Theme: follow the system until the user picks one; the switch wipes in from the button.
function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
function syncThemeLabel() {
  el.theme.setAttribute("aria-label", currentTheme() === "dark" ? "Switch to light theme" : "Switch to dark theme");
}
el.theme.addEventListener("click", (e) => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  const apply = () => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("triage-theme", next); } catch {}
    syncThemeLabel();
  };
  if (!document.startViewTransition || M.reduced()) { apply(); return; }
  const r = el.theme.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(apply).ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  }).catch(() => {});
});
syncThemeLabel();

window.addEventListener("scroll", () => el.masthead.classList.toggle("is-scrolled", window.scrollY > 8), { passive: true });

// ---------------------------------------------------------------- boot

renderPresets();
autosize(el.field);
M.intro({
  headline: $("#headline"),
  items: [$(".intro .eyebrow"), $(".lede"), $(".values"), $(".proof"), el.card, $("#presets"), $(".actcard__head"), $("#outcomes")].filter(Boolean),
});
loadAct();
checkStatus();
