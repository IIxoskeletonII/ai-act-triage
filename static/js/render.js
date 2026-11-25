// HTML builders. Every string from the server or the user passes through esc().

import { TIERS, tierOf, STRIPS, glyph, esc, cap, confidenceLevel, factSource, splitInjected } from "./data.js";

const TOOL_LABEL = `<span class="brand__mark" aria-hidden="true"><span>§</span></span>Triage`;

export function youTurn(text, { qa = null, meta = "" } = {}) {
  return `<div class="turn turn--you">
    <p class="turn__label">You</p>
    <div class="turn__body">${qa ? `<span class="qa" aria-hidden="true">${qa}</span>` : ""}${esc(text)}${meta ? `<span class="turn__meta">${esc(meta)}</span>` : ""}</div>
  </div>`;
}

export function toolTurn(inner, cls = "") {
  return `<div class="turn turn--tool ${cls}">
    <p class="turn__label">${TOOL_LABEL}</p>
    <div class="turn__body">${inner}</div>
  </div>`;
}

export function consultPanel() {
  return `<div class="consult" aria-busy="true">
    <div class="consult__summary">
      <p class="consult__sum-text"></p>
      <button type="button" class="consult__toggle" aria-expanded="false">Show what it read</button>
    </div>
    <div class="consult__body">
      <div class="consult__head">
        <p class="consult__title"><span class="consult__spinner" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="consult__label">Consulting the Act</span></p>
        <span class="consult__timer" aria-hidden="true">0.0 s</span>
      </div>
      <ol class="steps" aria-label="Progress">
        <li class="step is-active" data-step="0">Reading your description</li>
        <li class="step" data-step="1">Searching the Act</li>
        <li class="step" data-step="2">Reading provisions</li>
        <li class="step" data-step="3">Drafting the assessment</li>
      </ol>
      <div class="consult__grid">
        <ol class="feed" aria-label="Searches and provisions read"><li class="feed__wait">Reading your description and deciding what to look up in the Act<span class="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></li></ol>
        <div class="reading" aria-hidden="true">
          <div class="reading__inner">
            <p class="reading__empty">The provisions it opens appear here as it reads them.</p>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

export function feedSearch(ev) {
  return `<li class="feed__row">${glyph("search")}<div>
    <span class="feed__what">Searched the Act for</span> <q>${esc(ev.query)}</q>
    <div class="feed__hits">${ev.hits.map((h) => `<button type="button" class="chip" data-open="${esc(h.id)}" title="${esc(h.title)}">${esc(h.id)}</button>`).join("")}</div>
  </div></li>`;
}

export function feedRead(ev) {
  return `<li class="feed__row">${glyph("read")}<div>
    <span class="feed__what">Read</span> <button type="button" class="feed__id" data-open="${esc(ev.id)}">${esc(ev.id)}</button>
    <span class="feed__title">· ${esc(ev.title || "")}</span>
  </div></li>`;
}

export function readingCard(item, label) {
  return `<div class="reading__label"><span class="eyebrow">${esc(label)}</span><span class="reading__id">${esc(item.id)}</span></div>
    <p class="reading__title">${esc(item.title || "")}</p>
    <div class="reading__text"><span class="reading__scan"></span>${esc(item.excerpt || "")}</div>`;
}

let fieldSeq = 0;
export function questionCard(r, { examples = [], baseline = null, description = "" } = {}) {
  const fid = `answer-${++fieldSeq}`;
  const known = r.key_facts?.length
    ? `<ul>${r.key_facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`
    : `<p>“${esc(description)}”</p>`;
  const base = baseline && baseline !== "needs-info"
    ? `<p class="question__baseline">${glyph("warn")}<span>Without asking, a keyword baseline would have answered <b>${esc(tierOf(baseline).label)}</b>.</span></p>` : "";
  return `<div class="question" data-tier="needs-info">
    <p class="question__eyebrow eyebrow">${glyph("question")}One question before I assess this</p>
    <div class="question__q"><span class="question__mark" aria-hidden="true">Q.</span><h2 class="question__text" tabindex="-1">${esc(r.clarifying_question || "Can you say more about how the system’s output is used, and who acts on it?")}</h2></div>
    <div class="question__why">
      <div><h3>Why I’m asking</h3><p>${esc(r.rationale)}</p></div>
      <div><h3>What I know so far</h3>${known}</div>
    </div>
    <form class="answer" novalidate>
      <span class="answer__mark" aria-hidden="true">A.</span>
      <div>
        <label class="sr-only" for="${fid}">Your answer</label>
        <textarea id="${fid}" rows="2" maxlength="2000" placeholder="Your answer, in a sentence or two"></textarea>
      </div>
      <div class="answer__foot">
        <div class="examples">${examples.length ? `<span class="examples__label">Example answers:</span>${examples.map((e, i) => `<button type="button" class="example" data-example="${i}">${esc(e.label)}</button>`).join("")}` : ""}</div>
        <button class="btn btn--tier" type="submit">Answer and reassess ${glyph("arrow")}</button>
      </div>
    </form>
    ${base}
  </div>`;
}

export function tag(state, r, caseNo) {
  // state: pending | question | result
  const tierKey = state === "pending" ? null : state === "question" ? "needs-info" : r.tier;
  const t = tierKey ? tierOf(tierKey) : null;
  const name = state === "pending" ? "Assessing" : t.label;
  const meaning = state === "pending" ? "Consulting the Act…" : state === "question" ? "Waiting for your answer" : t.meaning;
  const basis = state === "result" && r.citations.length ? r.citations.join(" · ") : state === "result" ? "No provision cited" : "—";
  const level = state === "result" ? confidenceLevel(r.confidence) : 0;
  const conf = state === "result" ? `${cap(r.confidence)}` : "—";
  return `<div class="tag" data-state="${state}" ${tierKey ? `data-tier="${tierKey}"` : ""}>
    <span class="tag__string" aria-hidden="true"><svg viewBox="0 0 120 52"><path d="M18 50 C 22 30, 44 10, 70 8 S 110 14, 118 2"/></svg></span>
    <div class="tag__body">
      <span class="tag__ring" aria-hidden="true"></span>
      <div class="tag__top"><span class="tag__brand">AI Act Triage</span><span class="tag__no">No. ${esc(caseNo)}</span></div>
      <div class="tag__main">
        <span class="tag__glyph" aria-hidden="true">${glyph(t ? t.glyph : "clock")}</span>
        <div><p class="tag__tier">${esc(name)}</p><p class="tag__meaning">${esc(meaning)}</p></div>
      </div>
      <dl class="tag__meta">
        <div><dt>Confidence</dt><dd><span class="pips" data-level="${level}" aria-hidden="true"><i></i><i></i><i></i></span>${esc(conf)}</dd></div>
        <div><dt>Basis</dt><dd class="mono">${esc(basis)}</dd></div>
      </dl>
    </div>
    <ol class="tag__strips" aria-hidden="true">${STRIPS.map((s) => `<li class="tag__strip" data-level="${s.level}"><span>${s.label}</span><span>${s.ref}</span></li>`).join("")}</ol>
    <p class="sr-only">${state === "result" ? `Severity ${t.level === null ? "undetermined" : `${t.level} of 4`}.` : ""}</p>
  </div>`;
}

function lawCard(p, tier) {
  const leads = p.lead || [];
  const lead = leads.length ? `<span class="lawcard__lead">${leads.length > 1 ? "… " : ""}${esc(leads[leads.length - 1])}</span>` : "";
  const text = esc(p.text).replace(/\n/g, "<br>");
  const long = (p.text || "").length + (leads[leads.length - 1] || "").length > 480;
  const where = p.heading.replace(/^ANNEX/, "Annex");
  return `<button type="button" class="lawcard" data-open="${esc(p.id)}" data-tier="${tier}" aria-label="Read ${esc(p.id)} in context">
    <span class="lawcard__top"><span class="chip chip--tier">${esc(p.id)}</span><span class="lawcard__open">Read in context ${glyph("arrow")}</span></span>
    <span class="lawcard__where"><b>${esc(where)} · ${esc(p.title)}</b></span>
    <span class="lawcard__text${long ? " is-long" : ""}">${lead}<span class="lawcard__cited"><mark>${text}</mark></span></span>
  </button>`;
}

const STEP_CAPTION = {
  "prohibited": "What the Act requires. The prohibition is the next step.",
  "high-risk": "The core obligations for a high-risk system. Each links to the provision that imposes it.",
  "limited-risk": "The transparency duty that applies, with the provision that imposes it.",
  "minimal-risk": "No mandatory obligations for this tier. These are the duties and good practice that still apply.",
  "out-of-scope": "The Act does not apply, so it imposes no obligations.",
};

export function dossier(r, { turns, description, previous, checks, updateLabel = "Updated by your answer" }) {
  const t = tierOf(r.tier);
  const tier = r.tier;
  const level = confidenceLevel(r.confidence);
  const update = !previous ? ""
    : previous === r.tier
      ? `<span class="update">${glyph("chat")}${esc(updateLabel.replace("Updated", "Reassessed"))} · still ${esc(t.label)}</span>`
      : `<span class="update">${glyph("chat")}${esc(updateLabel)} <s>${esc(tierOf(previous).label)}</s> → ${esc(t.label)}</span>`;
  const baseline = r.baseline_tier
    ? (r.baseline_tier === r.tier
        ? `<span>${glyph("tick")}A keyword baseline gets the same label. It can’t give you anything below.</span>`
        : `<span>${glyph("warn")}A keyword baseline would have said <b>${esc(tierOf(r.baseline_tier).label)}</b>.</span>`) : "";
  const facts = r.key_facts.length
    ? `<ol class="facts">${r.key_facts.map((f) => {
        const src = factSource(f, description, turns);
        const label = { description: "from your description", answer: "from your answer", added: "from what you added" }[src];
        return `<li class="fact${src === "description" ? "" : " from-answer"}"><span class="fact__q" aria-hidden="true">“</span><p class="fact__text">${esc(cap(f))}</p><span class="fact__src">${label}</span></li>`;
      }).join("")}</ol>`
    : `<p class="empty">No stated facts were recorded for this verdict.</p>`;
  const confirm = r.to_confirm.length
    ? `<ol class="confirm">${r.to_confirm.map((c, i) => `<li class="confirm__item"><span class="confirm__dot" aria-hidden="true"></span><p class="confirm__text">${esc(c)}</p><button type="button" class="confirm__act" data-confirm="${i}">Add the answer</button></li>`).join("")}</ol>`
    : `<p class="empty">Nothing material is open on the facts given.</p>`;
  const lawIds = r.citations.filter((c) => r.provisions[c]);
  const law = lawIds.length
    ? `<div class="law">${lawIds.map((c) => lawCard(r.provisions[c], tier)).join("")}</div>
       <p class="law__key"><i>Aa</i>Text set in serif is quoted verbatim from the Regulation.</p>`
    : `<p class="empty">${tier === "minimal-risk" ? "No prohibition, high-risk category or transparency duty applies, so no provision is cited for the tier." : "No provision is cited for this verdict."}</p>`;
  const obligations = r.obligations.length
    ? `<div class="steps-list">${r.obligations.map((o, i) => obligation(o, i, tier, checks.has(i))).join("")}</div>`
    : `<p class="empty">${esc(STEP_CAPTION[tier] || "No obligations.")}</p>`;
  const done = r.obligations.filter((_, i) => checks.has(i)).length;
  const cited = [...new Set([...r.citations, ...r.obligations.map((o) => o.citation).filter(Boolean)])];
  const invalid = r.invalid_citations || [];
  const guard = invalid.length
    ? `<span class="warn">${glyph("warn")}${invalid.length} cited id${invalid.length > 1 ? "s" : ""} not found in the Act: ${esc(invalid.join(", "))}</span>`
    : `<span class="ok">${glyph("shield")}${cited.length === 1 ? "The cited id is" : `All ${cited.length} cited ids are`} real provisions of the Act</span>`;
  const reads = r.consulted.filter((c) => c.read).length;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return `<article class="dossier" data-tier="${tier}" tabindex="-1" aria-labelledby="verdict-${r._n}">
    <header class="verdict">
      <div class="verdict__top"><span class="eyebrow">Assessment</span>${update}</div>
      <div class="verdict__main">
        <div class="verdict__tier">${glyph(t.glyph)}<h2 id="verdict-${r._n}">${esc(t.label)}</h2></div>
        <span class="verdict__conf"><span class="pips" data-level="${level}" aria-hidden="true"><i></i><i></i><i></i></span>${esc(cap(r.confidence))} confidence</span>
      </div>
      <p class="verdict__meaning">${esc(t.meaning)}</p>
      <p class="verdict__rationale">${esc(r.rationale)}</p>
      <p class="verdict__check">${baseline}</p>
    </header>

    <div class="findings">
      <section aria-labelledby="facts-${r._n}">
        <div class="section-head"><div><h3 id="facts-${r._n}">What in your description led to this</h3><p>The facts you stated that decided the tier.</p></div></div>
        ${facts}
      </section>
      <section aria-labelledby="confirm-${r._n}">
        <div class="section-head"><div><h3 id="confirm-${r._n}">What you still need to confirm<span class="count">${r.to_confirm.length}</span></h3><p>Open points the verdict depends on.</p></div></div>
        ${confirm}
      </section>
    </div>

    <section class="section--law" aria-labelledby="law-${r._n}">
      <div class="section-head"><div><h3 id="law-${r._n}">The law behind it</h3><p>The provisions the verdict rests on. Open one to read it in its article.</p></div></div>
      ${law}
    </section>

    <section class="section--steps" aria-labelledby="steps-${r._n}">
      <div class="section-head">
        <div><h3 id="steps-${r._n}">Your next steps</h3><p>${esc(STEP_CAPTION[tier] || "")}</p></div>
        ${r.obligations.length > 1 ? `<span class="progress"><span class="progress__bar"><i style="width:${(done / r.obligations.length) * 100}%"></i></span><span class="progress__n">${done} of ${r.obligations.length} done</span></span>` : ""}
      </div>
      ${obligations}
    </section>

    <div class="provenance">
      ${guard}
      <span>${glyph("read")}${plural(r.consulted.length, "provision")} retrieved, ${reads} read in full, ${r.searches.length} search${r.searches.length === 1 ? "" : "es"}</span>
      <span>${glyph("clock")}${esc(r.elapsed)} s</span>
      <span class="mono">${esc(r.model)}</span>
      <p class="provenance__ai">First-pass triage, AI-generated, not legal advice. The tool labels its own output as AI-generated, the kind of disclosure Article 50 asks of AI systems.</p>
    </div>

    <form class="refine" novalidate>
      <label for="refine-${r._n}">Add a detail or answer an open point</label>
      <p>The assessment reruns on everything you’ve said so far.</p>
      <textarea id="refine-${r._n}" rows="2" maxlength="2000" placeholder="For example: we only sell in the EU, and we are the provider."></textarea>
      <div class="refine__foot"><button class="btn btn--primary btn--sm" type="submit">Reassess ${glyph("arrow")}</button></div>
    </form>

    <div class="dossier__actions">
      <button class="btn btn--primary" type="button" data-action="export">${glyph("doc")}Export assessment</button>
      <button class="btn btn--ghost" type="button" data-action="copy">Copy as text</button>
      <button class="btn btn--ghost" type="button" data-action="new">New assessment</button>
    </div>
  </article>`;
}

function obligation(o, i, tier, checked) {
  const cite = o.citation ? `<button type="button" class="chip chip--tier" data-open="${esc(o.citation)}" data-tier="${tier}" aria-label="Read ${esc(o.citation)}">${esc(o.citation)}</button>` : "";
  if (tier === "prohibited") {
    return `<div class="ob ob--stop" data-tier="${tier}"><span class="ob__stop" aria-hidden="true">${glyph("stop")}</span>
      <p class="ob__text"><span class="ob__head">Do not launch as described</span>${esc(o.text)}</p>${cite}</div>`;
  }
  return `<div class="ob${checked ? " is-done" : ""}" data-tier="${tier}">
    <span class="ob__box"><input type="checkbox" id="ob-${i}-${Date.now()}" data-ob="${i}" ${checked ? "checked" : ""} aria-label="Mark as done: ${esc(o.text)}"><span aria-hidden="true">${glyph("tick")}</span></span>
    <p class="ob__text">${esc(o.text)}</p>${cite}</div>`;
}

export function briefHtml(text) {
  return splitInjected(text).map((p) => p.injected ? `<mark class="inject">${esc(p.text)}</mark>` : esc(p.text)).join("");
}

export function outcomes() {
  return Object.entries(TIERS).map(([key, t]) => `<li class="outcome" data-tier="${key}">${glyph(t.glyph)}<b>${esc(t.label)}</b><span>${esc(t.short)}</span></li>`).join("");
}

// ---------- the one-page export ----------
export function memo(r, { description, turns, caseNo, checks }) {
  const t = tierOf(r.tier);
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const qa = turns.map((x) => x.q ? `<p class="memo__qa"><b>Q.</b> ${esc(x.q)}<br><b>A.</b> ${esc(x.a)}</p>` : `<p class="memo__qa"><b>Added:</b> ${esc(x.a)}</p>`).join("");
  const list = (items, empty) => items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : `<p>${empty}</p>`;
  const obligations = r.obligations.length
    ? `<ul>${r.obligations.map((o, i) => `<li class="box${checks.has(i) ? " done" : ""}">${esc(o.text)} ${o.citation ? `<span class="mono">${esc(o.citation)}</span>` : ""}</li>`).join("")}</ul>`
    : `<p>No obligations for this tier.</p>`;
  const law = r.citations.filter((c) => r.provisions[c]).map((c) => {
    const p = r.provisions[c];
    const text = [...(p.lead || []), p.text].join(" ");
    return `<div><b>${esc(c)}</b> <span class="mono">${esc(p.heading.replace(/^ANNEX/, "Annex"))} · ${esc(p.title)}</span><p>“${esc(text.length > 560 ? text.slice(0, 557).replace(/\s+\S*$/, "") + " …" : text)}”</p></div>`;
  }).join("") || "<p>No provision cited for the tier.</p>";
  return `<header class="memo__head">
      <div>
        <div class="memo__brand"><span class="brand__mark" aria-hidden="true"><span>§</span></span><h1>AI Act Triage · First-pass assessment</h1></div>
        <p class="memo__sub">Case No. ${esc(caseNo)} · ${esc(date)} · Regulation (EU) 2024/1689 (EU AI Act)</p>
      </div>
      <p class="memo__stamp">First-pass triage<br>AI-generated<br>Not legal advice<small>Verify before relying on it</small></p>
    </header>
    <section><h2>Feature under review</h2><p class="memo__desc">“${esc(description)}”</p>${qa}</section>
    <section data-tier="${r.tier}"><div class="memo__verdict">
      <div class="memo__tier"><strong>${esc(t.label)}</strong><span>${esc(cap(r.confidence))} confidence · ${esc(r.citations.join(", ") || "no provision cited")}</span></div>
      <div><h2>Why</h2><p>${esc(r.rationale)}</p></div>
    </div></section>
    <section class="memo__two">
      <div><h2>What in the description led to this</h2>${list(r.key_facts, "No stated facts recorded.")}</div>
      <div><h2>Still to confirm</h2>${list(r.to_confirm, "Nothing material is open.")}</div>
    </section>
    <section><h2>Next steps</h2>${obligations}</section>
    <section class="memo__law"><h2>The law cited, verbatim</h2>${law}</section>
    <section class="memo__foot">
      Generated by AI Act Triage (${esc(r.model)}) in ${esc(r.elapsed)} s after reading ${r.consulted.filter((c) => c.read).length} provisions; every cited id was checked against the Act’s text${(r.invalid_citations || []).length ? `, except ${esc(r.invalid_citations.join(", "))}` : ""}.
      This document is AI-generated and says so, in the spirit of the transparency duties in Article 50 of the Act. It is a first-pass triage to help decide whether to seek advice, not legal advice. Official text: ELI http://data.europa.eu/eli/reg/2024/1689/oj
    </section>`;
}

export function memoText(r, { description, turns, caseNo }) {
  const t = tierOf(r.tier);
  const lines = [
    `AI Act Triage · First-pass assessment (Case No. ${caseNo})`,
    `FIRST-PASS TRIAGE · AI-GENERATED · NOT LEGAL ADVICE`,
    ``,
    `Feature: "${description}"`,
    ...turns.map((x) => (x.q ? `Q: ${x.q}\nA: ${x.a}` : `Added: ${x.a}`)),
    ``,
    `Tier: ${t.label} (${r.confidence} confidence)`,
    `Basis: ${r.citations.join(", ") || "no provision cited"}`,
    `Why: ${r.rationale}`,
    ``,
    `What in the description led to this:`,
    ...(r.key_facts.length ? r.key_facts.map((f) => `- ${f}`) : ["- (none recorded)"]),
    ``,
    `Still to confirm:`,
    ...(r.to_confirm.length ? r.to_confirm.map((f) => `- ${f}`) : ["- Nothing material is open."]),
    ``,
    `Next steps:`,
    ...(r.obligations.length ? r.obligations.map((o) => `- [ ] ${o.text}${o.citation ? ` (${o.citation})` : ""}`) : ["- No obligations for this tier."]),
    ``,
    `Generated by AI Act Triage (${r.model}). Regulation (EU) 2024/1689, ELI http://data.europa.eu/eli/reg/2024/1689/oj`,
  ];
  return lines.join("\n");
}
