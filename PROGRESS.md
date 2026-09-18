# Progress

*A living log against [PLAN.md](PLAN.md). Newest entry first. The scoreboard holds the current numbers; the frontier table holds where each known issue stands.*

## Scoreboard

Micro-evals (`scripts/eval.mjs visits`): pass rate over the cases in `evals/visits.json`.

| date | commit | prompt · grammar | 0.6B | 1.7B | 4B | 8B |
|---|---|---|---|---|---|---|
| recorded outputs (the failures we collected, under the prompts of their day) | — | pocket-2 to pocket-9 | 7/24 across all models | | | |
| 2026-09-17 | 9f8bc21 | pocket-9 · per-action-6 | **8/24** | **12/24** | **11/24** | **20/24** |

Benchmark (`scripts/eval.mjs runs`): per seed, `resolved · facts/supported · cost`. Tangle versus flat.

| date | commit | model | mode | resolved | facts | supported | read | tokens | seconds |
|---|---|---|---|---|---|---|---|---|---|
| 2026-09-17 | 79e918e (pocket-9) | 0.6B | flat | 3/7 | 0/23 | 0/23 | 9/23 | 13k | 69 |
| 2026-09-17 | 79e918e | 0.6B | tangle | 5/7 | 5/23 | 5/23 | 16/23 | 16k | 110 |
| 2026-09-17 | 79e918e | 1.7B | flat | 5/7 | **8/23** | 7/23 | 20/23 | 48k | 179 |
| 2026-09-17 | 79e918e | 1.7B | tangle | 1/7 | **2/23** | 2/23 | **23/23** | 962k | 2489 |
| 2026-09-17 | 79e918e | 4B | flat | 7/7 | 14/23 | 14/23 | 19/23 | 8k | 97 |
| 2026-09-17 | 79e918e | 4B | tangle | 7/7 | 14/23 | 14/23 | 19/23 | 8k | 115 |
| 2026-09-17 | 79e918e | 8B | flat | 7/7 | **19/23** | 19/23 | 23/23 | 30k | 334 |
| 2026-09-17 | 79e918e | 8B | tangle | 7/7 | 18/23 | 18/23 | 23/23 | 15k | 218 |

**Read as a verdict on that build, not on the approach.** Decomposition only fires at 1.7B; every other model resolves at the root, so those tangle rows are not a test of it. Where it does fire it costs twenty times the tokens to deliver a quarter of the facts, while reading more of the rubric than any other row — because the scheduler froze the root on six of seven seeds, and because a visit asked the model for five decisions at once. Full table and reading in [evals/results.md](evals/results.md). The plan turned on this result: see *The turn* in [PLAN.md](PLAN.md).

Node evals (`scripts/node-eval.mjs`): pass rate over the cases in `evals/node/<ask>.json`, by ask variant. Full rows in [evals/node/results.md](evals/node/results.md).

| date | commit | ask (cases) | variant | 0.6B | 1.7B | 4B | 8B | reference |
|---|---|---|---|---|---|---|---|---|
| 2026-09-18 | f571e0b | sentence (20) | json | 11 | 15 | 17 | 18 | — |
| 2026-09-18 | f571e0b | sentence (20) | **list** | 9 | **17** | 18 | 18 | — |
| 2026-09-18 | f571e0b | sentence (20) | strict | 9 | 17 | 18 | 19 | — |
| 2026-09-18 | f571e0b | sentence (20) | zero (none is option 0) | **13** | 17 | 17 | 18 | — |
| 2026-09-18 | f571e0b | sentence (20) | check (pick, then one yes/no) | 9 | 15 | 18 | **20** | — |
| 2026-09-18 | f571e0b | sentence (20) | yesno (one per sentence) | 0 | 15 | 15 | 15 | — |
| 2026-09-18 | f571e0b | section (15) | json | 8 | 14 | 14 | 14 | — |
| 2026-09-18 | f571e0b | section (15) | **list** | **12** | 14 | 14 | 14 | — |
| 2026-09-18 | f571e0b | missing (9) | **search** (name an article) | 7 | **9** | 9 | 9 | — |
| 2026-09-18 | f571e0b | missing (9) | fact (name the missing fact) | 5 | 4 | 5 | 5 | — |

