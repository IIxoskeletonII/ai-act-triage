# Limitations and future work

## What did not earn its place through a higher classification score

Adding retrieval did not improve the measured label accuracy on our separate 12-case test set. Both the RAG agent and the agent without retrieval returned the expected tier in 12/12 cases; both also passed the citation check in 12/12. This is evidence that retrieval was unnecessary for the labels in these particular examples, not proof that retrieval is unnecessary for legal tasks in general.

The earlier model-by-tools comparison also needs careful wording. On the 20-case development set, Sonnet and Haiku each obtained 16/20 full passes with RAG and 18/20 without tools. Those totals combine tier and citation correctness. They do not mean that retrieval changed four labels or that the two models made identical mistakes. The Phase 9 analysis identifies missing needs-info support, citation rules and one content error among the failures.

### Why might a model do well without retrieval?

A plausible explanation is prior knowledge: the Act and commentary about it may already be represented in the models’ training data. Familiar scenarios can therefore be classified without opening the statutory text during the run. Our experiments do not reveal the training corpus, so training-data overlap remains an explanation consistent with the results, rather than a cause we have demonstrated. The small test set and its relatively recognisable scenarios also limit what we can infer.

### What this changes about our claim

We should defend retrieval through what it lets a reviewer inspect: the actual provisions, their surrounding text and the basis of the proposed next steps. A model can name a correct article from memory without having checked its exact wording. Conversely, retrieving a real article does not guarantee that the model applies it correctly. Label accuracy, citation validity and the correctness of obligations are separate evaluation questions.

Sources: [RAG test results](../eval/results_test_rag.json), [no-retrieval test results](../eval/results_test_parametric.json), and [Phase 9 agreement analysis](../eval/phase9_report.md).

## Honest limits of the current evidence

### The critic is advisory, not a release gate

In the Phase 9 passage evaluation, the critic raised four flags. The team judged two to identify real defects and two to be false alarms, giving precision of 2/4 (50%). This is a result for four flags in one evaluation, not a stable estimate of the critic’s reliability. Recall was not measured: the review did not count every error the critic might have missed. An unflagged answer therefore cannot be treated as verified.

The critic was still useful. Its true flags exposed prohibited-tier obligations that added activities or overstated the cited provision’s scope. Its false flags show why automatic rejection would also discard substantively correct wording. The appropriate use is to direct a reviewer’s attention, with the cited passage available for inspection.

### Some evaluation cases overlap

The six passage-gold cases are close rewordings of development cases, as the Phase 9 report explicitly acknowledges. They test whether the grounding mechanism works on familiar scenarios, but they are not an independent demonstration of generalisation. The 20-case development set also informed prompt and rule changes, so its final 20/20 result is a development outcome. The separate 12-case test is more informative about unseen project examples, but remains small and does not establish performance across all sectors, exceptions or ambiguous descriptions.

Expected tiers and passage-support judgements are the project’s evaluation labels. The report does not establish independent expert validation of every judgement. We should avoid presenting agreement with those labels as an authoritative legal determination.

### A valid citation does not guarantee a correct obligation

The citation guardrail checks whether a provision ID exists. It cannot establish that the model’s proposed action follows from that provision, applies to the relevant actor, or preserves every condition and exception. The Phase 9.1 report illustrates the gap: all 75 obligation citations in the development run were valid IDs, yet the report still identified an overbroad action formulation in A1. This is a historical finding; it should not be confused with a claim that a later version necessarily retains that exact defect.

Obligations are generated text rather than a fixed, reviewed checklist. Their wording and coverage can vary between runs, and the recorded evaluations do not establish a repeated-run stability rate. The nine-item completeness check passed for the two high-risk passage cases, but that does not prove that every generated checklist will be complete or that the rubric captures every applicable duty. Reproducibility and substantive correctness need their own checks, beyond tier accuracy and ID validity.

The present tool is first-pass triage. It helps organise a review; its scores and critic output do not justify treating an assessment as launch approval.

Source: [Phase 9 / 9.1 report](../eval/phase9_report.md), especially the passage overlap caveat, verifier precision and obligation-scope findings.


## Future work: make the next version more reproducible and easier to evaluate

### 1. Use reviewed obligation templates

Replace freely generated obligation wording with a versioned set of reviewed templates. Each entry should identify the supporting provision, the actor it concerns, the triggering facts, the action and timing, and relevant exceptions. The model can propose which entries apply and explain the connection to the description; unresolved applicability should remain an open question rather than being silently assumed. A fixed template alone cannot determine whether it applies.

Test the same descriptions repeatedly and compare selected obligations, missing duties and unsupported additions. Include cases that differ only in actor or exception, and preserve the model, prompt, template and statutory-source versions with each result. This would directly test whether a correct tier also produces a stable, appropriately scoped checklist.

### 2. Build a larger independent test set

Keep development examples separate from a frozen test set written and labelled independently of prompt tuning. Include unfamiliar sectors, genuinely incomplete descriptions, scope exclusions, exceptions, adversarial instructions and minimal pairs where a single fact changes the assessment. Ask a qualified reviewer to check the expected legal basis and document disputed cases rather than forcing uncertain answers into a single label.

Evaluate tier accuracy, appropriate requests for clarification, provision relevance and specificity, obligation completeness and scope, and repeated-run consistency separately. Compare retrieval and no-retrieval settings under the same prompt and model version. For the critic, label errors as well as correct statements so both precision and recall can be measured. Record latency and cost too: added complexity should have a measurable benefit for the task it serves.

### 3. Host the prototype online and test the workflow

Deploy a shared version so testers can use the same application without local setup. Keep model credentials on the server, define handling and retention of submitted descriptions, and show the statutory-source version and assessment date. The interface should continue to distinguish quoted law from generated interpretation and preserve the first-pass status of its output.

Use the hosted version for a small PM workflow study: can a user identify the decisive missing fact, locate the supporting passage and explain the next action? Measure task completion, time and unsupported conclusions against a simple chat-only comparison. This would test the claimed product value directly, rather than assuming that a higher benchmark score or a more elaborate architecture makes the tool more useful.

These are proposed improvements, not capabilities or validation results already delivered. The priorities follow from the observed gap between correct labels, inspectable evidence and reliable obligations.
