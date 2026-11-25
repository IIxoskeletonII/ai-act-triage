PHASE 9 / 9.1 REPORT - EU AI Act triage tool
Model for all live runs: anthropic:claude-sonnet-5-5 (agent and critic) unless stated.
Scoring: tier must match; a cited id satisfies the expected id if it is equal or a descendant in the id tree.

======================================================================
1. AGREEMENT ANALYSIS
======================================================================
Source: Phase 3e de-leaked runs, 20 v2 dev cases, four configs.

Scores:
  Sonnet RAG         16/20
  Sonnet parametric  18/20
  Haiku RAG          16/20
  Haiku parametric   18/20

All four configs agree on 17 of 20 cases (15 all pass, 2 all fail).

Cases where at least one config failed:
  Case  Sonnet-RAG  Sonnet-param  Haiku-RAG  Haiku-param  Why it failed
  E1    fail        fail          fail       fail         structural: needs-info tier did not exist yet
  N7    fail        fail          fail       fail         structural: needs-info tier did not exist yet
  N6    fail        pass          fail       pass         structural: minimal-risk rule said "cite nothing", so Art 6(3) was dropped
  N5    pass        pass          fail       pass         content: Haiku RAG cited Art 50(2) on a minimal-risk verdict
  A1    fail        pass          pass       pass         structural: cited the parent Art 5(1), not the point Art 5(1)(h)

Disagreements: 3 cases (N6, N5, A1). Two are structural gaps later fixed by rules
(N6 by the derogation citation rule, A1 by the point-level citation rule, both Phase 4);
one is a content error (N5, Haiku RAG only).

Did identical scores hide different mistakes? Partly: the two 16/20 RAG runs share the
structural N6 failure, but under it Haiku RAG made a genuine content error (N5) that
Sonnet RAG did not, while Sonnet RAG's other failure (A1) was a citation-depth gap.

======================================================================
2. MINIMAL PAIRS (eval/minimal_pairs.json)
======================================================================
Ambiguous inputs:
  Pair  Ambiguous input                                  needs-info?  Question probes use / who acts?
  MP1   We use AI to summarise job applications.         yes          yes
  MP2   We use AI to review loan applications.           yes          yes
  MP3   We use AI in our workforce management.           yes          yes

Clarifying questions (verbatim):
  MP1: How is the summary output used in your hiring process, and who acts on it? For example, does a
       recruiter read the summaries alongside the full applications, or are they used to rank, score,
       filter out or shortlist candidates before a person looks at the application?
  MP2: How is the AI's output used and who acts on it? For example, does it score or assess the
       creditworthiness of individual applicants, and does a loan officer or an automated process
       make the final decision?
  MP3: What specific task does the AI perform in workforce management (for example scheduling, task
       allocation, performance monitoring or evaluation, or hiring, promotion or termination
       decisions)? How is its output used, and who acts on it: does a manager or HR person review it
       and decide, or does it trigger decisions or actions automatically?
  (Probe check: keyword test for a use word and an actor word; questions shown so they can be read.)

Resolutions (via the clarify loop):
  Res    Expected tier / citation      Predicted tier  Cited                        Citation present?  must_reflect all present?
  MP1-A  minimal-risk / Art 6(3)       minimal-risk    Annex III(4)(a), Art 6(3)    yes                yes
  MP1-B  high-risk / Annex III(4)      high-risk       Art 6(2), Annex III(4)(a)    yes                yes
  MP2-A  minimal-risk / Art 6(3)       minimal-risk    Art 6(3)                     yes                yes
  MP2-B  high-risk / Annex III(5)      high-risk       Art 6(2), Annex III(5)(b)    yes                yes
  MP3-A  high-risk / Annex III(4)      high-risk       Art 6(2), Annex III(4)(a)    yes                yes
  MP3-B  high-risk / Annex III(4)      high-risk       Annex III(4)(b), Art 6(2)    yes                yes
Result: 3/3 ambiguous inputs and 6/6 resolutions pass.
(A must_reflect phrase written "X or Y" passes if either alternative appears.)

How the two resolutions differ:
  MP1: A's key facts are "a recruiter reads every application in full" and "does not rank, score or
       filter", and its rationale applies the Art 6(3) derogation (preparatory task, no material
       influence); B's key facts are "ranks candidates" and "only the top ten are reviewed", and its
       rationale says ranking materially influences who is seen, so it is high-risk under Annex III(4)(a).
  MP2: A's key facts are "only writes a plain-language summary" and "a loan officer reads the full
       application and decides independently" (derogation applies); B's are "assigns a creditworthiness
       score" and "the score determines approval" (high-risk under Annex III(5)(b), derogation does not fit).
  MP3: Same tier (high-risk) both times, different basis: A's key facts are "screens and ranks external
       job applicants" and "shortlists for recruiters" (recruitment, Annex III(4)(a), ranking likely
       profiling); B's are "evaluates the performance of current employees" and "informs promotion and
       termination decisions" (workers' management, Annex III(4)(b)).