**What the node evals say.** From 1.7B up, the model finds the answering sentence in every positive case with a plain numbered list, and every failure is a *none* case: shown sentences that do not answer, it picks one anyway (the same two Dead Sea cases defeat 4B and 8B too; a reference model is needed to say whether those cases are fair). 8B is perfect when a pick is followed by one yes-or-no on that sentence alone. 0.6B does best when *none* is an ordinary numbered option, and answers yes to every sentence in the one-per-sentence floor. Section picks are 14/15 from 1.7B up; naming an article to search is 9/9 from 1.7B up while naming "the missing fact" is not, so the walk asks for a search term. Every one of these calls is 0.2 to 4 seconds; the grammar compile cost that ate half a run under the old prompt is gone, because the schemas are tiny enums. The walk (`src/walk.js`) uses list / list / search.

## Frontier

| issue | fixture | micro-eval cases | benchmark delta | status |
|---|---|---|---|---|
| root frozen by honest blocks | — | simulation "A source is unavailable" | to measure on the new node | **closed 2026-09-18**: revisit once children are settled is the default (7cb40c1) |
| one answer found forty times | — | `no-self-repeat-1.7b` | pending first matrix | open, John's call on refusing repeats |
| does not resolve when the excerpts already answer | — | `resolve-when-supported-*` ×3, `synthesis-*` ×2 | — | 0.6B 0/5, 1.7B 0/5: it decomposes into a paraphrase of its own question instead. pocket-10 targets this |
| does not read a section by name | — | `section-by-name-*` ×4 | — | 0.6B 0/4, 1.7B 0/4; the harness's forced pick covers it in whole runs. pocket-10 adds a rule |
| cannot pick a section from an enum | — | `section-pick-*` ×3 | — | 0.6B 0/3, 1.7B 3/3 |
| half a run is grammar compiles | — | — | cost column | 1.7B dead-sea-5: 13 distinct grammars, 282 of 554 s. Fewer keys would trade grammar strictness for time; not yet tried |
| correct but unsupported findings | `unsupported finding` ×2 | `grounded-8b-dead-sea` | pending (supported-facts column) | flagged only |
| memory over evidence | `unsupported finding` | `memory-aral-0.6b` | pending (distractor column) | 0.6B still writes Aral |
| token-cap whitespace | `degenerate output` | `degenerate-whitespace-1.7b` | — | 0.6B reproduced it live (tabs to 1,247 tokens). Bounded in the grammar on the `pocket-10` branch (`per-action-7`), awaiting its eval |
| absent-words flag is noisy | — | — | — | open |
| map unreadable at 40 nodes | n/a | n/a | n/a | open, UI phase |

## Log

### 2026-09-18 · morning

- John's reading of the matrix: the "no" is about unreliable code and prompts, not the idea. Agreed. A node has never been shown to work on its own; whole-run scores on top of that measure noise.
- Revisit-on-settled is the default (7cb40c1). The blocked simulation scenario now ends with the root resolved; the strict rule survives as `revisitSettled: false` and a test.
- The turn (PLAN.md): one decision per model call, code sequences the visit, the model only selects from things code prepared. Harbour's prompt discipline borrowed for the method.
- Built `src/asks.js` (sentence / section / missing / question asks, six sentence variants down to yes-or-no per sentence), `evals/node/` (20 sentence, 15 section, 9 missing cases from the cached articles), `scripts/node-eval.mjs` (model × variant table, OpenRouter reference models), `__tangle.ask` on the page (f571e0b).
- Ran all three asks across the ladder (scoreboard above, 3106cb9). 1.7B: 17/20 sentence, 14/15 section, 9/9 search. No OpenRouter key on this machine, so the reference column is empty.
- Built the walk (`src/walk.js`, bc012dd): a live visit as a fixed sequence of asks, code deciding everything else. Seven scripted-driver tests. Live runs use it by default; `limits.walk: false` runs the old one-prompt visit. First live smoke run on 1.7B next, then the benchmark again.

### 2026-09-17 · night

