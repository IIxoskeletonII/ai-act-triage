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

## 3. The structured answer and the citation check

### A typed verdict instead of free text

The agent does not return prose. Pydantic AI forces its final answer into a `Verdict` object
(`src/agent.py`), and an answer that does not fit the schema is sent back to the model to be fixed
before it reaches the code. The fields:

| Field | What it holds |
|---|---|
| `tier` | one of six fixed values: `prohibited`, `high-risk`, `limited-risk`, `minimal-risk`, `out-of-scope`, `needs-info` |
| `key_facts` | only facts the description itself states that drove the tier, lightly paraphrased |
| `rationale` | two or three plain-English sentences |
| `citations` | provision ids, e.g. `Art 6(2)`, `Annex III(4)(a)` |
| `confidence` | `high`, `medium` or `low` |
| `clarifying_question` | set only for `needs-info` (section 4) |
| `obligations` | a list of `{text, citation}`: one concrete duty and the provision that imposes it |
| `to_confirm` | open points or assumptions the PM should still check |

A typed answer is what makes the rest of the method possible. Because `tier` can only be one of
six values, the eval can score it exactly. Because citations are ids rather than sentences, code
can check them. Because every obligation carries its own citation, both the interface and the
critic can pair each duty with the text it relies on.

`key_facts` has a strict rule: it may contain only what the description says, never conclusions
or legal labels ("is high-risk" belongs in the rationale). That keeps the "what in your
description led to this" panel honest. The PM can see which of their own words decided the tier.

### Rules for what may be cited

The prompt sets three citation rules:

- **Cite only what the tools returned**, either a result's own id or an id in its parent chain.
  This applies to obligation citations too.
- **Cite the most specific operative provision**: the point that states the rule, not its parent.
  `Art 5(1)(h)`, not `Art 5(1)`, and `Annex III(4)(a)`, not `Annex III`. This rule was added after
  case A1 failed by citing only the parent paragraph (`eval/phase9_report.md`, section 1).
- **Cite `Art 6(3)` only for the derogation**, that is only when it is the reason an Annex III
  system is minimal-risk. The first version of the rule only said when to cite it; the final
  version also forbids it on every other verdict, so a high-risk answer never cites an exception
  it does not meet.

### The citation guardrail (code, not model)

After the model answers, `check_citations` collects every cited id, in the verdict and in all
obligations, and compares it with the index of the 1,246 real provision ids
(`data/ai_act_index.json`). Any id that is not in the Act, for example a misnumbered paragraph
or an invented point, comes back in `invalid_citations`.

The guardrail flags; it does not block. The interface shows a warning naming the bad ids, and
the one-page export says which ids failed the check. When everything passes, the page states
*"All N cited ids are real provisions of the Act"*. Blocking would hide the rest of a mostly useful
answer, while flagging keeps it visible and marks exactly what not to trust. On the final dev run
all 75 obligation citations were valid Act ids and the guardrail flagged nothing
(`eval/phase9_report.md`, section 5).

### What the guardrail does not check

The guardrail proves that a citation *exists*, not that it *says* what the answer claims. Two
gaps remain, and other parts of the method address them:

- "Cite only what the tools returned" is a prompt rule, not enforced in code. An id the model
  remembers from training would pass the guardrail as long as it exists.
- An existing id can still be the wrong provision, or an obligation can misstate what its
  provision says. The critic (section 4) and the passage-level eval check this, and a sample
  of the tool's citations is checked by hand against the Official Journal text in
  `docs/contributions/lukas/citation-verification.md`.

### How citations are scored

In the eval (`eval/run_eval.py`) a citation counts as correct when it equals the expected id or
is a *descendant* of it in the id tree (`src/provision_ids.py`). If the expected answer is
`Annex III(4)`, then citing `Annex III(4)(a)` passes, because being more specific is never wrong.
Citing the parent `Annex III` fails, because it does not identify the rule.

### Every citation opens the law

For each cited id, the web app attaches the verbatim text (`provisions`) and the title
(`citation_details`). The reader opens the whole article or annex with the cited point marked,
and it renders statutory text in serif type, so serif always means verbatim law and the
tool's own words never look like the Act.

## 4. The clarifying question, obligations and the critic

### Asking before classifying

Many real descriptions do not decide the tier. *"We use AI to summarise job applications"* is
minimal-risk if a recruiter still reads every application, and high-risk under
`Annex III(4)(a)` if the summaries rank or filter candidates. Guessing either way would be
wrong half the time, so the tool has a sixth outcome, `needs-info`.

The prompt allows `needs-info` only when the intended purpose is genuinely unspecified, so a
classifiable description is classified straight away. In a `needs-info` verdict the agent cites
nothing and asks **one** specific question. When the ambiguity is about how the output is used,
as in employment or credit, the question must ask exactly that: *how is the output used and who
acts on it?* That is the fact the Act turns on, because the `Art 6(3)` derogation depends on
whether the system materially influences a decision.

