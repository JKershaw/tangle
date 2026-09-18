# Plan: pushing tiny models with evals

*A living document. It says what we are building and why; [PROGRESS.md](PROGRESS.md) says where it has got to. Both are updated as the work moves.*

## The question

Tangle asks whether useful global understanding can emerge from recursively resolving tiny local questions. The pocket lab now runs that loop end to end with Qwen3 models from 0.6B to 8B parameters, in a browser, for free. What it cannot yet do is say whether the loop *works*: every change so far has been judged by reading one trace. Two things are missing.

1. **A control.** The same model, the same Wikipedia tool, no decomposition. If a flat agent answers as well as the tangle, the fractal structure is not earning its cost.
2. **A score.** Something that turns a run, or a single model visit, into numbers that can be compared across commits, prompts, grammars and models.

With both in place, "how far can we push these tiny models" becomes a measured climb rather than a feeling.

## Three layers of checking

| layer | what it checks | runs where | cost |
|---|---|---|---|
| unit tests | the harness: scheduler, validator, grammar, tool | CI and `npm test` | milliseconds |
| fixture tests | real past model outputs replayed through the current parser, validator and grammar, one per failure class | CI and `npm test` | milliseconds |
| **evals** | **the model itself, on recorded situations or whole seeds, graded** | **locally, needs the GPU** | **seconds to hours** |

The first two exist. Fixtures prove a failure class *cannot recur*; they cannot say whether the model now does the right thing instead. That is what evals add.

Every failure class we find gets all three: a unit or validator test where the harness can prevent it, a fixture so the exact output is replayed forever, and an eval case so we can see whether the model's behaviour actually improved after a prompt or grammar change.

## Micro-evals: one visit at a time

A micro-eval case is the exact context one node saw in a real run (question, child findings, excerpts with their labels, `lookupsRemaining`, `questionsAllowed`, `failedLookups`), plus the checks a good answer must pass. The runner rebuilds the messages with the *current* prompt and grammar, runs the model once, and grades the output. One call takes a second or two once the grammars are compiled, so a suite of thirty runs in about a minute per model.

Two kinds of case:

- **action**: the full per-node call. Checks are named predicates, all deterministic:
  `action_in`, `query_not` (not a query already in evidence or `failedLookups`), `query_reads_section`, `query_short` (1 to 4 words, not the question), `questions_differ` (each child differs from the parent), `questions_one_each` (one question per child), `valid` (passes the harness validator in a reconstructed run), `evidence_valid` (labels shown only), `finding_supported` (few finding words absent from the cited excerpts), `finding_mentions` (keywords), `finding_avoids` (distractors such as the wrong lake).
- **section**: the forced section pick. Check: `section_in` (the heading that holds the answer).

A case passes when all its checks pass. The suite reports pass rate overall and per failure class, plus latency and tokens. Cases come from two places: the existing fixtures (their contexts are already recorded) and any `model_input` event in an experiment export, added with one command. The cases file is self-contained so old experiments can be pruned later.

What a micro-eval cannot see: whether the choice was good for the *run*. A perfect visit can still be the fortieth copy of the same question. That is the whole-run layer's job.

## End-to-end evals: whole runs with a rubric

A benchmark seed is a question, a list of facts a correct answer contains (each as a small set of interchangeable keywords), the article sections where those facts live on Wikipedia, and distractors that signal the model answered from memory about something else.

Scoring a run:

- **resolved**: the root reached `resolved`.
- **facts**: how many rubric facts appear in the root finding.
- **supported facts**: how many of those also appear in an excerpt the root cites. This is the number that separates "correct" from "correct and grounded", which the 4B runs showed are different things.
- **distractors**: any distractor in any finding.
- **cost**: nodes, model calls, lookups, tokens, wall seconds.
- **structural flags** from the summariser: repeated questions, findings citing only children's sources.

Seeds are chosen to split the hypothesis. Some need facts from several sections or articles, where decomposition should help. Some are answered by one lead paragraph, where it should not. If the tangle only wins on the first kind, that is the result we want to know.

### The flat baseline

Same model, same tool, same prompt, one node: limits `maxDepth 0` (so `questionsAllowed` is 0 and `decompose` leaves the grammar), a larger lookup budget per visit, and enough passes to use it. It is a limits preset, not new code, so the comparison is exactly the decomposition and nothing else. The page gets a hook to start a live run with custom limits and the export records them.

### Cost

A 1.7B tangle run is two to eight minutes; 8B is fifteen to twenty-five. Six seeds, two modes, four models is roughly fifty runs and an overnight on the M1 Max. Everything is free, so the matrix runs in full and re-runs after each harness change worth measuring. The scoreboard keeps one row per (suite, model, mode, commit).

## Reproducibility

- Sampling is fixed (temperature 0.2, seed 1), so the same context gives the same output on the same model. Two runs differ only where the harness changed what the model saw.
- **Wikipedia is recorded and replayed.** The page's fetch goes through a cache the driver can load and dump. Evals run cache-through: a hit is served from the recording, a miss fetches live and is recorded. Article edits stop being noise, and evals mostly run offline.
- Every result records the commit, prompt version, grammar version, model, limits and machine. The driver already fills these in.
- Determinism has one known hole: grammar compile is cached per distinct schema within a browser session, so the first run after a schema change is slow, not different.

## The turn: one decision per call

