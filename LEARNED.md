# What we have learned, and how far this can go

*Written 2026-09-18 at walk-12, after two days of live runs, four seed sets and three roadmap milestones. [PLAN.md](PLAN.md) says how we measure, [PROGRESS.md](PROGRESS.md) holds the numbers, [ROADMAP.md](ROADMAP.md) the milestones ahead. This says what the numbers mean and what they imply for the destination.*

## What we have learned

**The thesis holds in one specific form.** A graph of tiny model calls beats one context on tasks whose answer is spread out, at every model size that can pick a sentence. On four profile briefs with 35 topics the walk touches 27 / 23 / 26 at 8B / 4B / 1.7B, against 13 to 16 for the same walk on one node and 20 / 10 / 15 for the model answering from memory. On three briefs chosen where memory is weak, 1.7B names 5 topics of 30 from memory and reads its way to 24. Every sentence in those profiles is Wikipedia's, in Wikipedia's order, cited to its section. The shape substitutes for context, not for parameters: 1.7B is level with 8B on topics at a quarter of the time.

**And in one form it does not.** On questions the models have memorised, memory wins from 4B up and reading adds nothing. The first benchmark seeds were exactly those questions, which is why the first two days looked like the idea failing. A seed set has to be filtered by a low closed-book score, or it measures recall.

**Small models pick well and name badly.** From 1.7B up, a model shown a numbered list chooses the right sentence, section, article or name nearly every time. Asked to produce text instead — a search term, a missing fact, a sub-question, a hop — every size drifted, paraphrased its parent, or named the subject itself. Decomposition, the thing the thesis is about, only ever paid when code prepared the candidates: the two-subject split, the section fan-out, the links that occur in a kept sentence. The model chose; code proposed. That is the design rule everything else follows from: the model only selects from things code prepared, and if code can do it the model is not asked.

**Most faults are code's.** Nearly every fault found by reading a profile had a code fix: a search for the whole brief that found the wrong article, junk in a candidate list, a hop child reading on into "section none", a cap that dropped a biography's last sections, a short heading handed to a child. The model's share of a bad profile was small; the harness's candidate set and sequencing decided most of it. Code is cheap to fix and test.

**Three sets and one filter keep a large graph on subject.** Articles read, names opened and sentences kept, all run-wide; and a hop child keeps only sentences that name the brief's subject, from the part of its article that names the subject. With those, ninety-four nodes over four briefs did not drift. Without them, one run chained seven nodes from Turing into Prolog.

**The sizes fail differently.** 1.7B under-reaches: it says none more often and cites every hop it opens. 8B over-reaches: it fills every hop slot and rejects a third of what it finds. 4B's section picks stop early and cost it the end of a biography. 0.6B cannot pick a sentence under a brief at all.

**The fair control puts a size on the thesis.** The same model with the four source requests as tools in one context, budgeted to the graph's own calls and tokens on each seed (the tool control, 2026-09-19): at 1.7B and 4B the graph beats it about two to one on every brief set and the single context lands where memory lands; at 8B the single context stops itself after two or three reads, states what it read, comes within a few topics on Wikipedia and beats the graph on a codebase at a third of the tokens per topic; at 14B the graph moves again and leads on both, at three to four times the tokens per topic. Asked to answer only in sentences it read, a single context paraphrases instead at every size below 8B and copies half a profile at 14B. So the graph is the way a small model reads well and cites at all; a large model driving itself is the cheaper row per topic from 8B up and the better one at 8B on code only, on this ladder.

**What we cannot yet measure.** A topic rubric counts touches. It cannot say that seventeen paragraphs at 8B are better than ten at 1.7B, or that a paragraph about Eris does not belong in a Hubble profile. That is a judge's job, and a judge is the first thing an API key buys.

**On method.** Determinism (fixed sampling, Wikipedia replayed) made every row meaningful and every repeat pointless; only more seeds widen a claim. Reading the output found what scores could not, and each fault became a scripted test before it became a fix. The single-file constraint kept every addition an adapter rather than a subsystem. The rule that nothing is built on an unmeasured layer turned two days that looked like failure into a table that says where the idea works.

## How far this can go

**The reading half is within reach of a tiny model.** The pattern that works — code prepares candidates, the model picks, code verifies and sequences — covers reading, choosing what to read next, staying on subject across many nodes, and assembling a cited answer. Understanding a codebase fits the same pattern (a file is an article, a function a section, a line a sentence), so it should transfer with little new design. Choosing an action from a prepared list fits it too.

**The acting half has one hard step: composition.** Writing a patch means the model producing text, and every place a small model composed, it invented. The likely end state is a hybrid. Tiny models do nearly every call, because nearly every call is a pick. A larger cheap model does the few calls that must compose, and the harness verifies those by running the tests. Cost stays near zero because composition is rare. Whether the composing model can be 8B, 14B or must be a reference model over an API is the question the self-build experiment exists to answer, and it should be answered by the ladder, not guessed.

**Competent has to mean something measurable.** A task set in this repository with test oracles: tiny changes, planted bugs, read-only briefs over the code. Competent is passing most of them, stating nothing the run did not read or execute, at a cost and time we would accept, and doing better than an open coding agent on the same weights past some task size. Until that table exists, competence is a feeling.

**What is needed, in order.**

1. **The bridge.** A model adapter and a source adapter with Node implementations, and a parity test against the page. Engineering, low risk. It unlocks 14B and 32B locally, which shows where the ladder flattens.
2. **Files as a source.** The walk over a directory, Tangle itself as the first corpus, graded by the profile grader. Low risk.
3. **Actions with verification.** A node whose finding is a tool result, run in a worktree, with tests read-only to the agent. Blocking edges so a node can wait on named nodes. The scheduler is depth-first and will need a fairness rule like the hop reserve. Medium risk.
4. **Bounded composition.** The model writes one hunk for one function, never a file; code applies it, runs the tests, and the result is evidence; retries are budgeted. This is the risky layer and the one that decides the model size.
5. **A judge.** A reference model over the API to rank open-ended output and read patches. The first use of a key.
6. **Candidates for open decisions.** Picks need enumerable candidates. "Which function to change" is enumerable; "how to design this feature" is not. The agent will be competent at bounded tasks and weak at open design, and that boundary should be stated rather than hidden.

**How to get there.** The same three loops, one milestone at a time, with the roadmap's exit conditions as the gates. Two habits matter more than any feature. Every layer is measured before the next is built on it. And reading the output stays the primary instrument: for the acting half that means reading traces of tiny tasks the way we read profiles, recording each fault as a case for the ask that made it, and letting the case set decide the model size.

**What not to do.** Build the abstract machine first. Blocking relationships, abstract nodes and actions should each arrive because a measured task needed them. Otherwise they will be shaped by imagination rather than by a failure we watched.
