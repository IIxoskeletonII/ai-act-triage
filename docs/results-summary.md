# Results summary

## Headline: the agent improves on keywords, but the score needs a definition

On the 20-case v2 development set, the keyword baseline passed 9 cases (45%), while the current RAG agent passed all 20 (100%). A full pass requires both the expected tier and the expected citation; this is more demanding than getting the label alone right.

| System | Cases | Correct tier | Correct citation | Full passes |
| --- | ---: | ---: | ---: | ---: |
| Keyword baseline, v2 development set | 20 | 10/20 (50%) | 10/20 (50%) | 9/20 (45%) |
| Current RAG agent, v2 development set | 20 | 20/20 (100%) | 20/20 (100%) | 20/20 (100%) |
| RAG agent, separate test set | 12 | 12/12 (100%) | 12/12 (100%) | 12/12 (100%) |
| No-retrieval agent, separate test set | 12 | 12/12 (100%) | 12/12 (100%) | 12/12 (100%) |

The development comparison shows that the complete agent handles our examples better than simple keyword rules. It does not isolate retrieval as the reason: prompts, clarification behaviour and citation rules also changed during development. The separate test comparison is especially useful because the agent without retrieval also passes every case.

These are small project benchmarks. A 100% score here does not establish general legal accuracy, and a valid citation does not by itself prove that every obligation is correctly worded.

### Sources and scoring

- [Keyword baseline results](../eval/results_baseline_v2.json)
- [Current RAG development results](../eval/results_agent_v2_rag.json)
- [RAG test results](../eval/results_test_rag.json)
- [No-retrieval test results](../eval/results_test_parametric.json)
- [Phase 9 report](../eval/phase9_report.md): a citation matches when it equals the expected provision or is a descendant of it in the provision tree.

The original 10-case experiment is a different benchmark; its scores should not be mixed with this 20-case comparison.
