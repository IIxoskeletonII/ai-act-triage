"""Loads the curated EU AI Act knowledge base and runs keyword retrieval over it.

The retrieval is deliberately simple: token overlap between the query and each
provision's title, summary and keywords. A small curated corpus does not need
embeddings, and plain scoring is easy to explain and to audit.
"""

import json
import re
from pathlib import Path

_KB_PATH = Path(__file__).resolve().parent.parent / "data" / "ai_act_kb.json"


def _tokenize(text):
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def load_kb(path=_KB_PATH):
    with open(path, encoding="utf-8") as f:
        kb = json.load(f)
    return kb["provisions"]


_PROVISIONS = load_kb()
_INDEX = {p["id"]: p for p in _PROVISIONS}


def valid_ids():
    """The set of provision IDs that exist in the knowledge base."""
    return set(_INDEX.keys())


def get_provision(provision_id):
    return _INDEX.get(provision_id)


def search(query, k=4):
    """Return the k provisions whose text best overlaps the query.

    Keyword tokens are weighted double, since they are the hand-picked triggers
    for each provision. Returns a list of {id, tier, title, summary, score}.
    """
    q = _tokenize(query)
    scored = []
    for p in _PROVISIONS:
        title_summary = _tokenize(p["title"] + " " + p["summary"])
        keywords = _tokenize(" ".join(p["keywords"]))
        score = len(q & title_summary) + 2 * len(q & keywords)
        if score > 0:
            scored.append((score, p))
    scored.sort(key=lambda s: s[0], reverse=True)
    return [
        {"id": p["id"], "tier": p["tier"], "title": p["title"], "summary": p["summary"], "score": score}
        for score, p in scored[:k]
    ]


if __name__ == "__main__":
    import sys

    q = " ".join(sys.argv[1:]) or "chatbot on a website"
    for hit in search(q):
        print(f"{hit['score']:>3}  {hit['id']:<14} {hit['tier']:<12} {hit['title']}")
