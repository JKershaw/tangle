# Evals

The model-in-the-loop layer described in [PLAN.md](../PLAN.md). Results land in [PROGRESS.md](../PROGRESS.md).

- `visits.json` — micro-eval cases: one recorded situation each (the exact context a node saw in a real run, or a section-pick request), the output the model gave at the time, and the named checks a good answer passes. `test/evals.test.js` keeps the file well formed and grades the recorded outputs.
- `scripts/eval-case.mjs` — adds a case from an experiment export (`--export … --seq …`) or from a test fixture (`--fixture …`).
- `scripts/grade.js` — the checks, all deterministic. `test/grade.test.js` pins each one with recorded outputs.
- `scripts/eval.mjs` — runs a suite against a loaded model in the built page and writes results here under `results/`; rows land in `results.md`, and what each round meant is written up in `readings.md`.

To add a case after a run shows something new: find the `model_input` (or `section_chosen`) event's `seq` in the export, add it with a class name and the checks that describe the right behaviour, and let the recorded output stand as what the model did then.

## Node evals

The cases above are visits under the one-prompt design: one call, five decisions. The node evals measure the asks the walk makes instead (`src/walk.js`, `src/asks.js`): one decision per call, so each ask can be tried in several *variants* and the simplest one a small model passes can be kept.

- `node/sentence.json` — which numbered sentence answers the question, or none. Cases name a cached article, a section and a slice of its sentences (`from`/`to`), and the expected pick; `contains` guards the numbering, `accept` lists every defensible pick. Five cases expect `none`.
- `node/section.json` — which section heading of an article most likely holds the answer.
- `node/missing.json` — the free-text ask: what to look up next, with nothing read or with a lead read that did not answer. Graded by pipe-separated alternatives the answer must mention.
- `node/results.md` — one row per model and variant, newest last; the JSON named in each row (under `results/`) holds every raw output.

Run one ask across models and variants:

```
node scripts/node-eval.mjs sentence --models Qwen3-0.6B-q4f16_1-MLC,Qwen3-1.7B-q4f16_1-MLC
node scripts/node-eval.mjs section --models Qwen3-4B-q4f16_1-MLC --variants json --only dead-sea
node scripts/node-eval.mjs sentence --models openrouter:deepseek/deepseek-chat-v3-0324   # a reference model; needs OPENROUTER_API_KEY
```

`--check` builds every case's input and prints it without calling a model. `node scripts/node-case.mjs "<article>" "<section>"` prints the numbered sentences of a cached section so a case can be authored against exactly what the model sees. A large reference model is the truth check for the cases themselves: if it fails a case, the case or the ask is wrong; if it passes where 1.7B fails, that is a capacity gap.
