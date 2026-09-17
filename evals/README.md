# Evals

The model-in-the-loop layer described in [PLAN.md](../PLAN.md). Results land in [PROGRESS.md](../PROGRESS.md).

- `visits.json` — micro-eval cases: one recorded situation each (the exact context a node saw in a real run, or a section-pick request), the output the model gave at the time, and the named checks a good answer passes. `test/evals.test.js` keeps the file well formed and grades the recorded outputs.
- `scripts/eval-case.mjs` — adds a case from an experiment export (`--export … --seq …`) or from a test fixture (`--fixture …`).
- `scripts/grade.js` — the checks, all deterministic. `test/grade.test.js` pins each one with recorded outputs.
- `scripts/eval.mjs` — runs a suite against a loaded model in the built page and writes results here under `results/`.

To add a case after a run shows something new: find the `model_input` (or `section_chosen`) event's `seq` in the export, add it with a class name and the checks that describe the right behaviour, and let the recorded output stand as what the model did then.
