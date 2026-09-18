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
| 2026-09-18 | ee83f51 (walk-1) | 1.7B | flat | 2/7 | 2/23 | 2/23 | 18/23 | 21k | 49 |
| 2026-09-18 | ee83f51 (walk-1) | 1.7B | tangle | 6/7 | **7/23** | **7/23** | 20/23 | 261k | 515 |
| 2026-09-18 | ce5474e (walk-3) | 1.7B | tangle | 6/7 | **8/23** | **8/23** | 20/23 | 101k | 202 |
| 2026-09-18 | 42c937e (walk-4) | 0.6B | tangle | 0/7 | 0/23 | 0/23 | 0/23 | 3k | 60 |
| 2026-09-18 | 42c937e (walk-4) | 1.7B | tangle | **7/7** | **9/23** | **9/23** | 20/23 | 62k | 145 |
| 2026-09-18 | 42c937e (walk-4) | 4B | tangle | 7/7 | 14/23 | 14/23 | 19/23 | 9k | 64 |
| 2026-09-18 | 42c937e (walk-4) | 8B | tangle | 6/7 | 14/23 | 14/23 | 18/23 | 30k | 150 |
| 2026-09-18 | 5887c5d (walk-5) | 0.6B | tangle | 5/7 | 2/23 | 2/23 | 16/23 | 18k | 41 |
| 2026-09-18 | 5887c5d (walk-5) | 1.7B | tangle | 7/7 | 9/23 | 9/23 | 17/23 | 11k | **35** |
| 2026-09-18 | 5887c5d (walk-5) | 4B | tangle | 7/7 | **16/23** | **16/23** | 19/23 | 12k | 67 |
| 2026-09-18 | 5887c5d (walk-5) | 8B | tangle | 7/7 | 12/23 | 12/23 | 16/23 | 17k | 145 |
| 2026-09-18 | 7279d41 (walk-6) | 0.6B | tangle | 5/7 | 2/23 | 2/23 | 16/23 | 20k | 41 |
| 2026-09-18 | 7279d41 (walk-6) | 1.7B | tangle | 7/7 | 9/23 | 9/23 | 20/23 | 21k | 56 |
| 2026-09-18 | 7279d41 (walk-6, check) | 4B | tangle | 7/7 | 14/23 | 14/23 | 19/23 | 12k | 62 |
| 2026-09-18 | 7279d41 (walk-6, check) | 8B | tangle | **7/7** | **16/23** | **16/23** | 21/23 | 14k | 104 |
| 2026-09-18 | dca1958 (walk-6, plain pick) | 4B | tangle | **7/7** | **16/23** | **16/23** | 19/23 | 13k | 65 |
| 2026-09-18 | dca1958 (walk-6) ×3 identical | 1.7B | tangle | 7/7 | 9/23 | 9/23 | 20/23 | 21k | 47–53 |
| 2026-09-18 | dca1958 (walk-6) ×3 identical | 1.7B | flat (walk, one node) | 7/7 | 11/23 | 11/23 | 20/23 | 15k | 38 |
| 2026-09-18 | dca1958 (pocket-10 prompt) ×3 identical | 1.7B | composing (one node) | 7/7 | **16/23** | **16/23** | 21/23 | 48k | 107–180 |
| 2026-09-18 | dca1958 (walk-6) ×3 identical | 4B | tangle | 7/7 | **16/23** | **16/23** | 19/23 | 13k | 65 |
| 2026-09-18 | dca1958 (walk-6) ×3 identical | 4B | flat (walk, one node) | 7/7 | **16/23** | **16/23** | 19/23 | 13k | 65 |
| 2026-09-18 | dca1958 (pocket-10 prompt) ×3 identical | 4B | composing (one node) | 7/7 | 13/23 | 13/23 | 19/23 | 8k | 65–100 |
| 2026-09-18 | dca1958 (pocket-10 prompt) | 8B | composing (one node) | 7/7 | **18/23** | **18/23** | 23/23 | 37k | 480 |

