"""Phase 9 analyses: config agreement, minimal pairs, passage-level eval and verifier precision.

Usage:
  python -m eval.run_phase9 agreement   # no API calls; per-case pass/fail across the four Phase 3e configs
  python -m eval.run_phase9 pairs       # minimal pairs (eval/minimal_pairs.json) through the clarify loop
  python -m eval.run_phase9 passages    # RAG agent on eval/passage_gold.json: passage found, missed obligations
  python -m eval.run_phase9 critic      # the critic over the passages run's obligations

Each writes eval/results_<name>.json. Two judgements are made by reading the Act text rather than
by code: whether a cited provision's text supports the claim (passages) and whether a critic flag
is a true or a false flag (critic). They are recorded with quotes in eval/review_phase9.json.
"""

import json
import re
import sys
from pathlib import Path

from src.provision_ids import within

EVAL = Path(__file__).resolve().parent
CONFIGS = {
    "sonnet-rag": "results_sonnet_rag.json",
    "sonnet-parametric": "results_sonnet_parametric.json",
    "haiku-rag": "results_haiku_rag.json",
    "haiku-parametric": "results_haiku_parametric.json",
}


def _load(name):
    return json.loads((EVAL / name).read_text(encoding="utf-8"))


def _save(name, data):
    (EVAL / name).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def failure_kind(r):
    """Why a row failed: structural (a gap later fixed by a rule) or content (a different tier or citation)."""
    exp_t, exp_c, tier, cited = r["expected_tier"], r["expected_citation"], r["predicted_tier"], r["predicted_citations"]
    if exp_t == "needs-info" and tier != "needs-info":
        return "structural: needs-info tier not yet available"
    if tier != exp_t:
        return f"content: tier {tier}"
    if exp_c == "Art 6(3)" and not any(within(c, exp_c) for c in cited):
        return "structural: derogation not cited (minimal-risk rule said cite nothing)"
    if exp_c is None:
        return f"content: cited {cited} on a {tier} verdict"
    if any(within(exp_c, c) and c != exp_c for c in cited):
        return f"structural: cited the parent {[c for c in cited if within(exp_c, c)]} not the point (point-level rule came later)"
    return f"content: cited {cited}"


def agreement():
    runs = {k: {r["id"]: r for r in _load(v)["rows"]} for k, v in CONFIGS.items()}
    ids = list(next(iter(runs.values())))
    rows, agree = [], 0
    for cid in ids:
        passes = {k: runs[k][cid]["pass"] for k in CONFIGS}
        same = len(set(passes.values())) == 1
        agree += same
        fails = {k: failure_kind(runs[k][cid]) for k in CONFIGS if not passes[k]}
        rows.append({"id": cid, "pass": passes, "all_agree": same, "failures": fails})
        print(f"{cid:<4} " + "  ".join(f"{k}:{'ok' if passes[k] else 'XX'}" for k in CONFIGS) + ("" if same else "   <- disagree"))
        for k, why in fails.items():
            print(f"       {k}: {why}")
    print(f"cases where all four agree: {agree}/{len(ids)}")
    _save("results_agreement.json", {"configs": CONFIGS, "agree": agree, "cases": len(ids), "rows": rows})


def _reflects(phrase, text):
    """A must_reflect phrase written as 'X or Y' is satisfied by either alternative."""
    return any(alt.strip().lower() in text for alt in phrase.split(" or "))


def _probes(q):
    q = (q or "").lower()
    use = bool(re.search(r"\bus(e|ed|es|ing)\b|\bdecision|\bdecid", q))
    actor = bool(re.search(r"\bwho\b|\bhuman|\bperson|\brecruiter|\bofficer|\bmanager|\bstaff|\breview", q))
    return use, actor


