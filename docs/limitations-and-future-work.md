# Limitations and future work

## What did not earn its place through a higher classification score

Adding retrieval did not improve the measured label accuracy on our separate 12-case test set. Both the RAG agent and the agent without retrieval returned the expected tier in 12/12 cases; both also passed the citation check in 12/12. This is evidence that retrieval was unnecessary for the labels in these particular examples, not proof that retrieval is unnecessary for legal tasks in general.

The earlier model-by-tools comparison also needs careful wording. On the 20-case development set, Sonnet and Haiku each obtained 16/20 full passes with RAG and 18/20 without tools. Those totals combine tier and citation correctness. They do not mean that retrieval changed four labels or that the two models made identical mistakes. The Phase 9 analysis identifies missing needs-info support, citation rules and one content error among the failures.

### Why might a model do well without retrieval?

A plausible explanation is prior knowledge: the Act and commentary about it may already be represented in the models’ training data. Familiar scenarios can therefore be classified without opening the statutory text during the run. Our experiments do not reveal the training corpus, so training-data overlap remains an explanation consistent with the results, rather than a cause we have demonstrated. The small test set and its relatively recognisable scenarios also limit what we can infer.

### What this changes about our claim

We should defend retrieval through what it lets a reviewer inspect: the actual provisions, their surrounding text and the basis of the proposed next steps. A model can name a correct article from memory without having checked its exact wording. Conversely, retrieving a real article does not guarantee that the model applies it correctly. Label accuracy, citation validity and the correctness of obligations are separate evaluation questions.

Sources: [RAG test results](../eval/results_test_rag.json), [no-retrieval test results](../eval/results_test_parametric.json), and [Phase 9 agreement analysis](../eval/phase9_report.md).
