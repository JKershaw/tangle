# Evals

The model-in-the-loop layer described in [PLAN.md](../PLAN.md). Results land in [PROGRESS.md](../PROGRESS.md).

- `scripts/grade.js` — the whole-run graders (facts present, supported and read; the shape of a profile), all deterministic. `test/grade.test.js` pins them with recorded runs.
- `scripts/eval.mjs` — runs a suite against a loaded model in the built page or in Node and writes results here under `results/`; rows land in `results.md`, and what each round meant is written up in `readings.md`.
- `wiki-cache/` — the Wikipedia recording, one file per response, replayed in both runtimes and added to as runs need more.
- `model-cache/<model>/` — the model's responses recorded by their exact context (`src/replay.js`), one file per call, in the same format. A rerun of unchanged code replays every call (`--replay-only` insists on it and is what CI runs); after a change, the misses are the calls the change touched.

## Node evals

The one-prompt visit (one call, five decisions) and its micro-eval suite retired on 2026-09-19 (REVIEW.md); its rows stay in results.md. The node evals measure the asks the walk makes (`src/walk.js`, `src/asks.js`): one decision per call, so each ask can be tried in several *variants* and the simplest one a small model passes can be kept.

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
