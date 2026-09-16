# tangle

You are helping build Tangle, a deliberately tiny experimental system for studying how useful global understanding can emerge from recursively resolving small, locally scoped questions.

Tangle is not an agent framework, task manager, planner, or autonomous software engineer. Treat it as a research harness.

The central experiment is:

«Can useful global understanding emerge from recursively resolving tiny local contexts?»

A run begins with one seed node, for example:

«Understand MangoDB well enough to explain how it works.»

A fresh model invocation receives one bounded node plus only the evidence/context needed for that node. It may inspect a repository. It should either:

- resolve the node with a finding supported by inspected evidence;
- decompose it into smaller questions;
- or report that it is blocked.

The invocation then ends.

Those child questions become independent nodes with fresh contexts. When children resolve, a parent may be revisited with their findings and evidence. It can resolve, remain unresolved, or create further questions.

The graph should be allowed to develop naturally. Do not assume in advance that it will be a tree, DAG, task graph, or any other sophisticated abstraction.

Core principles

Keep Tangle extremely small.

Use vanilla JavaScript/Node.js and sensible minimal dependencies. Prefer files for persistence. Execution should initially be serial and deterministic.

Use iterative, test-driven development. Introduce one behaviour at a time:

1. write the smallest useful failing test;
2. implement the smallest behaviour that makes it pass;
3. refactor only when the existing design creates real friction;
4. keep tests readable enough to document the behaviour of the system;
5. commit working increments rather than designing far ahead.

Make reality earn the architecture.

A node is a bounded question, claim, or problem being resolved, not a conventional task.

The harness owns the graph. Models may propose findings, evidence references, and child questions, but deterministic application code validates and persists graph mutations.

One model invocation should operate on one node.

Do not allow model reasoning or summaries to manufacture evidence. Keep findings and evidence distinct.

For example:

Finding:
“Collections are persisted as JSON files.”

Evidence:
"src/storage.js", lines inspected during the run.

The finding may ultimately be wrong. The evidence records what was actually observed.

Do not prematurely add concepts such as task types, intent classification, verification agents, confidence scores, semantic deduplication, model escalation, vector databases, parallel workers, sophisticated scheduling, completion frameworks, self-improvement, or elaborate stopping rules.

If strange behaviour occurs, preserve it and record it before fixing it. Repeated questions, awkward decomposition, unresolved branches and contradictions are experimental observations.

Initial execution model

Start with the simplest useful loop:

- choose a runnable unresolved node deterministically;
- create a fresh model context;
- allow limited repository inspection tools;
- receive a structured result;
- validate it;
- persist graph state and raw trace information;
- repeat.

When all known children of a parent resolve, revisit the parent rather than automatically synthesising their answers.

Initially favour observability over optimisation.

Preserve enough information to reconstruct runs later: model, prompt version, repository commit, node/parent IDs, depth, input context, tool calls/results, model response, parsed result, findings, evidence, children, token usage, timing and cost where available.

Experiments should live alongside the code and remain reproducible.

The first target experiment is intentionally mundane: point Tangle at MangoDB and ask it to understand the repository. We care at least as much about the shape and trace of the investigation as the final explanation.

Potential future experiments include repeated runs against the same commit, changing only the seed wording, changing models, comparing independently grown graph topology, diagnosis, research, comparison and eventually action. Do not build support for these until the current experiment demands it.

Further reading before making architectural decisions

Inspect the existing Tangle repository completely: README, package metadata, source, tests, experiment logs and git history where useful.

For the first subject repository, inspect MangoDB's README/documentation, package metadata, tests, public API and source code. Prefer learning its architecture through actual repository evidence rather than assuming how a small database ought to work.

If historical TAG/Tag Two material is available, treat it as experimental background rather than architecture to copy. Its most important inherited lesson is the separation of claims from evidence and the value of observing repeated behaviour before turning observations into features.

When uncertain, choose the implementation that leaves Tangle smaller, more inspectable and easier to change after the next experiment.

The first meaningful milestone is deliberately modest:

«Grow and persist one inspectable understanding graph from one repository and one seed.»

Do not optimise for impressiveness. Optimise for learning.
