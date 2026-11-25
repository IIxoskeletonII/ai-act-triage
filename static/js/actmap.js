// The map of the Act: one cell per article or annex, grouped by chapter. Cells light up as the
// agent retrieves and reads provisions, and any cell opens that article in the reader.

import { CHAPTER_SHORT, esc } from "./data.js";
import { pulse } from "./motion.js";

const rootOf = (id) => {
  const m = /^(Art \d+|Annex [IVXL]+)/.exec(id || "");
  return m ? m[1] : null;
};

export function createActMap(container, tip, { onOpen }) {
  let cells = new Map();
  let order = [];
  let titles = new Map();

  function render(chapters) {
    container.innerHTML = chapters.map((ch) => `
      <div class="actmap__row">
        <p class="actmap__label" title="${esc(ch.id === "Annexes" ? "Annexes" : `Chapter ${ch.id}: ${ch.title}`)}">
          <b>${ch.id === "Annexes" ? "Anx" : esc(ch.id)}</b><span>${esc(CHAPTER_SHORT[ch.id] || ch.title)}</span>
        </p>
        <div class="actmap__cells">${ch.items.map((it) => `<button type="button" class="cell" tabindex="-1" data-id="${esc(it.id)}"
          aria-label="${esc(label(it.id))}, ${esc(it.title)}"></button>`).join("")}</div>
      </div>`).join("");
    cells = new Map();
    order = Array.from(container.querySelectorAll(".cell"));
    order.forEach((c) => cells.set(c.dataset.id, c));
    chapters.forEach((ch) => ch.items.forEach((it) => titles.set(it.id, it.title)));
    if (order[0]) order[0].tabIndex = 0;
    return order;
  }

  const label = (id) => id.startsWith("Art ") ? `Article ${id.slice(4)}` : id.replace("Annex", "Annex");

  function showTip(cell) {
    const id = cell.dataset.id;
    tip.innerHTML = `<b>${esc(label(id))}</b>${esc(titles.get(id) || "")}`;
    tip.hidden = false;
    const r = cell.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = r.left + r.width / 2 - w / 2;
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    let y = r.top - h - 10;
    if (y < 70) y = r.bottom + 10;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }
  const hideTip = () => { tip.hidden = true; };

  container.addEventListener("pointerover", (e) => { const c = e.target.closest(".cell"); if (c) showTip(c); });
  container.addEventListener("pointerout", (e) => { if (e.target.closest(".cell")) hideTip(); });
  container.addEventListener("focusin", (e) => { const c = e.target.closest(".cell"); if (c) showTip(c); });
  container.addEventListener("focusout", hideTip);
  window.addEventListener("scroll", hideTip, { passive: true });
  container.addEventListener("click", (e) => {
    const c = e.target.closest(".cell");
    if (c) { hideTip(); onOpen(c.dataset.id, c); }
  });
  container.addEventListener("keydown", (e) => {
    const c = e.target.closest(".cell");
    if (!c) return;
    const i = order.indexOf(c);
    const step = { ArrowRight: 1, ArrowDown: 10, ArrowLeft: -1, ArrowUp: -10 }[e.key];
    let next = null;
    if (step) next = order[Math.max(0, Math.min(order.length - 1, i + step))];
    if (e.key === "Home") next = order[0];
    if (e.key === "End") next = order[order.length - 1];
    if (next) {
      e.preventDefault();
      c.tabIndex = -1; next.tabIndex = 0; next.focus();
    }
  });

  function mark(id, state) {
    const cell = cells.get(rootOf(id));
    if (!cell) return null;
    if (state === "hit" && !cell.classList.contains("is-read")) cell.classList.add("is-hit");
    if (state === "read") { cell.classList.remove("is-hit"); cell.classList.add("is-read"); }
    if (state === "cited") cell.classList.add("is-cited");
    return cell;
  }

  return {
    render,
    cells: () => order,
    hit(id) { const c = mark(id, "hit"); pulse(c); return c; },
    read(id) {
      const c = mark(id, "read");
      order.forEach((o) => o.classList.remove("is-now"));
      c?.classList.add("is-now");
      pulse(c);
      return c;
    },
    cite(ids, tier) {
      container.dataset.tier = tier;
      container.setAttribute("data-tier", tier);
      ids.forEach((id) => mark(id, "cited"));
    },
    settle() { order.forEach((o) => o.classList.remove("is-now")); },
    reset() {
      order.forEach((o) => o.classList.remove("is-hit", "is-read", "is-cited", "is-now"));
      delete container.dataset.tier;
    },
    titleOf: (id) => titles.get(rootOf(id)),
    label,
  };
}

export { rootOf };
