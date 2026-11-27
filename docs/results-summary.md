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

## Retrieval and model size: no label gain in the recorded comparison

We compared Sonnet and Haiku with retrieval enabled and with no retrieval tools (the parametric setting). In these older Phase 3e runs, all four configurations got the same 18 of 20 tiers right. Their two shared label errors were E1 and N7, where the expected response was needs-info: that response was not yet supported by the agent.

| Configuration | Correct tiers | Correct citations | Full passes |
| --- | ---: | ---: | ---: |
| Sonnet with RAG | 18/20 (90%) | 17/20 (85%) | 16/20 (80%) |
| Sonnet without retrieval | 18/20 (90%) | 20/20 (100%) | 18/20 (90%) |
| Haiku with RAG | 18/20 (90%) | 17/20 (85%) | 16/20 (80%) |
| Haiku without retrieval | 18/20 (90%) | 19/20 (95%) | 18/20 (90%) |

The 16/20 versus 18/20 headline therefore describes the combined tier-and-citation check, not a difference in label accuracy. Switching retrieval on did not improve the labels, and switching between the two tested models did not change the predicted tiers in these runs. This is a comparison of two model variants, not an experiment that isolates parameter count or establishes that model size never matters.

The later, separate 12-case test gives the same practical message: both the RAG and no-retrieval agents achieved 12/12 on tiers and full passes. These later results should be reported separately from the older development runs, because the system had been revised in between.

### Why might retrieval leave the label unchanged?

A plausible explanation is that the models already know the Act and familiar examples from their training. Retrieval may then repeat information they can already use from memory. However, we cannot inspect their training corpora, and these results do not demonstrate training-data overlap as the cause. A small set of recognisable scenarios can also make improvements difficult to detect, especially when both systems already score 12/12.

Our defensible conclusion is narrow: retrieval did not earn its place through better label accuracy on these recorded cases. Its contribution has to be assessed through the evidence and assistance around the label, including access to the statutory wording, clarification and obligations.

Sources: [Sonnet RAG](../eval/results_sonnet_rag.json), [Sonnet without retrieval](../eval/results_sonnet_parametric.json), [Haiku RAG](../eval/results_haiku_rag.json), [Haiku without retrieval](../eval/results_haiku_parametric.json), and the [Phase 9 analysis](../eval/phase9_report.md).
