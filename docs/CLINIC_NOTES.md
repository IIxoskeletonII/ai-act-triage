# Clinic notes (19 Nov)

What to walk in with, the answers to the five questions, the blocker, and who does what.

## What is ready for the clinic
- A running slice: agent + retrieval tool + typed verdict + citation guardrail, validated end to end.
- 10 eval cases, written before any prompt tuning (5 typical, 3 edge, 2 attacks).
- A real baseline score to beat: **7/10** (tier 70%, citation 70%), committed.
- This canvas, the architecture sketch, and the knowledge base (24 provisions).

## The five questions (prepared answers)
1. **Who is the user, and have you talked to one?** An early-stage founder/PM shipping an AI feature who can't tell if the Act applies. We build AI products and placed second in an AI-Act-themed Promptathon; before the clinic we ask two classmates building AI projects whether they'd know if the Act applied to them.
2. **Why this level and not the one below?** The answer must be grounded in the Act's actual text, so retrieval (L3) is required; a single call (L1) would invent articles. We show that with the baseline's citation errors.
3. **What is the thin slice you'll demo?** One description in, one tiered verdict with a citation out, plus one injected description the system refuses to be fooled by.
4. **How will you know it works, in numbers?** The 10-case eval, scored on tier accuracy and citation accuracy. Baseline 7/10; agent target 9–10/10.
5. **What can go wrong, and who stops it?** Injection (defended: description is data + citation guardrail), hallucinated citations (code rejects unknown ids), over-classification (prompt + one eval case). A human lawyer reviews anything flagged high-risk or prohibited.

## Our blocker (the one question for the clinic)
Is a curated 24-provision subset of the Act convincing as "grounded retrieval", or do they want us to chunk and retrieve over the full Act text? We chose the subset for clean ground truth and a legible demo; we want a read on whether that reads as too thin.

## Four-person split (balanced, each owns something explainable)
- **Lead (Eliya):** agent, retrieval tool, guardrail, eval harness, integration.
- **Person 2:** the knowledge base — extend/curate provisions in `data/ai_act_kb.json`, check each citation against the official text. Owns the "is the data right" question.
- **Person 3:** the eval set — add or refine cases in `eval/eval_cases.json`, especially edge and attack cases; run the baseline and record results. Owns the "how do we know it works" slide.
- **Person 4:** the write-up and the UI copy — the canvas, the slides, the two-minute demo script. Owns the Related work and Conclusion sections.

Everyone commits their own files from their own GitHub account (web UI is fine: Add file -> Upload / edit).

## To generate the live agent results and trace (run once before the clinic)
```
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...        # or put it in .env
python -m eval.run_eval agent       # writes results_agent.json and trace_agent.txt
python -m eval.run_eval compare     # prints baseline vs agent
```
