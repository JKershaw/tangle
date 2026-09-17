# Progress

*A living log against [PLAN.md](PLAN.md). Newest entry first. The scoreboard holds the current numbers; the frontier table holds where each known issue stands.*

## Scoreboard

Micro-evals (`scripts/eval.mjs visits`): pass rate over the cases in `evals/visits.json`.

| date | commit | prompt · grammar | 0.6B | 1.7B | 4B | 8B |
|---|---|---|---|---|---|---|
| — | — | — | not yet run | | | |

Benchmark (`scripts/eval.mjs runs`): per seed, `resolved · facts/supported · cost`. Tangle versus flat.

| date | commit | model | mode | seeds resolved | facts | supported | calls | lookups |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | not yet run | | | | |

## Frontier

| issue | fixture | micro-eval case | benchmark delta | status |
|---|---|---|---|---|
| root frozen by honest blocks | — | — | — | open, John's call on the revisit policy |
| one answer found forty times | — | — | — | open, John's call on refusing repeats |
| correct but unsupported findings | `unsupported finding` ×2 | — | — | flagged only |
| memory over evidence | `unsupported finding` | — | — | flagged only |
| token-cap whitespace | `degenerate output` | — | — | documented, not prevented |
| absent-words flag is noisy | — | — | — | open |
| map unreadable at 40 nodes | n/a | n/a | n/a | open, UI phase |

## Log

### 2026-09-17 · evening

- Agreed with John: measure before polishing. Wrote the plan: micro-evals on recorded visits, a benchmark with a flat baseline, Wikipedia record and replay.
- State inherited from the day: 63 tests, 20 experiments, prompt `tangle-pocket-9`, grammar `per-action-6`, all four models cached in the Chrome profile. 1.7B resolves a 40-node Dead Sea graph correctly; 8B finds the right section unaided and grounds its answer; 4B answers correctly from memory and cites a lead that does not contain the answer; 0.6B copies the prompt.
- Next: phase 1, graders and cases.