**The benchmark is deterministic** (temperature 0.2, fixed seed, Wikipedia replayed): three passes of nine rows did not differ by a fact, so a one-fact gap is one seed's gap and only more seeds widen a claim. **The right single-node control is pocket-10's composing prompt**, never benchmarked until 2026-09-18: 16/23 at 1.7B (the walk: 9) and 13/23 at 4B (the walk: 16). Reading in [evals/readings.md](evals/readings.md).

**Read the 2026-09-17 rows as a verdict on that build, not on the approach.** Decomposition only fires at 1.7B; every other model resolves at the root, so those tangle rows are not a test of it. Where it does fire it costs twenty times the tokens to deliver a quarter of the facts, while reading more of the rubric than any other row — because the scheduler froze the root on six of seven seeds, and because a visit asked the model for five decisions at once. Full table and reading in [evals/results.md](evals/results.md). The plan turned on this result: see *The turn* in [PLAN.md](PLAN.md).

Graph seeds (`evals/seeds-graph.json`, 10 seeds no single article answers, 30 facts; `--seeds evals/seeds-graph.json`):

| date | commit | model | tangle | flat (walk, one node) | composing (one node) |
|---|---|---|---|---|---|
| 2026-09-18 | dca1958 (walk-6) | 1.7B | 12/30 (12 supported) | 12/30 (12) | 12/30 (11) |
| 2026-09-18 | dca1958 (walk-6) | 4B | 10/30 (10) | 10/30 (10) | 14/30 (9) |
| 2026-09-18 | dca1958 (walk-6) | 8B | 12/30 (12) | 11/30 (11) | **17/30** (16) |

Every size reads one article and resolves with half an answer; the graph never splits the question, and where it adds children they drift. Reading in [evals/readings.md](evals/readings.md). walk-7 (5c51800) splits two-subject questions in code and reads on after a first answer; rerunning.

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
| 2026-09-18 | 3106cb9 | sentence (23, + Aral traps) | list | 11 | 18 | 20 | 19 | — |
| 2026-09-18 | 3106cb9 | sentence (23) | titled (article labelled) | 6 | 18 | 19 | 19 | — |
| 2026-09-18 | 3106cb9 | sentence (23) | **check** | 11 | 17 | 21 | **23** | — |
| 2026-09-18 | ce5474e | question (6, paraphrases fail) | one | 1 | 3 | 4 | 3 | — |
| 2026-09-18 | ce5474e | question (6) | part | 2 | 4 | 0 | 0 | — |
| 2026-09-18 | ce5474e | question (6) | first | 2 | 3 | 2 | 5 | — |
| 2026-09-18 | 42c937e | article (12, from real searches) | list (titles) | 3 | 10 | 9 | 10 | — |
| 2026-09-18 | 7279d41 | article (12) | **snippets** (title + search snippet) | 3 | 9 | 9 | **12** | — |

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

### 2026-09-18 · afternoon

- Graph seeds at three sizes and three modes: the walk is 10–12/30 at every size, level with its own one-node control, because every size reads one article and resolves with half an answer; the composing node reaches 17/30 at 8B but starts stating facts its evidence does not hold (4B: 14 stated, 9 supported). 8B composing on the base seeds: 18/23.
- walk-7 (5c51800): a question naming two subjects joined by and/or is split by code before anything is read, one child per subject; the parent's answer is their findings. After a first pick, while the finding has room and lookups remain, the node reads one more section and asks again. Both seed sets rerunning at 1.7B, 4B and 8B, tangle and flat.

### 2026-09-18 · midday

- Three repeats of walk, one-node walk and the composing one-node control at 1.7B and 4B: every pass identical, so the benchmark is deterministic given the recording and repeats measure nothing; variance lives across seeds. The pocket-10 composing control, never run before, scores 16/23 at 1.7B — seven above the walk — and 13/23 at 4B, three below it. At 1.7B the one-node walk (11) beats the graph (9): the sky seed's section pick and question ask led two children into photosynthesis and the root gathered them. `scripts/eval.mjs` gained `--mode composing`, `--repeat N` and `--seeds <path>` (d786061).
- `evals/seeds-graph.json`: ten seeds no single article answers (two-lake and two-collapse comparisons, a two-hop river question, section-only answers, one control), facts checked against live Wikipedia sections. Running at 1.7B, 4B and 8B in all three modes.

