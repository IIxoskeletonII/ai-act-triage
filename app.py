"""Web app for the triage agent.

Serves the assessment UI, a streaming assessment route that reports which provisions the agent
reads while it works, and read-only views of the Act's text for the citation reader.

Run: python app.py, then open http://127.0.0.1:5000 (setup steps are in the README).
"""

import json
import os
import queue
import re
import threading
import time
from concurrent.futures import CancelledError, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from contextvars import ContextVar, copy_context
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


def _load_env_file(path=ROOT / ".env"):
    """Copy KEY=value lines from .env into the environment. Variables already set in the shell win."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.removeprefix("export ").strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


# .env must be read before src.agent reads MODEL at import time.
_load_env_file()

from src import rag  # noqa: E402  (imports nothing heavy; the retriever loads lazily)


def _prefer_cached_embedding_model():
    """Run the embedding model offline when it is already in the local Hugging Face cache, so the
    model API is the app's only network dependency at runtime."""
    hub = os.environ.get("HF_HUB_CACHE") or str(
        Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")) / "hub")
    snapshots = Path(hub) / ("models--" + rag.MODEL.replace("/", "--")) / "snapshots"
    if any(snapshots.glob("*/config.json")):
        os.environ.setdefault("HF_HUB_OFFLINE", "1")


_prefer_cached_embedding_model()

from flask import Flask, Response, jsonify, render_template, request  # noqa: E402

from src import baseline  # noqa: E402
from src.provision_ids import parse, within  # noqa: E402

try:
    from src.agent import MODEL, classify  # noqa: E402
    _agent_error = None
except Exception as exc:  # the model provider refuses to start without a key; serve the page and explain
    MODEL = os.environ.get("MODEL", "anthropic:claude-sonnet-5-5")
    classify = None
    _agent_error = f"{type(exc).__name__}: {exc}"

app = Flask(__name__)

MAX_DESCRIPTION = 4000
MAX_CLARIFICATION = 2000
ELI = "http://data.europa.eu/eli/reg/2024/1689/oj"
EUR_LEX = "https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng"


# ---------------------------------------------------------------------------
# The Act's text: chunks, article structure and outline (read-only)
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _chunks():
    chunks = json.loads((DATA / "ai_act_chunks.json").read_text(encoding="utf-8"))
    return {c["id"]: c for c in chunks}, {c["id"]: i for i, c in enumerate(chunks)}


def _clean(title):
    return (title or "").replace("`", "").strip()


def _depth(cid):
    parsed = parse(cid)
    return len(parsed[1]) if parsed else 0


def _root(cid):
    parsed = parse(cid)
    return parsed[0] if parsed else cid


@lru_cache(maxsize=256)
def _structure(root):
    """Split an article or annex into lines and attribute each line to the most specific provision
    that contains it. Returns (lines, owner per line, {id: (start, end)} line spans)."""
    chunks, order = _chunks()
    lines = chunks[root]["text"].split("\n")
    owner = [root] * len(lines)
    span = {root: (0, len(lines))}
    cursor = {root: 0}
    members = sorted((c for c in chunks if c != root and within(c, root)), key=order.get)
    for cid in members:  # document order: a parent is always placed before its children
        anc = max((a for a in span if within(cid, a)), key=_depth)
        block = chunks[cid]["text"].split("\n")
        lo, hi = span[anc]
        for i in range(max(lo, cursor[anc]), hi - len(block) + 1):
            if lines[i:i + len(block)] == block:
                span[cid] = (i, i + len(block))
                cursor[anc] = i + len(block)
                cursor[cid] = i
                owner[i:i + len(block)] = [cid] * len(block)
                break
    return lines, owner, span


def _opening(cid, lines, span):
    """The lines a provision states before its first point: the lead-in its points complete."""
    start, end = span[cid]
    first_child = min((s for c, (s, _) in span.items() if c != cid and within(c, cid)), default=end)
    out = lines[start:first_child]
    if not parse(cid)[1]:
        out = out[2:]  # drop the "Article N" / "ANNEX N" heading and the title
    return [line for line in out if line.strip()]


@lru_cache(maxsize=1)
def act_outline():
    """Chapters with their articles, plus the annexes, from the official text's headings."""
    chunks, _ = _chunks()
    lines = (DATA / "ai_act_source.txt").read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.strip() == "HAVE ADOPTED THIS REGULATION:")
    chapters, current = [], None
    for i in range(start, len(lines)):
        line = lines[i].strip()
        if m := re.fullmatch(r"CHAPTER ([IVXL]+)", line):
            current = {"id": m.group(1), "title": _sentence_case(lines[i + 1]), "items": []}
            chapters.append(current)
        elif (m := re.fullmatch(r"Article (\d+)", line)) and current is not None:
            cid = f"Art {m.group(1)}"
            if cid in chunks and all(item["id"] != cid for item in current["items"]):
                current["items"].append({"id": cid, "label": m.group(1), "title": _clean(chunks[cid]["title"])})
        elif line.startswith("ANNEX "):
            break
    annexes = [{"id": cid, "label": cid.split()[1], "title": _clean(c["title"])}
               for cid, c in chunks.items() if cid.startswith("Annex ") and not parse(cid)[1]]
    chapters.append({"id": "Annexes", "title": "Annexes", "items": annexes})
    return chapters


