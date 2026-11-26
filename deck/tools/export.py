"""Export and check the deck in headless Chromium (Playwright).

  python deck/tools/export.py            screenshots of every slide, reduced motion, presenter view,
                                         motion frames, and both PDFs
  python deck/tools/export.py --pdf      PDFs only

Outputs:
  deck/export/AI-Act-Triage.pdf             one page per slide, every build shown (the fallback deck)
  deck/export/AI-Act-Triage-notes.pdf       the same with each slide's speaker notes on its own page
  deck/screenshots/NN-<slide>.png           every slide, all builds shown, after motion settles
  deck/screenshots/steps/                   each build step of the architecture and results slides
  deck/screenshots/reduced-motion/          every slide with prefers-reduced-motion: reduce
  deck/screenshots/motion/                  frames captured during a transition and a build
  deck/screenshots/presenter-view.png       the speaker view with notes, timer and next slide

Requires: pip install playwright && python -m playwright install chromium
"""

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

DECK = Path(__file__).resolve().parents[1]
INDEX = (DECK / "index.html").as_uri()
SHOTS = DECK / "screenshots"
EXPORT = DECK / "export"
VIEW = {"width": 1920, "height": 1080}

SETTLED = """() => {
  const g = window.gsap;
  if (!g) return true;
  return g.globalTimeline.getChildren(true, true, false).filter(t => t.isActive()).length === 0;
}"""


def wait_ready(page):
    page.wait_for_function("document.documentElement.classList.contains('is-ready')", timeout=20000)


def settle(page, floor=0.9, cap=12.0):
    time.sleep(floor)
    end = time.time() + cap
    while time.time() < end:
        if page.evaluate(SETTLED):
            break
        time.sleep(0.15)
    time.sleep(0.35)


def slide_ids(page):
    return page.evaluate("Array.from(document.querySelectorAll('.reveal .slides > section')).map(s => s.dataset.id)")


def go(page, h):
    page.evaluate(f"Reveal.slide({h}, 0, -1)")


def show_all(page):
    """Advance through every build on the current slide; returns the number of steps."""
    n = 0
    while page.evaluate("Reveal.nextFragment()"):
        n += 1
        time.sleep(0.05)
    return n


def collect_errors(page, sink):
    page.on("pageerror", lambda e: sink.append(f"pageerror: {e}"))
    page.on("console", lambda m: sink.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)


