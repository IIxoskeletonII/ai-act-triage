"""Baseline classifier: no LLM, no reasoning.

It retrieves the best-matching provision by keyword overlap and returns that
provision's tier and id. This is the number to beat. It is immune to prompt
injection (it never follows instructions in the text) but it cannot ask for
missing information, cannot avoid over-classifying, and gives a single-hit
citation with no rationale.
"""

from .knowledge_base import search


def classify(description):
    hits = search(description, k=1)
    if not hits:
        return {"tier": "minimal-risk", "rationale": "No provision matched.", "citations": [], "confidence": "low"}
    top = hits[0]
    return {
        "tier": top["tier"],
        "rationale": f"Top keyword match: {top['title']}.",
        "citations": [top["id"]],
        "confidence": "low",
    }