def pairs():
    from src.agent import classify
    data = _load("minimal_pairs.json")["pairs"]
    out, trace = [], []
    for p in data:
        amb = classify(p["ambiguous"])
        trace.append(f"=== {p['id']} ambiguous\n" + "\n".join(str(m) for m in amb.pop("messages")))
        use, actor = _probes(amb["clarifying_question"])
        entry = {"id": p["id"], "ambiguous": p["ambiguous"], "tier": amb["tier"],
                 "clarifying_question": amb["clarifying_question"], "probes_use": use, "probes_actor": actor,
                 "ambiguous_ok": amb["tier"] == "needs-info" and use and actor, "output": amb, "resolutions": []}
        print(f"\n{p['id']} ambiguous -> {amb['tier']}  probes use={use} actor={actor}\n   Q: {amb['clarifying_question']}")
        for res in p["resolutions"]:
            r = classify(p["ambiguous"], clarification=res["clarification"])
            trace.append(f"=== {res['id']}\n" + "\n".join(str(m) for m in r.pop("messages")))
            text = (" ".join(r["key_facts"]) + " " + r["rationale"]).lower()
            reflect = {ph: _reflects(ph, text) for ph in res["must_reflect"]}
            cite_ok = any(within(c, res["expected_citation"]) for c in r["citations"])
            row = {"id": res["id"], "clarification": res["clarification"], "expected_tier": res["expected_tier"],
                   "expected_citation": res["expected_citation"], "tier": r["tier"], "citations": r["citations"],
                   "tier_ok": r["tier"] == res["expected_tier"], "citation_ok": cite_ok, "must_reflect": reflect,
                   "reflect_ok": all(reflect.values()), "output": r}
            entry["resolutions"].append(row)
            print(f"   {res['id']}: tier {r['tier']} (exp {res['expected_tier']}) cites {r['citations']} "
                  f"citation_ok={cite_ok} reflect={reflect}")
        out.append(entry)
    _save("results_minimal_pairs.json", {"pairs": out})
    (EVAL / "trace_minimal_pairs.txt").write_text("\n\n".join(trace), encoding="utf-8")


def passages():
    from src.agent import MODEL, classify
    from src.rag import get_provision
    cases = _load("passage_gold.json")["cases"]
    out, trace = [], []
    for c in cases:
        r = classify(c["description"])
        trace.append(f"=== {c['id']}\n" + "\n".join(str(m) for m in r.pop("messages")))
        exp = c["expected_provision"]
        found = [x for x in r["citations"] if within(x, exp) or within(exp, x)]
        ob_cites = [o["citation"] for o in r["obligations"] if o["citation"]]
        missed = [e for e in c["expected_core_obligations"] if not any(within(x, e) for x in ob_cites)]
        out.append({"id": c["id"], "expected_tier": c["expected_tier"], "expected_provision": exp,
                    "tier": r["tier"], "citations": r["citations"], "passage_found": bool(found), "found_ids": found,
                    "cited_text": {x: (get_provision(x) or {}).get("text") for x in r["citations"]},
                    "expected_core_obligations": c["expected_core_obligations"], "obligation_citations": ob_cites,
                    "missed_obligations": missed, "output": r})
        print(f"{c['id']}: tier {r['tier']} (exp {c['expected_tier']}) cites {r['citations']} found={found} missed={missed}")
    _save("results_passages.json", {"model": MODEL, "cases": out})
    (EVAL / "trace_passages.txt").write_text("\n\n".join(trace), encoding="utf-8")


def critic():
    from src.critic import CRITIC_MODEL, review
    run = _load("results_passages.json")
    out = []
    for c in run["cases"]:
        o = c["output"]
        if not o["obligations"]:
            out.append({"id": c["id"], "skipped": "no obligations"})
            print(f"{c['id']}: no obligations, skipped")
            continue
        desc = next(x["description"] for x in _load("passage_gold.json")["cases"] if x["id"] == c["id"])
        rep = review(desc, o["tier"], o["citations"], o["obligations"])
        flags = [{"index": j["index"], "verdict": j["verdict"], "note": j["note"],
                  "obligation": o["obligations"][j["index"] - 1]} for j in rep["judgements"] if j["verdict"] != "grounded"]
        out.append({"id": c["id"], "obligations": len(o["obligations"]), "flagged": len(flags), "flags": flags,
                    "missing": rep["missing"], "all_grounded": rep["all_grounded"], "consistent": rep["consistent"],
                    "summary": rep["summary"], "input": rep["input"]})
        print(f"{c['id']}: obligations {len(o['obligations'])} flagged {len(flags)} missing {rep['missing']} consistent {rep['consistent']}")
        for f in flags:
            print(f"   #{f['index']} {f['verdict']} [{f['obligation']['citation']}] {f['obligation']['text']}\n      critic: {f['note']}")
    _save("results_critic_passages.json", {"critic_model": CRITIC_MODEL, "cases": out})


if __name__ == "__main__":
    {"agreement": agreement, "pairs": pairs, "passages": passages, "critic": critic}[sys.argv[1]]()
