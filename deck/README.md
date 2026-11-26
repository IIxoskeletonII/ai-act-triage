# AI Act Triage: the presentation

A 15-slide deck plus a 6-slide appendix, in the same design system as the tool: the dark theme of
`static/css/app.css`, Mona Sans for the voice, Newsreader only for verbatim text of the Act (serif
always means the law), Monaspace Xenon for provision and case ids, and the six tier colours used only
where a tier is meant, always with its label and glyph. The Act map and the hanging triage tag come
straight from the interface.

## Present it

1. Open `deck/index.html` in Chrome or Edge (double-click works; no server, no network: every script,
   style, font and image is in this folder).
2. Press **F** for full screen. The deck is a fixed 1920 × 1080 canvas scaled to the screen (16:9).
3. Press **S** for the speaker view: the current slide, the next one, the speaker notes (who speaks,
   timing, what to say, likely questions), a clock, elapsed time and a pacing timer.

| Key | Does |
|-----|------|
| → · Space · Page Down · clicker | next build step or slide |
| ← · Page Up | back |
| S | speaker view (notes, timer, pacing, next slide) |
| F | full screen |
| B or . | black screen (use it while switching to the live demo) |
| O or Esc | overview of all slides |

Motion respects the system's *reduce motion* setting. To turn it off regardless, open
`index.html?motion=reduce` (the same switch the tool uses). Builds still step in, without movement.

**Team**: names and matricolas live in `deck/team.js`. They appear on the title slide and in every
speaker note.

## Who presents what (about 20 minutes)

| Slides | Speaker | Block | Time |
|--------|---------|-------|------|
| 1–3 | Eliya Allam | Intro and the framing question | 2:30 |
| 4–5 | Kamila Dochshanova | What it does, related work | 3:00 |
| 6–8 | Lukas Haertig | Architecture, methods, evaluation design | 4:20 |
| 9–12 | Léo Pierre Darimont-Nicolau | Results and limitations | 5:20 |
| 13–15 | Eliya Allam | Live demo, the answer, conclusion; Q&A backstop | 5:00 |

Each slide's note carries the speaker, the slide's time and the target clock at its end.

## PDF fallback

- `export/AI-Act-Triage.pdf`: one page per slide with every build shown.
- `export/AI-Act-Triage-notes.pdf`: the same, each slide followed by its speaker notes, for rehearsal.

Regenerate both, and every screenshot, with:

```
pip install playwright
python deck/tools/export.py          # or --pdf for the PDFs only
```

It drives the installed Chrome (or Edge) headless. The PDF can also be printed by hand: open
`index.html?print-pdf` in Chrome, print, *Save as PDF*, margins *None*, background graphics on.

## Where the numbers come from

Every figure is read from the repo; nothing is rounded up or estimated.

| Slide | Figure | Source |
|-------|--------|--------|
| 2 | €35M or 7% of worldwide turnover | Art 99(3), `data/ai_act_chunks.json` |
| 6 | 1,246 chunks, 113 articles, 13 annexes | `data/ai_act_chunks.json` |
| 9 | baseline 9/20; agent 20/20 dev, 12/12 held-out, with and without retrieval | `eval/results_baseline_v2.json`, `results_agent_v2_rag.json`, `results_agent_v2_parametric.json`, `results_test_rag.json`, `results_test_parametric.json` |
| 9 | tier accuracy 18/20 for Sonnet and Haiku, with and without retrieval | `eval/results_{sonnet,haiku}_{rag,parametric}.json` |
| 10 | 17 of 20 agree; N6, N5, A1 | `eval/results_agreement.json`, `eval/phase9_report.md` §1 |
| 11 | 3/3 and 6/6 minimal pairs; 6/6 passages; critic 2 true, 2 false | `eval/phase9_report.md` §2–4 |
| A–F | full tables, ledger, provenance (sha256 from the ingestion commit) | `eval/phase9_report.md`, `git show b5c7616` |

Two wordings differ from the first content draft because the repo says otherwise. Retrieval left
**tier accuracy** unchanged (full pass with citations was 16/20 with retrieval and 18/20 without in
the ablation, and the gap is citation rules). And the case for L3 over a multi-agent team rests on
measured ceiling scores, not on a multi-agent run, since none was built.

## Files

```
index.html             the slides and speaker notes
team.js                presenter names
assets/css/deck.css    the design system at projector scale, motion, print rules
assets/js/deck.js      generated visuals (Act map, unit bars, agreement grid), chrome, choreography
assets/js/act-outline.js  chapters, articles and annexes of the Act, generated from data/
assets/img/repo-qr.*   QR code for https://github.com/IIxoskeletonII/ai-act-triage
assets/fonts/          Mona Sans, Newsreader, Monaspace Xenon (SIL OFL, licences included)
vendor/reveal/         reveal.js 6.0.2 (MIT) and its notes plugin
vendor/gsap/           GSAP 3.15 core, SplitText, CustomEase, ScrambleText (as in static/vendor)
tools/export.py        PDF export and screenshot check
export/                the PDFs
screenshots/           every slide; build steps; reduced motion; motion frames; speaker view
```