The first matrix (2026-09-17) said flat beats the tangle wherever the tangle engages. Read carefully, that was a verdict on the harness of that build, not on the approach: the scheduler froze the root on six of seven seeds, and every visit asked the model for five decisions at once — choose an action, name a section, cite by label, write a finding, write child questions — under one grammar. The micro-evals had already shown that no model on the ladder does that job reliably (8, 12, 11 and 20 of 24 up the ladder). Whole-run scores on top of an unreliable node measure noise.

So the plan turns. Before any more whole runs, make a single node reliable, and do it by making each ask as small as it can be:

- **The model only ever selects from things code prepared**, or names one short thing when there is nothing to select from. It never composes a finding: code splits the excerpts into numbered sentences and the model says which one answers, or none. The chosen sentence, verbatim and cited, *is* the finding.
- **Code sequences the visit.** Which ask comes next, whether to look something up or hand it to a child, when to revisit a parent, what counts as a repeat: all decided by the harness from budgets and state. The model never chooses an action, so there is no action enum and no per-action grammar.
- **If code can do it, the model does not.** The first lookup is the question text itself. Repeat detection is string comparison. The section list is an enum.

The thesis is unchanged — a graph of small nodes against one long context — and the node's job just got smaller and checkable.

The asks live in `src/asks.js`, each in several *variants* (phrasings and shapes of the same decision, down to one yes-or-no per sentence). `evals/node/<ask>.json` holds hand-authored cases with known answers, built from the cached articles so the model sees exactly what the harness would show. `scripts/node-eval.mjs` runs every case through every variant on every model and prints pass rate by model × variant. We keep the simplest variant the smallest model passes, and we learn concrete limits (how many sentences 0.6B can choose among before it guesses). A large cheap model over OpenRouter runs the same cases as the truth check: if it fails a case, the case or the ask is wrong; if it passes where 1.7B fails, that is a capacity gap.

Borrowed from Harbour's prompt discipline: the ask is the only variable between rows; cases must not pre-solve the answer; test on a weak model and a strong one; repeat runs before believing a lift; read every result as a lower bound.

## What counts as progress

A change is kept when it improves the micro-eval pass rate for its target class without lowering the rest, and does not lower the benchmark score for any model it was not aimed at. A change that helps 1.7B and costs 8B is recorded as a trade, not a win. The flat baseline sets the bar: a tangle score has to beat flat on the multi-section seeds to count as the approach working.

The brief's constraints still hold. The harness owns the graph, findings are not evidence, strange behaviour is recorded before it is fixed, and no concept is added to the loop that a test or eval did not ask for.

## Phases

- [x] **1. Graders and cases.** `scripts/grade.js` with unit tests; `evals/visits.json` seeded from the fixtures and the experiment traces; a command to add a case from an export.
- [x] **2. Page hooks.** `window.__tangle.visit(context)`, `pick(...)`, `newLive(seed, limits)`, and the Wikipedia record/replay cache. Built and tested through Playwright.
- [x] **3. The eval runner.** `scripts/eval.mjs visits --model …` sharing the browser driver with `live-run.mjs`. First micro-eval scoreboard for all four models.
- [x] **4. Benchmark.** `evals/seeds.json` with rubrics checked against the live articles; `gradeRun`; `scripts/eval.mjs runs --model … --mode flat|tangle`. First matrix across all four models: flat beat the tangle on that build (see the turn above).
- [ ] **5. The node first.** `src/asks.js`, `evals/node/`, `scripts/node-eval.mjs`. Find, for each ask, the simplest variant 1.7B passes; record where 0.6B gives out; check the cases against a large model.
- [ ] **6. The harness-driven visit.** Rewrite `runEpisode` as a fixed sequence of asks with code deciding transitions; the old five-decision prompt stays reachable for comparison. Fixtures and simulation follow.
- [ ] **7. Benchmark again.** Same seeds, same flat control, the new node. Tangle has to beat flat on the multi-section seeds at a defensible token cost on at least one model size.
- [ ] **8. UI, shaped by results.** A linear story view of a run and a map that survives 40 nodes, defaulting to whatever model and limits the scoreboard says.

## The frontier

Each is a hypothesis with the eval that would settle it.

| issue | seen in | hypothesis | settled by |
|---|---|---|---|
| root frozen by honest blocks | 1.7B dead-sea-5: 32 findings under a waiting root | revisit a parent once children are *settled* (resolved or blocked) — **now the default** (7cb40c1) | benchmark: resolved rate up, supported facts not down |
| one answer found forty times | 1.7B dead-sea-4: the same question ×12 | nodes cannot see siblings; showing sibling questions (not findings) stops repeats | benchmark cost down, facts flat; micro-eval `questions_differ` with siblings in context |
| correct but unsupported findings | 4B dead-sea, both runs | the lead is cited because it is what was read; forcing one section read before `resolved` is allowed would ground it | benchmark supported-facts up on 4B |
| memory over evidence (the Aral Sea) | 0.6B and 1.7B dead-sea | `finding_avoids` catches it; the fix may be a prompt line or unreachable at 0.6B | micro-eval pass rate per model |
| token-cap whitespace | 1.7B dead-sea-2 | a lower `max_tokens` or a grammar that cannot emit runs of spaces | fixture exists; micro-eval on the same context |
| the absent-words flag is noisy | 1.7B paraphrase | the threshold should scale with finding length | tune against hand-labelled findings in the cases file |

## Not now

Model-as-judge grading (the local 8B could do it but is noisy at that size; revisit once deterministic graders plateau). Fine-tuning. Any tool beyond Wikipedia. A server.
