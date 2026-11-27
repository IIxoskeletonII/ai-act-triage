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
