// The statute reader: opens a whole article or annex in the style of the Official Journal, with
// the cited provision marked and scrolled into view.

import { esc } from "./data.js";
import { readerOpen, readerClose, highlight } from "./motion.js";

const cache = new Map();

async function fetchProvision(id) {
  if (cache.has(id)) return cache.get(id);
  const res = await fetch(`/api/provision?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("That provision could not be loaded.");
  const doc = await res.json();
  cache.set(id, doc);
  return doc;
}

const NUM = /^(\d+[a-z]?\.)\s+/;
const POINT = /^(\([a-z0-9]+\)|\([ivxl]+\))\s+/i;

function lineHtml(line) {
  let cls = "oj-line";
  let label = "";
  let rest = line.text;
  const num = NUM.exec(line.text);
  const point = POINT.exec(line.text);
  if (num || point) {
    const m = num || point;
    if (point && !num) cls += " is-point";
    label = `<span class="num">${esc(m[1])}</span>`;
    rest = line.text.slice(m[0].length);
  }
  const depth = Math.max(0, line.depth - 1);
  const body = line.cited ? `<mark>${esc(rest)}</mark>` : esc(rest);
  return `<p class="${cls}" style="--depth:${depth}">${label}${body}</p>`;
}

function bodyHtml(doc, label) {
  const lines = doc.lines.filter((l) => l.kind === "text");
  let html = "";
  let group = null;
  for (const line of lines) {
    if (line.cited && !group) { group = []; }
    if (!line.cited && group) { html += `<div class="oj-cited" data-label="${esc(label)}">${group.join("")}</div>`; group = null; }
    if (group) group.push(lineHtml(line));
    else html += lineHtml(line);
  }
  if (group) html += `<div class="oj-cited" data-label="${esc(label)}">${group.join("")}</div>`;
  return html;
}

export function createReader(dialog) {
  const panel = dialog.querySelector("#readerPanel");
  const body = dialog.querySelector("#readerBody");
  const crumbs = dialog.querySelector("#readerCrumbs");
  const source = dialog.querySelector("#readerSource");
  const copy = dialog.querySelector("#readerCopy");
  let returnFocus = null;
  let current = null;
  const narrow = () => window.matchMedia("(max-width: 720px)").matches;

  function close() {
    if (!dialog.open) return;
    readerClose(panel, narrow(), () => {
      dialog.close();
      returnFocus?.focus?.({ preventScroll: true });
    });
  }

  dialog.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest("[data-close]")) close();
  });
  copy.addEventListener("click", async () => {
    if (!current) return;
    const text = `${current.id}, Regulation (EU) 2024/1689 (${current.title})`;
    try { await navigator.clipboard.writeText(text); copy.textContent = "Copied"; }
    catch { copy.textContent = "Copy failed"; }
    setTimeout(() => (copy.textContent = "Copy citation"), 1600);
  });

  async function open(id, { tier = null, from = null, label = "Cited" } = {}) {
    returnFocus = from || document.activeElement;
    body.innerHTML = `<p class="reader__src" style="text-align:center;padding:40px 0">Loading ${esc(id)}…</p>`;
    crumbs.innerHTML = `<span>Regulation (EU) 2024/1689</span>`;
    if (tier) dialog.setAttribute("data-tier", tier); else dialog.removeAttribute("data-tier");
    if (!dialog.open) { dialog.showModal(); readerOpen(panel, narrow()); }
    try {
      const doc = await fetchProvision(id);
      current = doc;
      const where = doc.chapter
        ? (doc.chapter.id === "Annexes" ? `<span>Annexes</span>` : `<span>Chapter ${esc(doc.chapter.id)} · ${esc(doc.chapter.title)}</span>`)
        : "";
      const isWhole = doc.id === doc.root;
      crumbs.innerHTML = `<span>Regulation (EU) 2024/1689</span>${where}<span>${esc(doc.heading.replace(/^ANNEX/, "Annex"))}</span>${isWhole ? "" : `<span><b>${esc(doc.id)}</b></span>`}`;
      body.innerHTML = `<article class="oj">
          <p class="oj-heading">${esc(doc.heading.replace(/^ANNEX/, "Annex"))}</p>
          <h2 class="oj-title" id="readerTitle">${esc(doc.title)}</h2>
          ${bodyHtml(doc, isWhole ? "" : `${label} · ${doc.id}`)}
        </article>`;
      if (isWhole) body.querySelectorAll(".oj-cited").forEach((g) => g.replaceWith(...g.childNodes));
      if (isWhole) body.querySelectorAll("mark").forEach((m) => m.replaceWith(...m.childNodes));
      source.href = doc.source;
      body.scrollTop = 0;
      const first = body.querySelector(".oj-cited");
      if (first) {
        requestAnimationFrame(() => {
          const top = first.offsetTop - body.clientHeight * 0.22;
          body.scrollTo({ top: Math.max(0, top), behavior: "auto" });
        });
        highlight(Array.from(body.querySelectorAll(".oj-cited mark")));
      }
      body.focus({ preventScroll: true });
    } catch (err) {
      body.innerHTML = `<p class="reader__src" style="text-align:center;padding:40px 0">${esc(err.message)}</p>`;
    }
  }

  return { open, close, prefetch: (id) => fetchProvision(id).catch(() => {}) };
}
