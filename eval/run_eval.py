"""Run the evaluation cases and score tier accuracy and citation accuracy.

Usage:
  python -m eval.run_eval baseline      # no API key needed; writes results_baseline.json
  python -m eval.run_eval agent         # calls the LLM; writes results_agent.json and a trace
  python -m eval.run_eval compare       # prints baseline vs agent from the saved result files
  python -m eval.run_eval rescore FILE...  # re-scores saved results files in eval/ from their saved
                                           # predictions (no API calls) and rewrites them

Options for baseline and agent:
  --cases FILE   cases file in eval/ (default eval_cases.json)
  --out FILE     results file in eval/ (default results_<system>.json); the agent
                 trace goes to the same name with results_ -> trace_ and .txt

Scoring per case:
  tier_ok      = predicted tier equals the expected tier
  citation_ok  = a cited id equals the expected provision id or is a descendant of it in the
                 id tree (Annex III(4)(a) satisfies Annex III(4); Art 2(6) satisfies Art 2);
                 if expected_citation is null, the system must cite nothing
A case passes when both are true.
"""

import argparse
import json
from pathlib import Path

from src.provision_ids import within

ROOT = Path(__file__).resolve().parent.parent
EVAL = ROOT / "eval"


def load_cases(name):
    return json.loads((EVAL / name).read_text(encoding="utf-8"))["cases"]


def judge(expected_tier, expected_citation, tier, cited):
    tier_ok = tier == expected_tier
    if expected_citation is None:
        citation_ok = not cited
    else:
        citation_ok = any(within(c, expected_citation) for c in cited)
    return {"tier_ok": tier_ok, "citation_ok": citation_ok, "pass": tier_ok and citation_ok}


def score(cases, predict):
    rows = []
    for c in cases:
        pred = predict(c["description"])
        cited = pred.get("citations", [])
        rows.append({
            "id": c["id"], "kind": c["kind"],
            "expected_tier": c["expected_tier"], "predicted_tier": pred["tier"],
            "expected_citation": c["expected_citation"], "predicted_citations": cited,
            **judge(c["expected_tier"], c["expected_citation"], pred["tier"], cited),
            "invalid_citations": pred.get("invalid_citations", []),
        })
    return rows


def rescore(names):
    for name in names:
        out = json.loads((EVAL / name).read_text(encoding="utf-8"))
        for r in out["rows"]:
            r.update(judge(r["expected_tier"], r["expected_citation"], r["predicted_tier"], r["predicted_citations"]))
        out["summary"] = summary(out["rows"])
        (EVAL / name).write_text(json.dumps(out, indent=2), encoding="utf-8")
        print(name)
        _print(out)


def summary(rows):
    n = len(rows)
    return {
        "cases": n,
        "tier_accuracy": sum(r["tier_ok"] for r in rows) / n,
        "citation_accuracy": sum(r["citation_ok"] for r in rows) / n,
        "passed": sum(r["pass"] for r in rows),
    }


def run_baseline(cases, out_name):
    from src.baseline import classify
    rows = score(cases, classify)
    out = {"system": "baseline", "summary": summary(rows), "rows": rows}
    (EVAL / out_name).write_text(json.dumps(out, indent=2), encoding="utf-8")
    _print(out)


def run_agent(cases, out_name):
    from src.agent import classify
    traces = []

    def predict(description):
        r = classify(description)
        traces.append({"description": description, "messages": [str(m) for m in r.pop("messages")]})
        return r

    rows = score(cases, predict)
    out = {"system": "agent", "summary": summary(rows), "rows": rows}
    (EVAL / out_name).write_text(json.dumps(out, indent=2), encoding="utf-8")
    (EVAL / Path(out_name.replace("results_", "trace_", 1)).with_suffix(".txt")).write_text(
        "\n\n".join(t["description"] + "\n" + "\n".join(t["messages"]) for t in traces),
        encoding="utf-8",
    )
    _print(out)


def compare():
    b = json.loads((ROOT / "eval" / "results_baseline.json").read_text())["summary"]
    a = json.loads((ROOT / "eval" / "results_agent.json").read_text())["summary"]
    print(f"{'metric':<20}{'baseline':>12}{'agent':>12}")
    for k in ("tier_accuracy", "citation_accuracy", "passed"):
        print(f"{k:<20}{b[k]:>12}{a[k]:>12}")


def _print(out):
    s = out["summary"]
    print(f"[{out['system']}]  passed {s['passed']}/{s['cases']}  "
          f"tier {s['tier_accuracy']:.0%}  citation {s['citation_accuracy']:.0%}")
    for r in out["rows"]:
        mark = "ok " if r["pass"] else "XX "
        print(f"  {mark}{r['id']:<4}{r['kind']:<9}{r['predicted_tier']:<13}"
              f"(exp {r['expected_tier']})  cites {r['predicted_citations']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("cmd", nargs="?", default="baseline", choices=["baseline", "agent", "compare", "rescore"])
    parser.add_argument("files", nargs="*", help="results files in eval/ (rescore only)")
    parser.add_argument("--cases", default="eval_cases.json")
    parser.add_argument("--out")
    args = parser.parse_args()
    if args.cmd == "compare":
        compare()
    elif args.cmd == "rescore":
        rescore(args.files)
    else:
        run = run_baseline if args.cmd == "baseline" else run_agent
        run(load_cases(args.cases), args.out or f"results_{args.cmd}.json")