The PM answers inline. The app sends the original description and the answer together
(`classify(description, clarification=...)`), and the agent returns a full, updated verdict on
the combined facts. Key facts that came from the answer are marked as such, so the PM can see
what their answer changed. The `to_confirm` list works the same way on a smaller scale: each
open point has a shortcut to answer it and reassess.

**How it was tested: minimal pairs** (`eval/minimal_pairs.json`). Three ambiguous inputs (job
applications, loan applications, workforce management) each come with two answers that should
lead to different results:

| Input | Answer A | Answer B |
|---|---|---|
| summarise job applications | recruiter reads everything, no ranking: **minimal-risk**, `Art 6(3)` | ranks candidates, only the top ten are seen: **high-risk**, `Annex III(4)(a)` |
| review loan applications | plain summary, the officer decides: **minimal-risk**, `Art 6(3)` | assigns a credit score that decides approval: **high-risk**, `Annex III(5)(b)` |
| workforce management | screens external applicants: **high-risk**, `Annex III(4)(a)` | evaluates staff for promotion: **high-risk**, `Annex III(4)(b)` |

All 3 inputs triggered a question that asks about use and who acts, and all 6 answers produced
the expected tier and citation. The third pair matters because the tier stays the same but the
legal basis changes, and the key facts and citation follow it.

### Obligations: the next steps

A tier on its own does not tell a PM what to do. Each verdict therefore lists obligations, one
concrete duty per line, each citing the provision that imposes it. The prompt fixes what is
expected per tier:

- **prohibited**: one obligation that mirrors the cited `Art 5` point's own scope and exceptions;
- **high-risk**: the core requirements, one each: risk management (`Art 9`), data governance
  (`Art 10`), technical documentation (`Art 11`), logging (`Art 12`), transparency split into
  `Art 13(1)` and `Art 13(2)`, human oversight (`Art 14`), accuracy and robustness (`Art 15`),
  conformity assessment (`Art 43`) and EU database registration (`Art 49`);
- **limited-risk**: the transparency duty that applies, e.g. `Art 50(1)` for a chatbot;
- **minimal-risk**: no mandatory duties, optionally AI literacy (`Art 4`) and voluntary codes;
- **out-of-scope** and **needs-info**: none.

The agent must read each provision with `get_provision` before it writes the obligation, and the
obligation citations go through the same guardrail as the verdict's (section 3). In the
interface they are a checklist, and the export carries them into the memo.

### The critic: a second model that checks the obligations

The guardrail checks that a cited id exists. The critic (`src/critic.py`) checks whether the
obligation actually **says what the cited text says**. It is deliberately independent:

- it never searches. Code fetches the exact text of each cited provision and passes it in next to
  the obligation;
- it must judge only from that text, never from memory, and it labels each obligation
  `grounded`, `misstated` (right topic, wrong who, what, when or scope) or `ungrounded`;
- for a high-risk verdict it also lists any of the nine core obligations that nothing covers.

**What it found.** Over the passage-gold run it raised four flags. Two were false: it objected
to "before placing on the market" for `Art 43(2)`, a point that is substantively correct. Two were
true: prohibited-tier obligations said "develop" or "place on the market" where `Art 5(1)(c)` and
`Art 5(1)(h)` do not say that. That is a **precision of 2/4 = 50%**; recall was not measured
(`eval/phase9_report.md`, section 4).

The true flags led to a real fix. The prohibited obligation now names exactly the activities the
cited point prohibits, never adds development, and states the point's exceptions and whether
they apply. After the fix the critic judged four of the five prohibited dev cases grounded and
flagged one remaining error: `Art 5(1)(h)` bans only "the use of" real-time remote biometric
identification. A further prompt change addressed it, and in the latest dev run (20/20) that
obligation now reads *"Do not use the real-time remote biometric identification system..."*
(`eval/results_agent_v2_rag.json`, case A1).

**Where it sits.** Because half its flags were false, the critic is an **advisory check, not a
gate**. It runs in the evaluation (`eval/run_critic.py`), not in the live app, and every flag is
reviewed by a person. It earned its place by exposing a defect that the tier score, the citation
score and the guardrail all missed: every one of those cases already passed.

**Strong vs weak.** Run over a strong configuration (Sonnet with retrieval) and a weak one (Haiku
with no tools), the critic flagged about the same share of obligations as misstated: 7 of 54
and 6 of 55 (`eval/results_critic_demo.json`). This fits the project's main finding. Model size
and retrieval do not change the label much, and they do not much change the obligation quality
that the critic can see either. What improved the obligations was tightening the rules for
writing them. After the transparency duty was split into `Art 13(1)` and `Art 13(2)`, the strong
run dropped to 5 misstated out of 60 (`eval/results_critic_strong_fixed.json`).