- Phases 1 to 3 built and merged: `scripts/grade.js` (fourteen deterministic checks, pinned by `test/grade.test.js`), 24 micro-eval cases in `evals/visits.json` from the fixtures and the pocket-9 traces, page hooks (`newLive` with limits, `visit`, `pick`, Wikipedia record and replay with a no-network browser test), `scripts/lab.mjs` shared by both drivers, and `scripts/eval.mjs visits`.
- Wikipedia answers Node's bare fetch with HTTP 429; the rubric checker needed a User-Agent. The browser is unaffected.
- Rubrics checked against the live articles, and two candidate seeds changed on the evidence: Venice's subsidence section is one sentence with no cause in it, and "Venice sinking" searches to a song, so it is out; "sky blue" searches to the colour article, which has none of the physics, so that seed stays in as the search trap it is. Seven seeds in `evals/seeds.json`.
- First live micro-eval row, 0.6B on pocket-9: 8/24. Every section pick failed even with an enum grammar; the model never reads a section by name and never resolves when the excerpts already answer. The 1.7B, 4B and 8B suites are queued, then the benchmark matrix (four models, tangle and flat).
- 79 tests.
- 1.7B on pocket-9: 12/24. The shape is clear: with two excerpts that answer the question and no lookups left, 1.7B decomposes into a paraphrase of its own question every time (0/5 on resolve-when-supported and synthesis), and never asks for a section by name (0/4). It picks sections from an enum perfectly (3/3), which is why the forced pick works in whole runs. 0.6B cannot even do that (0/3).
- Grammar compiles are half of a whole run: 13 distinct grammars in 1.7B dead-sea-5, first sight of each costs 8 to 33 s, 282 of 554 s in total. Repeat sightings are fast, so the cache is per key, as designed; the key count is the cost.
- 0.6B reproduced the token-cap whitespace runaway live on the recorded context (tabs, 1,247 tokens). WebLLM's bundled XGrammar can bound whitespace between JSON elements but the engine never passes the option; the adapter now wraps the lazily created compiler to pass a bound of 8 (`per-action-7`, branch `pocket-10`, unit-tested; the live check is the micro-eval).
- 4B: 11/24, 8B: 20/24. Neither fails the way 1.7B does; they resolve. What they fail is citation: 4B and 8B both wrote the National Water Carrier into the finding and cited only the lead, which does not contain it, while the section that does sat uncited beside it. 8B cited `["2","3","2","2"]` once. So `finding_supported` now says whether the missing words are in an uncited excerpt (mis-cited) or in none (invented), and a new `finding_grounded` check scores against everything shown. Under that split, 4B and 8B are grounded and mis-citing; 0.6B is inventing.
- The matrix runner labelled its first record with the prompt version from the source tree (`pocket-10`, the branch) instead of the served page (`pocket-9`); fixed to read versions from the page and to name the commit that built `docs/index.html`. The 1.7B pocket-9 records will be corrected by hand.
- **First benchmark row, and it is the frozen root with a price tag.** 1.7B on the Dead Sea seed, tangle limits: 40 nodes, 566 s, 87 lookups — and the root unresolved, so 0 of 3 rubric facts stated, while all 3 were sitting in the run's own evidence. The graph did the work and could not hand it back. `factsRead` versus `factsPresent` is the column that shows it, and it is the argument for revisiting a parent whose children are settled rather than all resolved.
- Wikipedia replay is working in anger: 129 cache hits against 4 live fetches on that run.
- Branch `pocket-10` also carries two prompt rules aimed at the 1.7B pattern: resolve now if the excerpts already answer, never decompose a question the excerpts can answer; read a listed section when a lead does not answer. Both wait for the browser: the pocket-9 benchmark matrix runs first so the A/B has a control.

### 2026-09-17 · evening

- Agreed with John: measure before polishing. Wrote the plan: micro-evals on recorded visits, a benchmark with a flat baseline, Wikipedia record and replay.
- State inherited from the day: 63 tests, 20 experiments, prompt `tangle-pocket-9`, grammar `per-action-6`, all four models cached in the Chrome profile. 1.7B resolves a 40-node Dead Sea graph correctly; 8B finds the right section unaided and grounds its answer; 4B answers correctly from memory and cites a lead that does not contain the answer; 0.6B copies the prompt.
- Next: phase 1, graders and cases.
