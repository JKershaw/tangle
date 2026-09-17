# Progress

*A living log against [PLAN.md](PLAN.md). Newest entry first. The scoreboard holds the current numbers; the frontier table holds where each known issue stands.*

## Scoreboard

Micro-evals (`scripts/eval.mjs visits`): pass rate over the cases in `evals/visits.json`.

| date | commit | prompt · grammar | 0.6B | 1.7B | 4B | 8B |
|---|---|---|---|---|---|---|
| recorded outputs (the failures we collected, under the prompts of their day) | — | pocket-2 to pocket-9 | 7/24 across all models | | | |
| 2026-09-17 | 9f8bc21 | pocket-9 · per-action-6 | **8/24** | **12/24** | **11/24** | **20/24** |

Benchmark (`scripts/eval.mjs runs`): per seed, `resolved · facts/supported · cost`. Tangle versus flat.

| date | commit | model | mode | seed | resolved | facts stated | supported | facts read | cost |
|---|---|---|---|---|---|---|---|---|---|
| 2026-09-17 | 9f8bc21 (pocket-9) | 1.7B | tangle | dead-sea | **no** | 0/3 | 0/3 | **3/3** | 40 nodes, 169 calls, 87 lookups, 138k tokens, 566 s |

The rest of the matrix is running. That first row is the frozen root, priced: the graph read every fact the rubric asks for and delivered none of them, because the root never resolved.

## Frontier

| issue | fixture | micro-eval cases | benchmark delta | status |
|---|---|---|---|---|
| root frozen by honest blocks | — | (whole-run only) | pending first matrix | open, John's call on the revisit policy |
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
