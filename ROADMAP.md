# Roadmap: from the pocket lab to a self-building agent

*A living document. [PLAN.md](PLAN.md) says how we measure; [PROGRESS.md](PROGRESS.md) says where the numbers are; [LEARNED.md](LEARNED.md) says what they taught; this says the distance still to go, in steps small enough to follow. Written 2026-09-18 at walk-10, after the first Turing profiles.*

## The destination

A single HTML file that is a complete, incredibly cheap agent: give it a brief, and a graph of tiny model calls reads, chooses and assembles an answer that every sentence of can be traced to something read. A small optional local app gives it hands and feet (files, git, a shell, the open network); the file works without it. It runs on a tiny model in the browser or on a large cheap model over an API, and the same benchmark says what each buys. It can be pointed at its own repository and asked to improve itself, and we know, from measurement rather than hope, what it takes for that to be right.

Between here and there is a sequence of milestones. Each has an entry condition, the work, what verifies it, and an exit condition. Nothing later starts until the exit condition of what it depends on is met, because every layer built on an unmeasured layer measures noise (the lesson of the 2026-09-17 matrix).

## The three loops

Every milestone is worked with the same three loops, and a typical session runs all three.

1. **The text loop.** Choose what to send Tangle, watch it run live, read the output as a person would. Faults are found by reading, not by score: children asking drifting questions, a bibliography chosen as a section, a hop re-reading the subject. Each fault is recorded in [evals/readings.md](evals/readings.md) before it is fixed.
2. **The eval loop.** A recurring fault becomes a seed with a rubric, or a node-eval case for the ask that made the wrong choice. The seed runs in every column (tangle, one-node walk, composing, closed book) on every model size. The benchmark is deterministic, so a row moves only when the code moves. A change is kept when it lifts its target without lowering the rest.
3. **The test loop.** The fix lands as a scripted walk test where the model's picks are fixed and the graph's shape is asserted. Then commit, push, and Pages rebuilds the page from `src/`.

The rule under all three, from [BRIEF.md](BRIEF.md) and the turn in PLAN.md: the model only selects from things code prepared; if code can do it, the model is not asked; findings are not evidence; strange behaviour is recorded before it is fixed; Tangle stays tiny.

## Milestones

### 0. Where we are (walk-10, 2026-09-18)

One HTML file. Questions: the walk reads, picks a sentence, reads on, splits two-subject questions in code, and gathers. Briefs: the root reads the lead, picks up to six sections, one child each, each child keeps sentences and hops once; a cited profile of four to seven paragraphs at every size from 1.7B up. Four benchmark columns over two seed sets; node evals for six asks; 116 tests. Known ceiling: the graph runs out of steam because each node stops when it has an answer, only three code templates ever grow the graph, and nothing a node reads can become a new node.

### 1. Measure the brief

- **Entry:** now.
- **Work:** `evals/seeds-profile.json`, four briefs from different fields (a person, a place, an instrument, a living system), each with a topic list checked against live Wikipedia. `gradeProfile` in `scripts/grade.js`: paragraphs, sentences, articles and sections read, hops chosen and hops that added a sentence, topics touched (and whether the sentence that touches each is cited), duplicate sentences, calls, tokens, seconds. `scripts/eval.mjs runs --seeds evals/seeds-profile.json` in every column, with a closed-book profile prompt for the vanilla column.
- **Verified by:** grader tests on a scripted run and on a real export; one ladder row per column per size.
- **Exit:** a scoreboard table for profiles exists and the Turing row on it matches what reading the profile says. **Exited 2026-09-18 (38d529a, rows at ae3b04a):** tangle 22 / 17 / 21 of 35 topics at 8B / 4B / 1.7B against 8 for one node and 20 / 10 / 15 for memory; the Turing row (8 of 8, six paragraphs, four hops cited) is the profile read by hand.

### 2. Generic decomposition and the frontier

- **Entry:** milestone 1's table. Begun 2026-09-18 (walk-11, ea39412 → 71ee567).
- **Work:** the things a node's kept sentences name (linked titles first, capitalised phrases as fallback) become candidate children; the model picks which deserve a node, from a list code prepared, or none; each child is the same brief with a new focus and a budget. This generalises the hop, which is a child done inline and once. A run-wide *frontier* ranks candidates by how many nodes named them; a run-wide *kept* set means no sentence is picked twice; a parent may wait on named nodes, not only its children. Only depth and node budgets bound the graph, not templates.
- **Verified by:** scripted tests on shape (which children, in what order, refused repeats); the profile table at every size; the base and graph seeds must not fall.
- **Exit:** a forty-node profile at 1.7B in a few minutes whose paragraphs come from at least five articles, and a topic count above the walk-10 row at every size. **Exited 2026-09-18 (0f58764) on the topic condition:** 27 / 23 / 26 against walk-10's 22 / 17 / 21; profiles of up to 28 nodes and 22 articles at 8B, 23 nodes at 1.7B in about a minute. The forty-node profile did not happen: the models choose fewer hops than the budget allows, which is theirs to choose. A parent waiting on named nodes other than its children is not built; nothing has needed it yet.

### 3. The overflow brief

