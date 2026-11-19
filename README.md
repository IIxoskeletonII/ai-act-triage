# AI Act Triage

Describe an AI product in plain English and get a first-pass EU AI Act risk tier
with a citation to the exact provision. Built for the AI Frontiers: Large Language
Models course (EM84), LUISS.

> First-pass triage, not legal advice. Anything flagged prohibited or high-risk
> should go to a qualified reviewer.

## What it does
It classifies a product into one of five tiers and cites the provision behind the call:

| Tier | Meaning | Example provision |
|------|---------|-------------------|
| prohibited | banned practice | Art 5(1) |
| high-risk | heavy obligations | Art 6(2) + Annex III |
| limited-risk | transparency duties | Art 50 |
| minimal-risk | no specific obligations | — |
| out-of-scope | the Act does not apply, or too vague to classify | Art 2 |

## How it works
An agent (Pydantic AI) with one retrieval tool over a curated subset of
Regulation (EU) 2024/1689. The model decides when to search the Act and returns a
typed verdict; a code guardrail rejects any citation that is not in the knowledge
base. The product description is always treated as data, so instructions hidden
inside it are ignored. See `docs/ARCHITECTURE.md`.

## Quick start

Baseline and eval need only the standard library:

```
git clone <this repo>
cd ai-act-triage
python -m eval.run_eval baseline     # scores the keyword baseline: 7/10
```

The live agent needs the two packages and a key:

```
pip install -r requirements.txt
cp .env.example .env                 # add your key; set MODEL if needed
export ANTHROPIC_API_KEY=...
python -m src.agent "A tool that screens and ranks job applicants' CVs."
python -m eval.run_eval agent        # writes results_agent.json and trace_agent.txt
python -m eval.run_eval compare      # baseline vs agent
```

## Repository layout
```
data/ai_act_kb.json      the curated EU AI Act subset (24 provisions)
src/knowledge_base.py    loads the KB and runs keyword retrieval
src/baseline.py          keyword classifier, no LLM (the number to beat)
src/agent.py             the agent: retrieval tool, typed verdict, citation guardrail
eval/eval_cases.json     10 labelled cases (5 typical, 3 edge, 2 attacks)
eval/run_eval.py         scores tier accuracy and citation accuracy
eval/results_baseline.json  committed baseline results (replays with no key)
docs/                    project canvas, architecture, clinic notes
```

## Results

Baseline (committed): 7/10, tier 70%, citation 70%. The agent run is generated
with `python -m eval.run_eval agent`. The three cases the baseline misses are a
keyword collision, a vague input it cannot ask about, and a nuanced prohibition.

## Data note
The knowledge base paraphrases the Act in plain English with official citations;
it is not a substitute for the text (ELI: http://data.europa.eu/eli/reg/2024/1689/oj).
EU legislation is reproducible; the summaries here are our own wording.