def _sentence_case(text):
    words = text.strip().capitalize().split()
    keep = {"ai": "AI", "eu": "EU"}
    return " ".join(keep.get(w.lower(), w) for w in words)


@lru_cache(maxsize=1)
def _chapter_of():
    return {item["id"]: ch for ch in act_outline() for item in ch["items"]}


def _anchor(root):
    kind, num = root.split(" ", 1)
    return f"{EUR_LEX}#{'art' if kind == 'Art' else 'anx'}_{num}"


def provision_preview(cid):
    """Compact view of one provision for a citation card: its lead-in chain and its own text."""
    chunks, _ = _chunks()
    if cid not in chunks:
        return None
    root = _root(cid)
    lines, _, span = _structure(root)
    if cid not in span:  # a point whose text could not be placed in its article falls back to its own text
        return {"id": cid, "root": root, "title": _clean(chunks[cid]["title"]),
                "heading": lines[0], "lead": [], "text": chunks[cid]["text"]}
    ancestors = sorted((a for a in span if a != cid and within(cid, a)), key=_depth)
    lead = [line for a in ancestors for line in _opening(a, lines, span)]
    start, end = span[cid]
    own = lines[start:end] if parse(cid)[1] else lines[start + 2:end]
    return {"id": cid, "root": root, "title": _clean(chunks[cid]["title"]), "heading": lines[0],
            "lead": lead, "text": "\n".join(own)}


def provision_document(cid):
    """A whole article or annex, line by line, with the lines of the requested provision marked."""
    chunks, _ = _chunks()
    if cid not in chunks:
        return None
    root = _root(cid)
    lines, owner, _ = _structure(root)
    chapter = _chapter_of().get(root)
    out = []
    for i, (text, own) in enumerate(zip(lines, owner)):
        kind = "heading" if i == 0 else "title" if i == 1 else "text"
        out.append({"text": text, "id": own, "depth": _depth(own), "kind": kind,
                    "cited": kind == "text" and within(own, cid)})
    return {"id": cid, "root": root, "title": _clean(chunks[root]["title"]), "heading": lines[0],
            "chapter": {"id": chapter["id"], "title": chapter["title"]} if chapter else None,
            "lines": out, "source": _anchor(root), "eli": ELI}


# ---------------------------------------------------------------------------
# Watching the agent work. The tools in src/agent.py call rag.search and rag.get_provision; these
# wrappers return exactly what the originals return and, during a streamed request, also report
# each call so the page can show which provisions the agent is reading.
# ---------------------------------------------------------------------------

_emit = ContextVar("emit", default=None)
_search, _get_provision = rag.search, rag.get_provision


def _title(cid):
    chunk = _chunks()[0].get(cid)
    return _clean(chunk["title"]) if chunk else None


def _excerpt(cid, limit=420):
    preview = provision_preview(cid)
    if not preview:
        return ""
    return " ".join(preview["lead"] + [preview["text"]])[:limit]


def _observed_search(query, k=5):
    hits = _search(query, k)
    if emit := _emit.get():
        emit({"type": "search", "query": query,
              "hits": [{"id": h["id"], "title": _clean(h["title"]), "excerpt": _excerpt(h["id"])} for h in hits]})
    return hits


def _observed_get_provision(cid):
    found = _get_provision(cid)
    if emit := _emit.get():
        emit({"type": "read", "id": cid, "found": found is not None, "title": _title(cid),
              "excerpt": _excerpt(cid) if found else ""})
    return found


