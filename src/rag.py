"""Embedding retrieval over the AI Act leaf chunks (built by scripts/build_embeddings.py).

The keyword search in knowledge_base.py stays as the retrieval baseline.
"""

from functools import lru_cache
from pathlib import Path

STORE = Path(__file__).resolve().parent.parent / "data" / "chroma"
COLLECTION = "ai_act"
MODEL = "sentence-transformers/all-MiniLM-L6-v2"


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(MODEL)


@lru_cache(maxsize=1)
def _collection():
    import chromadb
    from chromadb.config import Settings
    client = chromadb.PersistentClient(path=str(STORE), settings=Settings(anonymized_telemetry=False))
    return client.get_collection(COLLECTION)


def search(query, k=5):
    """Return the k leaf chunks closest to the query as {id, title, text, score} (cosine similarity)."""
    vector = _model().encode([query], normalize_embeddings=True)[0].tolist()
    res = _collection().query(query_embeddings=[vector], n_results=k, include=["metadatas", "distances"])
    return [
        {"id": m["id"], "title": m["title"], "text": m["text"], "score": round(1 - d, 4)}
        for m, d in zip(res["metadatas"][0], res["distances"][0])
    ]


if __name__ == "__main__":
    import sys

    q = " ".join(sys.argv[1:]) or "chatbot on a website"
    for hit in search(q):
        print(f"{hit['score']:.3f}  {hit['id']:<24} {hit['title']}")