======================================================================
3. PASSAGE-LEVEL EVAL (eval/passage_gold.json, RAG agent)
======================================================================
  Case  Expected provision  Tier (expected)            Cited                       Passage found?  Text supports?  Missed core obligations
  PG1   Annex III(4)        high-risk (high-risk)      Annex III(4)(a), Art 6(2)   yes             yes             none (all 9 present)
  PG2   Art 50(1)           limited-risk (limited)     Art 50(1)                   yes             yes             n/a (not high-risk)
  PG3   Art 5(1)(c)         prohibited (prohibited)    Art 5(1)(c)                 yes             yes             n/a (not high-risk)
  PG4   Annex III(5)        high-risk (high-risk)      Art 6(2), Annex III(5)(b)   yes             yes             none (all 9 present)
  PG5   Art 5(1)(h)         prohibited (prohibited)    Art 5(1)(h)                 yes             yes             n/a (not high-risk)
  PG6   Art 2               out-of-scope (out-of-scope) Art 2(8)                   yes             yes             n/a (not high-risk)
Result: passage found 6/6; text supports 6/6 (8 of 8 cited provisions); missed core obligations 0.

"Text supports" was judged by reading each cited provision's text in data/ai_act_chunks.json.
Decisive text, for example:
  Annex III(4)(a): "AI systems intended to be used for the recruitment or selection of natural persons,
                   in particular ... to analyse and filter job applications, and to evaluate candidates"
  Annex III(5)(b): "AI systems intended to be used to evaluate the creditworthiness of natural persons
                   or establish their credit score"
  Art 2(8):        "This Regulation does not apply to any research, testing or development activity
                   regarding AI systems or AI models prior to their being placed on the market or put
                   into service."
Caveat: the six PG cases are close rewordings of dev cases, so this is not independent of the dev set.

======================================================================
4. VERIFIER PRECISION
======================================================================
Critic run over the passage-gold run's obligations (Phase 9; PG6 had no obligations):
  Case  Flag (citation)       Critic's reason                                         Judgement
  PG1   #9 (Art 43(2))        "before placing on the market" timing not in the text   FALSE (substantively correct)
  PG4   #9 (Art 43(2))        same timing point                                       FALSE (substantively correct)
  PG3   #1 (Art 5(1)(c))      obligation adds "develop"; the text does not            TRUE
  PG5   #1 (Art 5(1)(h))      text bans only "the use of", and only conditionally     TRUE

  True flags:  2
  False flags: 2
  Precision:   2 / 4 = 50%
  Recall:      not measured (errors the critic missed were not counted).

Verdict: the verifier earns a place as an advisory check, not as a gate; half its flags were false,
but its two true flags exposed a real defect (the prohibited-tier obligation wording), which led to
the Phase 9.1 fix.

======================================================================
5. PHASE 9.1 RESULTS (prohibited-tier obligation fix)
======================================================================
Change (shared prompt, both agents): the prohibited obligation now mirrors the cited Art 5 point's own
scope ("must not be placed on the market, put into service or used, as far as the point's text
prohibits it"), never adds development, states the point's exceptions or conditions, and says when the
described use is clearly not covered by them. No eval answer id was added to the prompt.

A1 (real-time facial recognition), verdict: prohibited, cites Art 5(1)(h). Obligation:
  "Do not place on the market, put into service or use real-time remote biometric identification in
   publicly accessible spaces for law enforcement, unless and in so far as strictly necessary for a
   listed objective: (i) targeted search for abduction, trafficking or sexual exploitation victims or
   missing persons, (ii) preventing a specific, substantial and imminent threat to life or safety or a
   genuine terrorist threat, or (iii) locating or identifying a suspect of an Annex II offence
   punishable by at least four years' custody. The exceptions do not cover general, untargeted facial
   recognition of people in public squares."  [Art 5(1)(h)]

T5 (social scoring), verdict: prohibited, cites Art 5(1)(c). Obligation:
  "Do not place this social scoring system on the market, put it into service or use it. The ban covers
   scoring that leads to detrimental treatment in unrelated social contexts or treatment that is
   unjustified or disproportionate, and no exception applies to denying public services on the basis of
   a behaviour score."  [Art 5(1)(c)]

Check with the critic on all five prohibited dev cases after the fix:
  T5   grounded
  N4   grounded (states the "objective and verifiable facts" exception and why it does not apply)
  A2   grounded (states the "medical or safety reasons" exception and why it does not apply)
  N10  grounded (states the dataset-labelling and law-enforcement carve-outs and why they do not apply)
  A1   misstated: the obligation still says "place on the market, put into service or use", but
       Art 5(1)(h) prohibits only "the use of". This flag is TRUE: the text of Art 5(1)(h) begins
       "the use of 'real-time' remote biometric identification systems ...".
  "Develop" no longer appears in any prohibited obligation. The exceptions are now stated and, for A1,
  correctly said not to cover untargeted public surveillance. One residual error remains: A1's verbs.

Dev check (RAG agent, 20 v2 cases): 20/20 passed, tier 100%, citation 100%.
All 75 obligation citations are valid Act ids; the guardrail flagged nothing.

======================================================================
6. COMMIT
======================================================================
This report is committed together with the Phase 9.1 fix (message: "Mirror each Art 5 point's scope
and exceptions in the prohibited obligation and add the Phase 9 report"). The hash is given in the
accompanying message. Previous analysis commit: 12ace4a.