rag.search = _observed_search
rag.get_provision = _observed_get_provision

# Load the embedding model and index once at startup: parallel tool calls must not race to build them.
_ready = threading.Event()
_index_error = None


def _warm_up():
    global _index_error
    try:
        _search("warm up", 1)
    except Exception as exc:  # reported on /api/status and in each failed assessment
        _index_error = f"{type(exc).__name__}: {exc}"
        app.logger.exception("Could not load the retrieval index")
    finally:
        _ready.set()


threading.Thread(target=_warm_up, name="warm-up", daemon=True).start()


# ---------------------------------------------------------------------------
# Assessment
# ---------------------------------------------------------------------------

def _key_present():
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    return bool(key) and key != "your-key-here"


def _not_ready_error():
    """Why an assessment cannot run right now, or None if it can."""
    if not _key_present():
        return "Set ANTHROPIC_API_KEY in .env or the shell, then restart the app."
    if classify is None:
        return "The agent could not start. Check the server log, then restart the app."
    return None


def _read_input(payload):
    description = (payload.get("description") or "").strip()
    clarification = (payload.get("clarification") or "").strip()
    if not description:
        return None, None, "Describe the feature first."
    if len(description) > MAX_DESCRIPTION:
        return None, None, f"Keep the description under {MAX_DESCRIPTION} characters."
    if len(clarification) > MAX_CLARIFICATION:
        return None, None, f"Keep the answer under {MAX_CLARIFICATION} characters."
    return description, clarification or None, None


def _friendly_error(exc):
    if isinstance(exc, AgentTimeout):
        return "The model took too long to answer. Try again."
    if isinstance(exc, CancelledError):
        return "The assessment was interrupted by an earlier one that stalled. Try again."
    seen = exc
    while seen is not None:
        status = getattr(seen, "status_code", None)
        name = type(seen).__name__
        if status == 401 or name == "AuthenticationError":
            return "The model API rejected the key. Check ANTHROPIC_API_KEY and restart the app."
        if status == 404:
            return f"The model '{MODEL}' was not found. Check MODEL in .env."
        if status == 429:
            return "The model API is rate-limiting requests. Wait a moment and try again."
        if status and status >= 500:
            return "The model API is busy right now. Try again in a moment."
        if "Connect" in name or "Timeout" in name:
            return "Could not reach the model API. Check the network connection and try again."
        seen = seen.__cause__ or seen.__context__
    return "The assessment could not be completed. Check the server log and try again."


def _run(description, clarification, emit):
    """Run the unchanged agent, recording the provisions it touches, and return the page's payload."""
    events = []

    def record(event):
        events.append(event)
        emit(event)

    if not _ready.wait(timeout=300) or _index_error:
        raise RuntimeError(_index_error or "The retrieval index did not load.")
    token = _emit.set(record)
    try:
        result, elapsed = _call_agent(description, clarification, emit)
    finally:
        _emit.reset(token)
    return _payload(result, description, clarification, events, elapsed)


# The agent's synchronous entry point drives an event loop over a shared HTTP client, and two calls
# running at once on different threads break each other (one fails, the other can hang). Every call
# therefore runs on one long-lived worker thread, one at a time, with a deadline.
AGENT_TIMEOUT = int(os.environ.get("AGENT_TIMEOUT", "150"))
_agent_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="agent")
_agent_jobs = 0
_agent_jobs_lock = threading.Lock()


class AgentTimeout(Exception):
    pass


def _call_agent(description, clarification, emit):
    global _agent_jobs, _agent_pool
    with _agent_jobs_lock:
        waiting = _agent_jobs
        _agent_jobs += 1
        pool = _agent_pool
    if waiting:
        emit({"type": "queued", "ahead": waiting})

    def job():
        started = time.perf_counter()
        try:
            return classify(description, clarification=clarification), round(time.perf_counter() - started, 1)
        finally:
            global _agent_jobs
            with _agent_jobs_lock:
                _agent_jobs = max(0, _agent_jobs - 1)

    future = pool.submit(copy_context().run, job)
    try:
        return future.result(timeout=AGENT_TIMEOUT)
    except FutureTimeout:
        # A stuck call would block every later one, so leave it on its own thread and start a new one.
        with _agent_jobs_lock:
            if _agent_pool is pool:
                _agent_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="agent")
                _agent_jobs = 0
        pool.shutdown(wait=False, cancel_futures=True)
        raise AgentTimeout(f"no answer after {AGENT_TIMEOUT} s")


