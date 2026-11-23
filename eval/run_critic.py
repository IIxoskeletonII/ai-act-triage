"""Critic demonstration on the high-risk dev cases (not a scored eval).

Two sources of obligations for the same cases:
  strong: Sonnet 5.5 + RAG, read from a saved results file (no new agent calls)
  weak:   a model with no tools (obligations from memory), generated fresh
The critic (src/critic.py) reviews both. Writes eval/results_critic_demo.json and
eval/trace_critic_demo.txt (the exact critic input and output for every review).

Usage:
  python -m eval.run_critic [--strong results_agent_v2_rag.json] [--weak-model anthropic:claude-haiku-5-5]
"""

import argparse
import json
import os
from pathlib import Path

EVAL = Path(__file__).resolve().parent
CASES = ["T1", "T4", "N1", "N2", "N8", "N9"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--strong", default="results_agent_v2_rag.json")
    parser.add_argument("--weak-model", default="anthropic:claude-haiku-5-5")
    args = parser.parse_args()

    os.environ["MODEL"] = args.weak_model  # read by src.agent at import; the critic has its own CRITIC_MODEL
    from src.agent import MODEL, classify
    from src.critic import CRITIC_MODEL, review

    cases = {c["id"]: c for c in json.loads((EVAL / "eval_cases_v2.json").read_text(encoding="utf-8"))["cases"]}
    strong = json.loads((EVAL / args.strong).read_text(encoding="utf-8"))
    strong_rows = {r["id"]: r for r in strong["rows"]}

    out = {"critic_model": CRITIC_MODEL, "strong": {"source": args.strong, "model": strong.get("model")},
           "weak": {"model": MODEL, "tools": False}, "cases": []}
    trace = []
    for cid in CASES:
        desc = cases[cid]["description"]
        s = strong_rows[cid]
        w = classify(desc, tools=False)
        entry = {"id": cid, "description": desc}
        for name, tier, cites, obs in [("strong", s["predicted_tier"], s["predicted_citations"], s["obligations"]),
                                       ("weak", w["tier"], w["citations"], w["obligations"])]:
            r = review(desc, tier, cites, obs)
            trace.append(f"=== {cid} / {name}\n{r.pop('input')}\n--- critic output\n{json.dumps(r, indent=1, ensure_ascii=False)}")
            entry[name] = {"tier": tier, "citations": cites, "obligations": obs, "critic": r}
            print(f"{cid:<4}{name:<7}tier {tier:<13}obligations {len(obs):>2}  flagged {r['flagged']:>2}  "
                  f"missing {len(r['missing']):>2}  all_grounded {r['all_grounded']}  consistent {r['consistent']}")
        out["cases"].append(entry)

    for name in ("strong", "weak"):
        rows = [c[name] for c in out["cases"]]
        out[name]["totals"] = {
            "obligations": sum(len(r["obligations"]) for r in rows),
            "misstated": sum(j["verdict"] == "misstated" for r in rows for j in r["critic"]["judgements"]),
            "ungrounded": sum(j["verdict"] == "ungrounded" for r in rows for j in r["critic"]["judgements"]),
            "missing": sum(len(r["critic"]["missing"]) for r in rows),
        }
        print(name, out[name]["totals"])
    (EVAL / "results_critic_demo.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    (EVAL / "trace_critic_demo.txt").write_text("\n\n".join(trace), encoding="utf-8")


if __name__ == "__main__":
    main()
