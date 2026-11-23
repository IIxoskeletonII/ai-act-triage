"""Run the evaluation cases and score tier accuracy and citation accuracy.

Usage:
  python -m eval.run_eval baseline      # no API key needed; writes results_baseline.json
  python -m eval.run_eval agent         # calls the LLM; writes results_agent.json and a trace
  python -m eval.run_eval parametric    # the same agent with no tools (memory only); writes
                                        # results_parametric.json and a trace
  python -m eval.run_eval compare       # prints baseline vs agent from the saved result files
  python -m eval.run_eval rescore FILE...  # re-scores saved results files in eval/ from their saved
                                           # predictions (no API calls) and rewrites them
  python -m eval.run_eval report FILE...   # prints tier accuracy, citation accuracy and citation
                                           # validity for saved results files in eval/
  python -m eval.run_eval test             # held-out set (test_cases.json), run ONCE: the RAG agent
                                           # and the parametric agent, writing results_test_rag.json,
                                           # results_test_parametric.json and their traces. Refuses to
                                           # run if either results file already exists.

Options for baseline, agent and parametric:
  --cases FILE   cases file in eval/ (default eval_cases.json)
  --out FILE     results file in eval/ (default results_<system>.json); the agent
                 trace goes to the same name with results_ -> trace_ and .txt
  --model ID     model for agent and parametric (default: the MODEL environment variable,
                 else the default in src/agent.py); recorded in the results file

Citation validity = number of cited ids that are not provisions of the Act (data/ai_act_index.json).

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
            "clarifying_question": pred.get("clarifying_question"),
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


def run_agent(cases, out_name, tools=True):
    from src.agent import MODEL, classify
    traces = []

    def predict(description):
        r = classify(description, tools=tools)
        traces.append({"description": description, "messages": [str(m) for m in r.pop("messages")]})
        return r

    rows = score(cases, predict)
    out = {"system": "agent" if tools else "parametric", "model": MODEL, "summary": summary(rows), "rows": rows}
    (EVAL / out_name).write_text(json.dumps(out, indent=2), encoding="utf-8")
    (EVAL / Path(out_name.replace("results_", "trace_", 1)).with_suffix(".txt")).write_text(
        "\n\n".join(t["description"] + "\n" + "\n".join(t["messages"]) for t in traces),
        encoding="utf-8",
    )
    _print(out)


def run_test():
    outs = {"results_test_rag.json": True, "results_test_parametric.json": False}
    existing = [name for name in outs if (EVAL / name).exists()]
    if existing:
        raise SystemExit(f"held-out results already exist ({', '.join(existing)}); the test set is run once only")
    cases = load_cases("test_cases.json")
    for name, tools in outs.items():
        run_agent(cases, name, tools=tools)


def report(names):
    act = set(json.loads((ROOT / "data" / "ai_act_index.json").read_text(encoding="utf-8")))
    print(f"{'file':<34}{'model':<30}{'passed':>7}{'tier':>7}{'cite':>7}{'invalid':>9}")
    for name in names:
        out = json.loads((EVAL / name).read_text(encoding="utf-8"))
        s = out["summary"]
        cited = [(r["id"], c) for r in out["rows"] for c in r["predicted_citations"]]
        bad = [(case, c) for case, c in cited if c not in act]
        print(f"{name:<34}{out.get('model', '-'):<30}{s['passed']:>4}/{s['cases']:<2}{s['tier_accuracy']:>7.0%}"
              f"{s['citation_accuracy']:>7.0%}{len(bad):>5} of {len(cited)}")
        for case, c in bad:
            print(f"    invalid: {case}: {c}")


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
    parser.add_argument("cmd", nargs="?", default="baseline", choices=["baseline", "agent", "parametric", "compare", "rescore", "report", "test"])
    parser.add_argument("files", nargs="*", help="results files in eval/ (rescore and report only)")
    parser.add_argument("--cases", default="eval_cases.json")
    parser.add_argument("--out")
    parser.add_argument("--model")
    args = parser.parse_args()
    if args.model:
        import os
        os.environ["MODEL"] = args.model  # read by src.agent at import
    if args.cmd == "compare":
        compare()
    elif args.cmd == "rescore":
        rescore(args.files)
    elif args.cmd == "report":
        report(args.files)
    elif args.cmd == "test":
        run_test()
    else:
        cases, out_name = load_cases(args.cases), args.out or f"results_{args.cmd}.json"
        if args.cmd == "baseline":
            run_baseline(cases, out_name)
        else:
            run_agent(cases, out_name, tools=args.cmd == "agent")