- **Entry:** milestone 2.
- **Work:** one or two briefs whose answer is spread over more text than one context window holds, such as tracing an idea through five articles, chosen where the closed-book score is low. Run in all four columns.
- **Verified by:** the profile table. The composing and closed columns cannot reach the topics by construction; the tangle column has to.
- **Exit:** the first row where the graph beats every single-node column at every size from 1.7B up, on a task a person would ask. **Exited 2026-09-18 (0f58764):** `evals/seeds-overflow.json`, three briefs, 30 topics: tangle 27 / 25 / 24 at 8B / 4B / 1.7B against one node 16 / 18 / 18 and memory 17 / 12 / 5. Not shown: that one node physically cannot hold the text; shown: that it does not reach the topics under the same budget.

### 4. The bridge

- **Entry:** milestone 2 (3 can run alongside). Next, as of 2026-09-18.
- **Work:** one model adapter interface with two implementations: WebLLM in the page (exists) and an OpenAI-compatible HTTP endpoint in Node (Ollama, llama.cpp, later OpenRouter). One Wikipedia adapter with a Node implementation (fetch with a User-Agent, the same recording format). `scripts/run.mjs` runs the walk in Node with no browser. The page stays the lab and the single file.
- **Verified by:** a parity test: the same seed, the same recording, the same scripted picks give an identical graph in both runtimes. Then the base seeds through Ollama with the same Qwen3 weights, expected near the page's rows (quantisation differs), recorded as its own column.
- **Exit:** the benchmark runs in Node end to end and the local ladder extends to Qwen3 14B and 32B. **In progress 2026-09-18 (4a36db9 → 27f36a8):** the parity test passes on three graph shapes; the benchmark and the node evals run in Node against Ollama and LM Studio; 14B rows exist (16 of 23 on the base seeds, 21 from memory); 32B is running. Reading in [evals/readings.md](evals/readings.md).

### 5. Read-only hands

- **Entry:** milestone 4.
- **Work:** a second source beside Wikipedia, behind the same interface: a directory of files. A file is an article, its top-level declarations are sections, its lines are sentences. The first corpus is this repository. A brief such as "Tell me how the walk decides to hop" is a profile over code, graded by the profile grader with a topic list.
- **Verified by:** tests with a fixture directory; profile rows over the repo at every size.
- **Exit:** a cited, correct profile of one of Tangle's own modules at 4B.

### 6. Actions and blocking

- **Entry:** milestone 5.
- **Work:** a node whose finding is the result of an action: run the tests, write a file, show a diff. The model picks an action from a list code prepared; code runs it in a worktree and records the result as evidence. A node can block on named nodes. Tests are read-only to the agent; a node that wants to change one blocks on a human.
- **Verified by:** scripted tests; tiny real tasks the suite can check (add a skipped section name and get a green run), at every size.
- **Exit:** the smallest size that completes a tiny task is known, and the failure modes of the sizes below it are recorded.

### 7. The reference model

- **Entry:** milestones 4 and 6, and a task the local ladder fails.
- **Work:** `OPENROUTER_API_KEY` on the machine; DeepSeek as one more column in node evals, the benchmark and the profile table, at roughly a tenth of a dollar per forty-node run. Also the judge for open-ended profiles, where a deterministic grader runs out.
- **Verified by:** the same tables.
- **Exit:** we know whether a stronger picker moves the ceiling, or whether the ceiling is the candidates code prepares. That answer shapes everything after.

### 8. Against another agent

- **Entry:** milestones 4 and 6.
- **Work:** the same Qwen3 weights, the same quantisation, the same Ollama endpoint, given to Tangle and to an open coding agent such as OpenCode. The task set lives in this repository: small changes with a test oracle, plus read-only briefs over the code. Measures: tasks passed, calls, tokens, wall time, and claims not supported by anything read or run.
- **Verified by:** one table, both agents, three sizes.
- **Exit:** the crossover is known: the task size at which the graph starts to beat one long context, and whether that point moves with model size.

### 9. Self-build

Three stages, deliberately.

- **Idea (now):** Tangle points at its own repository and is asked to improve itself. Written down; nothing built for it.
- **Experiment (after milestone 6):** a brief such as "add X to the walk with tests" runs over the repo and ends in a diff. The test suite is the grader; a human reads the diff. Run at every local size and expect it to fail in instructive ways; record each failure as a case for the ask that made the wrong choice.
- **For real (after milestones 7 and 8):** only once the experiment says what it takes to be right: which size, which asks, which candidates, and what the human must still check. It may need a larger model. It may not. The ladder answers that, not a guess.

## What a key buys, and when

Everything through milestone 6 is verifiable with no key: tests, benchmark rows, parity, the node-eval ladder, and the local models up to 32B through Ollama. A key buys two things: a stronger picker for the reference column, and a judge for open-ended profiles. Both are worth having only once there is a task the local ladder fails and node evals say the picks are the reason. Until then the reference rows stay blank rather than estimated.

## Not now

A server. Fine-tuning. Parallel workers (nodes at one depth are independent, so this is a later speed-up, not a design change). Any tool the current milestone does not need. The story view in the page waits until the profile table says what a reader most needs to see.

## Order of work

1 → 2 → 3 with 4 alongside → 5 → 6 → 7 and 8 → 9. Each milestone lands as commits on `main` with its rows in PROGRESS.md and its reading in evals/readings.md, and this file's milestone gets a date and a commit when it exits.
