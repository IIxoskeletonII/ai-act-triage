"""Hybrid retrieval over the AI Act (units built by scripts/build_embeddings.py).

Dense (all-MiniLM-L6-v2 in Chroma) and BM25 rankings over the same embedded units,
fused with reciprocal rank fusion. get_provision looks a provision up by id in the chunked Act.
The keyword search in knowledge_base.py stays as the retrieval baseline over the curated KB.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

from .provision_ids import parse, within

DATA = Path(__file__).resolve().parent.parent / "data"
STORE = DATA / "chroma"
COLLECTION = "ai_act"
MODEL = "sentence-transformers/all-MiniLM-L6-v2"
CANDIDATES = 50  # depth of each ranking fed into the fusion
RRF_K = 60       # standard reciprocal rank fusion constant


def _tokens(text):
    return re.findall(r"[a-z0-9]+", text.lower())


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(MODEL)


@lru_cache(maxsize=1)
def _index():
    import chromadb
    from chromadb.config import Settings
    from rank_bm25 import BM25Okapi
    client = chromadb.PersistentClient(path=str(STORE), settings=Settings(anonymized_telemetry=False))
    col = client.get_collection(COLLECTION)
    data = col.get(include=["documents", "metadatas"])
    bm25 = BM25Okapi([_tokens(d) for d in data["documents"]])
    return col, data["ids"], {i: m for i, m in zip(data["ids"], data["metadatas"])}, bm25


def _dense(query, n):
    col = _index()[0]
    vector = _model().encode([query], normalize_embeddings=True)[0].tolist()
    return col.query(query_embeddings=[vector], n_results=n, include=[])["ids"][0]


def _bm25(query, n):
    _, ids, _, bm25 = _index()
    scores = bm25.get_scores(_tokens(query))
    return [ids[i] for i in sorted(range(len(ids)), key=lambda i: -scores[i])[:n]]


def search(query, k=5):
    """Return the k best units as {id, title, text, parents, score} (score = fused RRF score)."""
    fused = {}
    for ranking in (_dense(query, CANDIDATES), _bm25(query, CANDIDATES)):
        for rank, cid in enumerate(ranking, 1):
            fused[cid] = fused.get(cid, 0.0) + 1 / (RRF_K + rank)
    meta = _index()[2]
    best = sorted(fused, key=lambda c: -fused[c])[:k]
    return [
        {"id": c, "title": meta[c]["title"], "text": meta[c]["text"],
         "parents": meta[c]["parents"].split(" > ") if meta[c]["parents"] else [], "score": round(fused[c], 5)}
        for c in best
    ]


@lru_cache(maxsize=1)
def valid_ids():
    """Every provision id in the Act (data/ai_act_index.json)."""
    return frozenset(json.loads((DATA / "ai_act_index.json").read_text(encoding="utf-8")))


@lru_cache(maxsize=1)
def _chunks():
    return {c["id"]: c for c in json.loads((DATA / "ai_act_chunks.json").read_text(encoding="utf-8"))}


def get_provision(cid):
    """Return one provision as {id, title, text, parents}, or None for an unknown id.

    text is the provision's full scope as chunked from the official text: its own lines followed by
    all of its points. parents is its ancestor chain, outermost first.
    """
    chunk = _chunks().get(cid)
    if chunk is None:
        return None
    parents = sorted((p for p in _chunks() if p != cid and within(cid, p)), key=lambda p: len(parse(p)[1]))
    return {"id": cid, "title": chunk["title"], "text": chunk["text"], "parents": parents}


if __name__ == "__main__":
    import sys

    q = " ".join(sys.argv[1:]) or "chatbot on a website"
    for hit in search(q):
        print(f"{hit['score']:.5f}  {hit['id']:<24} {hit['title']}")