### 2026-09-18 · morning, continued

- First live walk on 1.7B answered "Why is the Dead Sea shrinking?" with the wrong lake: Wikipedia's search ranked the Aral Sea first for the raw question, and the pick took the sentence that explains a shrinking sea. Labelling sentences with their article did not help at any size; a yes-or-no on the picked sentence alone does (8B 23/23). The first search term is now the question minus its question words (a63c8e4, ee83f51).
- Second live walk: the National Water Carrier sentence, five calls, five seconds (experiments/2026-09-18-qwen3-1.7b-dead-sea-walk-2).
- The walk's first benchmark on 1.7B: tangle 7/23 facts, all supported, against 2/23 for its flat control and 8/23 (7 supported) for the old composing flat prompt. Reading in [evals/readings.md](evals/readings.md). Three seeds lost to drift (child questions about "the text"), junk gathered upward, and one-sentence findings.
- The question ask mostly rephrases its parent at every size; a paraphrase that keeps every content word is now refused by code (walk-2), and questions about the text (walk-3). Findings gather up to three checked sentences.
- walk-6 ladder: with the search snippets every size above 0.6B reads the right sky article; the check lifts 8B to **16/23, every seed resolved, all supported, 104 s**, and costs 4B two facts (16 → 14), so it now applies at 8B only (dca1958). 1.7B 9/23; 0.6B 2/23. Against the fair control (the old composing flat prompt): 1.7B 9 vs 8 (7 supported); 4B 16 vs 14; 8B 16 vs 19. 4B rerun with the plain pick: 16/23 again, so the size rule holds. What 1.7B still misses: the Dead Sea lead's "receding at a swift rate" taken as *why*; the sky article read but its lead not answering and the section pick choosing the wrong heading; three-part answers needing three reads.
- walk-5 ladder: 1.7B 9/23 again but in **35 s** (one node per seed; Aral and coral now 3/3); 4B **16/23**, above any earlier 4B row; 8B 12/23 and 0.6B 2/23. Two failures with names: from titles alone every size picks "Sky blue" (the colour) over "Diffuse sky radiation", and without the check 1.7B and 8B take the Dead Sea lead's "receding at a swift rate" as the answer to *why*. walk-6 (7279d41): the search snippet after each title, and the pick-then-check ask from 4B up (no false negatives at 8B, few at 4B), the plain pick with a foreign-source confirmation below. Ladder rerunning.
- walk-4 ladder: 1.7B **9/23, every seed resolved, all supported, 145 s** — the first row where the tangle beats the fair control (the old composing flat prompt, 8/23 with 7 supported at 179 s). 4B 14/23 (level with its old rows at two-thirds the time). 8B 14/23, below its old 18–19: one-sentence findings cap what a big model can state, and the sky seed drifted from the wrong "Sky blue" article into a painter's biography until the question ask overflowed the context window. 0.6B 0/23: it answers "none" to every article pick, so it read nothing. walk-5 (5887c5d) searches both terms and picks the article from the union, honours "none" only when every title is foreign to the question, confirms a pick only when its source is foreign, and caps what the naming asks see. Ladder rerunning.
- walk-3 on 1.7B: **8/23, all supported, 202 s** — level with the old composing flat prompt's count with every fact grounded, at a similar cost. Aral runaway gone (6 nodes). Water cycle blocked (same windows re-shown across visits, the check refusing the true sentence); sky-blue and Aral read the wrong first hit for visits. walk-4 (42c937e): the article is picked from the five hits, judged sentences are remembered, six passes. Running.
- Also learned: Chrome's persistent profile served a two-builds-old page from its HTTP cache. The driver now busts the cache and records the page's own versions.

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