def screenshots(browser, errors):
    for sub in ("steps", "reduced-motion", "motion"):
        (SHOTS / sub).mkdir(parents=True, exist_ok=True)

    # every slide, all builds shown, motion on
    ctx = browser.new_context(viewport=VIEW, device_scale_factor=1)
    page = ctx.new_page()
    collect_errors(page, errors)
    page.goto(INDEX)
    wait_ready(page)
    ids = slide_ids(page)
    report = []
    for h, sid in enumerate(ids):
        go(page, h)
        settle(page, floor=0.8)
        steps = show_all(page)
        settle(page, floor=1.0)
        name = f"{h + 1:02d}-{sid}.png"
        page.screenshot(path=str(SHOTS / name))
        overflow = page.evaluate("""() => {
          const s = Reveal.getCurrentSlide(), f = s.querySelector('.frame');
          const out = [];
          f.querySelectorAll('*').forEach(el => {
            if (el.closest('.title-map, .tag__string, .hook-q, .tag')) return;
            const r = el.getBoundingClientRect(), sc = Reveal.getScale();
            if (!r.width || !r.height) return;
            if (r.right > 1920 * sc + 2 || r.bottom > 1080 * sc + 2) out.push((el.className || el.tagName).toString().slice(0, 40));
          });
          return out.slice(0, 5);
        }""")
        report.append({"slide": h + 1, "id": sid, "builds": steps, "overflow": overflow})

    # build steps of the slides that reveal in stages
    for sid in ("arch", "exp", "agree", "answer"):
        h = ids.index(sid)
        go(page, h)
        settle(page, floor=0.8)
        k = 0
        page.screenshot(path=str(SHOTS / "steps" / f"{h + 1:02d}-{sid}-step{k}.png"))
        while page.evaluate("Reveal.nextFragment()"):
            k += 1
            settle(page, floor=0.7)
            page.screenshot(path=str(SHOTS / "steps" / f"{h + 1:02d}-{sid}-step{k}.png"))

    # motion frames: a slide transition and the contamination build
    go(page, ids.index("eval"))
    settle(page)
    go(page, ids.index("exp"))
    for i in range(6):
        page.screenshot(path=str(SHOTS / "motion" / f"transition-{i}.png"))
        time.sleep(0.12)
    settle(page)
    page.evaluate(f"Reveal.slide({ids.index('exp')}, 0, 1)")  # builds 0-1 shown; the verdict is next
    settle(page)
    page.evaluate("Reveal.nextFragment()")
    for i in range(8):
        page.screenshot(path=str(SHOTS / "motion" / f"verdict-{i}.png"))
        time.sleep(0.1)

    # presenter view (the notes window is a popup opened by the S key)
    go(page, ids.index("exp"))
    settle(page)
    with page.expect_popup() as pop:
        page.keyboard.press("s")
    notes = pop.value
    notes.set_viewport_size({"width": 1600, "height": 900})
    time.sleep(3.5)
    notes.screenshot(path=str(SHOTS / "presenter-view.png"))
    notes_text = notes.evaluate("document.body.innerText")
    ctx.close()

    # reduced motion: every slide, and proof that nothing moves on a slide change
    rctx = browser.new_context(viewport=VIEW, device_scale_factor=1, reduced_motion="reduce")
    rpage = rctx.new_page()
    collect_errors(rpage, errors)
    rpage.goto(INDEX)
    wait_ready(rpage)
    flags = rpage.evaluate("[document.documentElement.classList.contains('reduce-motion'), matchMedia('(prefers-reduced-motion: reduce)').matches]")
    for h, sid in enumerate(ids):
        go(rpage, h)
        time.sleep(0.45)
        show_all(rpage)
        time.sleep(0.45)
        rpage.screenshot(path=str(SHOTS / "reduced-motion" / f"{h + 1:02d}-{sid}.png"))
    go(rpage, ids.index("eval"))
    time.sleep(0.6)
    go(rpage, ids.index("exp"))
    time.sleep(0.3)
    rpage.screenshot(path=str(SHOTS / "motion" / "reduced-at-300ms.png"))
    time.sleep(1.5)
    rpage.screenshot(path=str(SHOTS / "motion" / "reduced-at-1800ms.png"))
    active = rpage.evaluate(SETTLED)
    rctx.close()
    return report, flags, active, notes_text


def pdfs(browser, errors):
    EXPORT.mkdir(parents=True, exist_ok=True)
    out = []
    for query, name in (("?print-pdf", "AI-Act-Triage.pdf"), ("?print-pdf&showNotes=separate-page", "AI-Act-Triage-notes.pdf")):
        ctx = browser.new_context(viewport=VIEW)
        page = ctx.new_page()
        collect_errors(page, errors)
        page.goto(INDEX + query)
        wait_ready(page)
        time.sleep(1.5)
        path = EXPORT / name
        page.pdf(path=str(path), width="1920px", height="1080px", print_background=True, prefer_css_page_size=True)
        out.append((name, path.stat().st_size))
        ctx.close()
    return out


def launch(p):
    """The installed Chrome (the browser the deck is presented in), then Edge, then Playwright's own."""
    for kw in ({"channel": "chrome"}, {"channel": "msedge"}, {}):
        try:
            return p.chromium.launch(**kw)
        except Exception:
            continue
    raise SystemExit("No Chromium browser found. Install Chrome or run: python -m playwright install chromium")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    only_pdf = "--pdf" in sys.argv
    errors = []
    with sync_playwright() as p:
        browser = launch(p)
        result = {}
        if not only_pdf:
            report, flags, settled, notes_text = screenshots(browser, errors)
            result.update(slides=report, reduced_flags=flags, reduced_settled_at_1800ms=settled,
                          notes_window_sample=notes_text[:400])
        result["pdfs"] = pdfs(browser, errors)
        browser.close()
    result["errors"] = errors
    print(json.dumps(result, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
