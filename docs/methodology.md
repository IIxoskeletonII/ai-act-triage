# Methodology

How AI Act Triage turns a plain-English feature description into a grounded EU AI Act
assessment, and why it is built the way it is.

## 1. Overview

A product manager types a description of an AI feature. The tool returns:

- a **risk tier**: prohibited, high-risk, limited-risk, minimal-risk or out-of-scope, or
  *needs-info* when the description does not say enough to decide;
- the **citations** behind it, as provision ids such as `Annex III(4)(a)`, each opening the
  verbatim text of Regulation (EU) 2024/1689;
- the **key facts** from the description that drove the tier;
- the **obligations** that follow, each tied to the provision that imposes it;
- the points the PM **still has to confirm**.

The system has four parts:

```
 description (treated as data, never as instructions)
        |
        v
 +---------------+   search_ai_act(query)   +----------------------------+
 |  triage agent | -----------------------> | hybrid retrieval over the  |
 |  (one LLM,    | <----------------------- | full Act: 1,246 provisions |
 |  Pydantic AI) |   get_provision(id)      | dense + BM25, fused by RRF |
 +---------------+                          +----------------------------+
        |
        v
 typed Verdict (tier, key facts, citations, obligations, to-confirm, question)
        |
        v
 citation guardrail (code): every cited id must exist in the Act
        |
        v
 assessment shown to the PM; offline, a critic model re-checks the obligations
```

1. **One agent** (`src/agent.py`) reads the description and decides when and what to look up.
2. **Two tools** give it the Act: a search over the whole text and an exact lookup by id
   (`src/rag.py`).
3. **A typed answer** (a Pydantic `Verdict`) instead of free text, so every field can be checked
   by code.
4. **Two checks**: a code-level guardrail that rejects citations that do not exist, and an
   independent critic (`src/critic.py`) that judges whether each obligation matches the text it
   cites.

### Design principle: the label is the easy part

A frontier model already knows the AI Act from its training data. On our held-out test set the
agent with *no* access to the Act got the tier right in 12 of 12 cases. So the method is not
built to make the label more accurate. It is built around what the label alone does not give a
PM: the exact passage of law, the one question that decides an ambiguous case, and concrete next
steps. Each later section of this document covers one of those.

### Why one agent and not more

The task is one decision by one role: read a description, consult the law, decide. A team of
agents (a retriever, a classifier, a writer) would add calls, latency and ways to fail without
raising the score, because a single agent already reaches full marks on the development set
(20/20 after the Phase 9.1 fix). The model chooses *what* to look up; the code decides what
counts as a *valid* answer. The only second model is the critic, and it is deliberately kept
separate: it never searches and sees only the text it is given, so it checks the agent instead
of repeating it.

## 2. Looking up the Act (retrieval)

The agent does not answer from memory alone. It has two tools over the full text of the Act,
and it decides itself when to call them and with what query.

### From the Official Journal to searchable provisions

The text comes from the official XHTML of Regulation (EU) 2024/1689 in the Official Journal.
Three deterministic scripts prepare it, and none of them generates or rewrites any text:

1. `scripts/to_text.py` converts the XHTML to plain text, one line per paragraph, copying the
   words verbatim.
2. `scripts/chunk.py` splits the articles and annexes into **1,246 provisions** (1,032 from
   articles, 214 from annexes) and gives each one the id a lawyer would cite: `Art 5(1)(h)`,
   `Annex III(4)(a)`, `Art 43(1) subpara 2(a)`. The ids form a tree, so `Annex III(4)(a)`
   sits inside `Annex III(4)`, which sits inside `Annex III`. Recitals are not indexed.
3. `scripts/build_embeddings.py` builds the search index. Each provision is indexed on its *own*
   text, meaning the lines that no more specific provision covers, so every line of the Act
   belongs to exactly one search unit. A point such as `(a)` is meaningless alone, so its unit
   also carries its title and the sentence that introduces the list it belongs to.

Chunking by provision rather than into fixed-size windows is the key choice. A fixed window
would cut through points and mix neighbouring rules, and it would leave nothing exact to cite.
With provision-level chunks, every search result already *is* a citable unit.

### Tool 1: `search_ai_act(query)`, hybrid search

The agent writes its own query, usually in the Act's own vocabulary, for example
*"risk of natural person offending or re-offending law enforcement"* or *"untargeted scraping of
facial images from internet to create facial recognition databases"* (from the test-set traces).
Two rankers run over the same units (`src/rag.py`):

- **Dense search**: the query and every unit are embedded with `all-MiniLM-L6-v2` and compared by
  cosine similarity in a Chroma index. This finds passages that mean the same thing in different
  words ("ranking CVs" and "filter job applications").
- **BM25 keyword search**: this finds exact legal terms that an embedding can blur, such as
  "real-time", "creditworthiness" or "remote biometric identification".

Each ranker returns its top 50. The two lists are merged with **reciprocal rank fusion**
(each unit scores `1 / (60 + rank)` in each list, summed), and the agent receives the top five,
each with its id, title, own text and parent chain. Fusing ranks rather than raw scores means
neither ranker's scale dominates, and a provision that both rankers place high wins.

### Tool 2: `get_provision(id)`, exact lookup

Search finds the right neighbourhood, but legal text is full of cross-references ("the systems
referred to in point (b) of paragraph 1"). `get_provision` returns one provision by id with all
of its points and its parent chain. The prompt tells the agent to follow cross-references with
it and to read each provision in full before it writes an obligation that relies on it. An
unknown id returns an error that shows the id format, so the agent can correct itself.

### What retrieval does and does not change

Retrieval did not move the label. On the held-out test set, the agent with retrieval and the
same agent with no tools both scored **12/12** on tier and citation
(`eval/results_test_rag.json`, `eval/results_test_parametric.json`). On the 20 development
cases the no-tools runs even scored slightly higher (18/20 against 16/20, for both Sonnet and
Haiku), and the gap came mostly from rule gaps in the prompt that were fixed later; only one of
the extra failures (Haiku with retrieval, case N5) was a real content error
(`eval/phase9_report.md`, section 1). The
Act is in the model's training data, and the queries above show it: the agent searches in the
Act's own words because it already knows them.

What retrieval adds is **grounding**. Every citation the PM sees can be opened as the verbatim
text, inside its article, and that text came from a tool call rather than from the model's
memory. In the passage-level check (`eval/passage_gold.json`), the cited passage was found in
6 of 6 cases, and the retrieved text supported all 8 cited provisions.
