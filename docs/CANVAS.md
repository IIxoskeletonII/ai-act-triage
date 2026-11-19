# Project Canvas — AI Act Triage

One page, filling the four views plus eval, risks and demo (per the 13 Nov project-work deck).

## WHY — Business view
- **User:** an early-stage founder or product manager shipping an AI feature, who cannot tell whether the EU AI Act applies to them and cannot yet afford a lawyer.
- **Pain:** the Act is long and cross-referenced; the cost of being wrong is high (fines up to €35M or 7% of turnover for prohibited practices). Today they either guess or pay for advice.
- **Value:** a first-pass risk tier with a citation to the exact provision, in seconds, so they know whether they are fine, need transparency measures, face high-risk obligations, or must stop.
- **How we know the pain is real:** we build AI products and placed second in an AI-Act-themed Promptathon, and we will ask two classmates building AI projects whether they know if the Act applies to them.

## WHAT — Functional view
- **Task the system takes over:** read a plain-English product description, classify it into one of five tiers (prohibited / high-risk / limited-risk / minimal-risk / out-of-scope), and cite the provision.
- **Before:** read scattered PDFs, guess, or wait for a lawyer (days to weeks).
- **After:** paste a description, get a tiered verdict with a citation and a plain-English rationale, then take it to a lawyer only if flagged. One human decision, at the end.

## HOW — Technical view
- **Ladder level:** L3 — an agent with one retrieval tool (agentic RAG). The model decides when to search the Act and with which query.
- **Why not L1/L2:** the answer needs grounding in the Act's text, not the model's memory, so retrieval is required.
- **Why not L4 (a team of agents):** one task, one role; extra agents would add cost and failure modes without raising the score. The fixed pipeline is our deliberate fallback if the agent does not beat it on the eval.
- **Human gate:** the system advises; a lawyer reviews anything flagged prohibited or high-risk. No irreversible actions, so no money/email/delete gates needed.
- **Guardrails:** the product description is treated as data, never instructions (injection defence); a code-level check rejects any citation not in the knowledge base.

## WITH WHAT — Implementation view
- **Model:** Claude, via Pydantic AI (provider-agnostic; one-line swap).
- **Framework:** Pydantic AI (typed output, tool from a Python function, the loop).
- **Data:** a curated subset of Regulation (EU) 2024/1689 — Article 5 (prohibited), Article 6 + Annex III (high-risk), Article 50 (transparency), plus scope. 24 provisions as JSON.
- **Interface:** a small web page (built after the clinic).
- **Who builds what:** see CLINIC_NOTES.md for the four-person split.

## EVAL — 10 cases, score to beat
- 5 typical, 3 edge, 2 injection attacks. Each has an expected tier and an expected citation. A case passes only if both are right.
- **Baseline (keyword classifier, no LLM): 7/10**, tier 70%, citation 70%. This is the number to beat.
- Agent target: 9–10/10, keeping the baseline's injection resistance while fixing the three cases it gets wrong (a keyword collision, a vague input, a nuanced prohibition).

## RISKS — and the defence for each
- **Prompt injection** (instructions hidden in the description): description is framed as data; output guardrail validates citations. Two eval cases test this.
- **Hallucinated citations:** code rejects any provision id not in the knowledge base.
- **Over-classification** (calling everything high-risk): one eval case guards against it; the prompt tells the model a chatbot/generator is usually transparency, not high-risk.
- **Not legal advice:** the UI states this is a first-pass triage, not a compliance opinion.
- **Cost:** one short agent run per query; capped, a few cents.

## DEMO — two minutes
One happy path (a recruitment tool → high-risk, cites Annex III(4)) and one failure or attack (an injected description that the system refuses to be fooled by), shown live with the trace.