def _payload(result, description, clarification, events, elapsed):
    result.pop("messages", None)
    obligation_ids = [o["citation"] for o in result["obligations"] if o.get("citation")]
    cited = list(dict.fromkeys(result["citations"] + obligation_ids))
    invalid = set(result["invalid_citations"])
    result["citation_details"] = [{"id": c, "title": _title(c), "valid": c not in invalid}
                                  for c in result["citations"]]
    result["provisions"] = {c: p for c in cited if (p := provision_preview(c))}
    consulted = {}
    for ev in events:
        for hit in ev.get("hits", []):
            consulted.setdefault(hit["id"], {"id": hit["id"], "title": hit["title"], "read": False})
        if ev["type"] == "read" and ev["found"]:
            consulted.setdefault(ev["id"], {"id": ev["id"], "title": ev["title"], "read": True})["read"] = True
    result["consulted"] = list(consulted.values())
    result["searches"] = [ev["query"] for ev in events if ev["type"] == "search"]
    combined = f"{description}\n{clarification}" if clarification else description
    result["baseline_tier"] = baseline.classify(combined)["tier"]
    result.update(description=description, clarification=clarification, elapsed=elapsed, model=MODEL)
    return result


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

def _asset_version():
    static = ROOT / "static"
    stamps = [p.stat().st_mtime for p in static.rglob("*") if p.is_file()] if static.exists() else [0]
    return str(int(max(stamps)))


@app.get("/")
def index():
    return render_template("index.html", v=_asset_version())


@app.get("/api/status")
def status():
    return jsonify({"ready": _ready.is_set() and not _index_error, "loading": not _ready.is_set(),
                    "index_error": _index_error, "key": _key_present(), "agent_error": _agent_error,
                    "model": MODEL})


@app.get("/api/act")
def act():
    return jsonify({"eli": ELI, "source": EUR_LEX, "chapters": act_outline()})


@app.get("/api/provision")
def provision():
    doc = provision_document((request.args.get("id") or "").strip())
    if doc is None:
        return jsonify({"error": "No provision with that id."}), 404
    return jsonify(doc)


@app.post("/classify")
def classify_route():
    """One-shot JSON assessment. Send {"description"}; if the tier is needs-info, send the same
    description again with {"clarification"} set to the answer to get the full verdict."""
    description, clarification, error = _read_input(request.get_json(silent=True) or {})
    if error:
        return jsonify({"error": error}), 400
    if unavailable := _not_ready_error():
        return jsonify({"error": unavailable}), 503
    try:
        return jsonify(_run(description, clarification, emit=lambda event: None))
    except Exception as exc:
        app.logger.exception("Agent call failed")
        return jsonify({"error": _friendly_error(exc)}), 502


@app.post("/api/assess")
def assess_stream():
    """The same assessment as /classify, streamed as newline-delimited JSON: one event per search or
    provision read while the agent works, then {"type": "result"} or {"type": "error"}."""
    description, clarification, error = _read_input(request.get_json(silent=True) or {})
    if error:
        return jsonify({"error": error}), 400
    if unavailable := _not_ready_error():
        return jsonify({"error": unavailable}), 503

    events = queue.Queue()

    def work():
        try:
            events.put({"type": "result", "data": _run(description, clarification, emit=events.put)})
        except Exception as exc:
            app.logger.exception("Agent call failed")
            events.put({"type": "error", "message": _friendly_error(exc)})
        finally:
            events.put(None)

    threading.Thread(target=work, name="assessment", daemon=True).start()

    def stream():
        yield json.dumps({"type": "start", "model": MODEL, "indexing": not _ready.is_set()}) + "\n"
        while (event := events.get()) is not None:
            yield json.dumps(event, ensure_ascii=False) + "\n"

    return Response(stream(), mimetype="application/x-ndjson",
                    headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    print(f" * AI Act Triage on http://127.0.0.1:{port}  (model: {MODEL})")
    if not _key_present():
        print(" * ANTHROPIC_API_KEY is not set: the page loads, but assessments need the key.")
    elif _agent_error:
        print(f" * The agent could not start: {_agent_error}")
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True, load_dotenv=False)
