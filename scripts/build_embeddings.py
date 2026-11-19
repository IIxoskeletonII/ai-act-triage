"""Build the persistent embedding index over the leaf chunks of the AI Act.

A leaf is a chunk with no more-specific child id (Art 5(1)(h) is a leaf, Art 5(1) is not).
Embedded text: title + the parent's lead-in line (for points) + the chunk's own text.
Metadata keeps the chunk's own id, title and text for citation and display.
Usage: python scripts/build_embeddings.py
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHUNKS = ROOT / "data" / "ai_act_chunks.json"
STORE = ROOT / "data" / "chroma"
COLLECTION = "ai_act"
MODEL = "sentence-transformers/all-MiniLM-L6-v2"
WHOLE = re.compile(r"^(Art \d+|Annex [IVXL]+)$")


def parent_of(cid, ids):
    """Nearest existing ancestor id, e.g. Art 5(1)(h) -> Art 5(1), Annex VIII Section A(1) -> Annex VIII."""
    while True:
        cut = max(cid.rfind("("), cid.rfind(" "))
        if cut <= 0:
            return None
        cid = cid[:cut]
        if cid in ids:
            return cid


def lead_in(parent):
    """First line of the parent's own text, skipping the heading and title of a whole article or annex."""
    lines = parent["text"].split("\n")
    return lines[2] if WHOLE.match(parent["id"]) else lines[0]


def leaf_records(chunks):
    by_id = {c["id"]: c for c in chunks}
    ids = set(by_id)
    has_child = {p for c in chunks if (p := parent_of(c["id"], ids))}
    records = []
    for c in chunks:
        if c["id"] in has_child:
            continue
        parts = [c["title"]]
        parent = parent_of(c["id"], ids)
        if parent and c["text"].startswith("("):
            parts.append(lead_in(by_id[parent]))
        parts.append(c["text"])
        records.append({"id": c["id"], "title": c["title"], "text": c["text"], "embed": "\n".join(parts)})
    return records


def main():
    import chromadb
    from chromadb.config import Settings
    from sentence_transformers import SentenceTransformer

    records = leaf_records(json.loads(CHUNKS.read_text(encoding="utf-8")))
    model = SentenceTransformer(MODEL)
    vectors = model.encode([r["embed"] for r in records], batch_size=64, normalize_embeddings=True,
                           show_progress_bar=False)

    client = chromadb.PersistentClient(path=str(STORE), settings=Settings(anonymized_telemetry=False))
    client.get_or_create_collection(COLLECTION)
    client.delete_collection(COLLECTION)
    col = client.create_collection(COLLECTION, metadata={"hnsw:space": "cosine"})
    for i in range(0, len(records), 500):
        batch = records[i:i + 500]
        col.add(
            ids=[r["id"] for r in batch],
            embeddings=[v.tolist() for v in vectors[i:i + 500]],
            documents=[r["embed"] for r in batch],
            metadatas=[{"id": r["id"], "title": r["title"], "text": r["text"]} for r in batch],
        )
    print(f"embedded {col.count()} leaf chunks of {len(json.loads(CHUNKS.read_text(encoding='utf-8')))} "
          f"into {STORE.relative_to(ROOT)} (collection '{COLLECTION}', model {MODEL})")


if __name__ == "__main__":
    main()
