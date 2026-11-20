"""Build the persistent embedding index over the AI Act chunks.

Every chunk is embedded on its own direct text: the lines in its scope that no more-specific
chunk covers. Each line of the Act therefore belongs to exactly one embedded unit.
Embedded text: title + lead-in (for points: the parent's first line and the line that introduces
the list) + the chunk's own text. A whole article or annex already starts with its heading and title.
Metadata keeps the chunk's id, title, own text and ancestor chain for citation and display.
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
    """Nearest existing ancestor id, e.g. Art 5(1)(h) -> Art 5(1), Annex VII(3.1) -> Annex VII(3),
    Annex VIII Section A(1) -> Annex VIII."""
    dotted = re.fullmatch(r"(.*\(\d+(?:\.\d+)*)\.\d+\)", cid)
    if dotted and f"{dotted.group(1)})" in ids:
        return f"{dotted.group(1)})"
    while True:
        cut = max(cid.rfind("("), cid.rfind(" "))
        if cut <= 0:
            return None
        cid = cid[:cut]
        if cid in ids:
            return cid


def units(chunks):
    """Split every whole article/annex into per-chunk own text by line position."""
    ids = {c["id"] for c in chunks}
    by_id = {c["id"]: c for c in chunks}
    span, owner, cursor = {}, {}, {}
    for c in chunks:  # document order: a parent always precedes its children
        lines = c["text"].split("\n")
        if WHOLE.match(c["id"]):
            root, start, end = c["id"], 0, len(lines)
            owner[root] = [root] * len(lines)
        else:
            p = parent_of(c["id"], ids)
            root, pstart, pend = span[p]
            whole = by_id[root]["text"].split("\n")
            start = next(i for i in range(cursor[p], pend - len(lines) + 1) if whole[i:i + len(lines)] == lines)
            end = start + len(lines)
            cursor[p] = end
            owner[root][start:end] = [c["id"]] * len(lines)
        span[c["id"]] = (root, start, end)
        cursor[c["id"]] = start + 1
    records = []
    for c in chunks:
        root, start, end = span[c["id"]]
        whole = by_id[root]["text"].split("\n")
        own_idx = [i for i in range(start, end) if owner[root][i] == c["id"]]
        own = "\n".join(whole[i] for i in own_idx)
        parents, p = [], parent_of(c["id"], ids)
        while p:
            parents.insert(0, p)
            p = parent_of(p, ids)
        parts = [] if WHOLE.match(c["id"]) else [c["title"]]
        if parents and own.startswith("("):
            p = parents[-1]
            pr, ps, pe = span[p]
            p_own = [i for i in range(ps, pe) if owner[pr][i] == p and not (WHOLE.match(p) and i < ps + 2)]
            first = whole[p_own[0]] if p_own else None
            intro = next((whole[i] for i in reversed(p_own) if i < own_idx[0]), None)
            parts += [x for x in dict.fromkeys([first, intro]) if x]
        parts.append(own)
        records.append({"id": c["id"], "title": c["title"], "text": own, "parents": parents,
                        "embed": "\n".join(parts), "lines": len(own_idx)})
    return records


def main():
    import chromadb
    from chromadb.config import Settings
    from sentence_transformers import SentenceTransformer

    chunks = json.loads(CHUNKS.read_text(encoding="utf-8"))
    records = units(chunks)
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
            metadatas=[{"id": r["id"], "title": r["title"], "text": r["text"], "parents": " > ".join(r["parents"])}
                       for r in batch],
        )
    total = sum(len(c["text"].split("\n")) for c in chunks if WHOLE.match(c["id"]))
    print(f"embedded {col.count()} units covering {sum(r['lines'] for r in records)} of {total} Act lines "
          f"into {STORE.relative_to(ROOT)} (collection '{COLLECTION}', model {MODEL})")


if __name__ == "__main__":
    main()
