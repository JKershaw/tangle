# Tangle

Read [PROCESS.md](PROCESS.md) first: it says how a session goes and which loop to use for which question. Then README's frontier, the top of PROGRESS.md, the current milestone in ROADMAP.md and the latest entry in evals/readings.md.

Standing rules: the harness owns the graph and the model only selects from what code prepares; findings are not evidence; record strange behaviour in evals/readings.md before fixing it; do not use model reruns to find bugs in code, classify and test them; keep Tangle tiny and the docs human-readable, with the frontier in README current; commit and push to main regularly; `docs/index.html` must equal a fresh build (CI checks) and is never rebuilt while a page suite is using it; the reference model (OpenRouter/DeepSeek) is a column, not a dependency.
