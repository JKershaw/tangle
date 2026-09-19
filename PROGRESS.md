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
| 2026-09-18 | 5c51800 (walk-7) | 1.7B | tangle | 7/7 | 10/23 | 10/23 | 20/23 | 25k | 62 |
| 2026-09-18 | 5c51800 (walk-7) | 1.7B | flat (walk, one node) | 7/7 | 12/23 | 12/23 | 20/23 | 18k | 44 |
| 2026-09-18 | 5c51800 (walk-7) | 4B | tangle | 7/7 | **17/23** | **17/23** | 20/23 | 15k | 71 |
| 2026-09-18 | 5c51800 (walk-7) | 4B | flat (walk, one node) | 7/7 | **17/23** | **17/23** | 20/23 | 16k | 74 |
| 2026-09-18 | 5c51800 (walk-7) | 8B | tangle | 7/7 | 16/23 | 16/23 | 21/23 | 18k | 125 |
| 2026-09-18 | 5c51800 (walk-7) | 8B | flat (walk, one node) | 7/7 | **17/23** | **17/23** | 22/23 | 32k | 200 |

**The benchmark is deterministic** (temperature 0.2, fixed seed, Wikipedia replayed): three passes of nine rows did not differ by a fact, so a one-fact gap is one seed's gap and only more seeds widen a claim. **The right single-node control is pocket-10's composing prompt**, never benchmarked until 2026-09-18: 16/23 at 1.7B (the walk: 9) and 13/23 at 4B (the walk: 16). Reading in [evals/readings.md](evals/readings.md).

**Read the 2026-09-17 rows as a verdict on that build, not on the approach.** Decomposition only fires at 1.7B; every other model resolves at the root, so those tangle rows are not a test of it. Where it does fire it costs twenty times the tokens to deliver a quarter of the facts, while reading more of the rubric than any other row — because the scheduler froze the root on six of seven seeds, and because a visit asked the model for five decisions at once. Full table and reading in [evals/results.md](evals/results.md). The plan turned on this result: see *The turn* in [PLAN.md](PLAN.md).

Closed book (`--mode closed`: the model alone, no tools, facts named, none supported by construction):

| date | commit | seeds | 0.6B | 1.7B | 4B | 8B |
|---|---|---|---|---|---|---|
| 2026-09-18 | 5c51800 | base (23) | 8 | 14 | **19** | **20** |
| 2026-09-18 | 5c51800 | graph (30) | 8 | 9 | **21** | **18** |

From 4B up, memory names more rubric facts than any reading mode on both seed sets; the walk beats memory only at 1.7B on the graph seeds (16 against 9). The seeds test what the model has memorised, not what reading adds; the next seed set is to be filtered by this column. Reading in [evals/readings.md](evals/readings.md).

Graph seeds (`evals/seeds-graph.json`, 10 seeds no single article answers, 30 facts; `--seeds evals/seeds-graph.json`):

| date | commit | model | tangle | flat (walk, one node) | composing (one node) |
|---|---|---|---|---|---|
| 2026-09-18 | dca1958 (walk-6) | 1.7B | 12/30 (12 supported) | 12/30 (12) | 12/30 (11) |
| 2026-09-18 | dca1958 (walk-6) | 4B | 10/30 (10) | 10/30 (10) | 14/30 (9) |
| 2026-09-18 | dca1958 (walk-6) | 8B | 12/30 (12) | 11/30 (11) | **17/30** (16) |
| 2026-09-18 | 5c51800 (walk-7) | 1.7B | **16/30** (16) · 102 s | 12/30 (12) | — |
| 2026-09-18 | 5c51800 (walk-7) | 4B | **15/30** (15) · 143 s | 12/30 (12) | — |
| 2026-09-18 | 5c51800 (walk-7) | 8B | 14/30 (14) · 828 s | 12/30 (12) | — |

At walk-6 every size read one article and resolved with half an answer. walk-7 (5c51800) splits a two-subject question in code, one child per subject, and reads on after a first answer: on the three comparison seeds the graph states 5, 6 and 6 facts against 1, 2 and 3 for one node, and leads its one-node control at every size on this set. The model-asked children are still the cost (8B: 828 s). Reading in [evals/readings.md](evals/readings.md).

Profiles (`evals/seeds-profile.json`, four briefs, 35 topics; `--seeds evals/seeds-profile.json`). Topics touched of 35, then hops cited / read / chosen and paragraphs summed over the four profiles. Every tangle and flat topic is supported; nothing in the closed column is.

| date | commit | model | tangle | flat (walk, one node) | closed (memory) |
|---|---|---|---|---|---|
| 2026-09-18 | ae3b04a (walk-10) | 0.6B | 0/35 · 3 of 4 roots blocked | — | 7/35 |
| 2026-09-18 | ae3b04a (walk-10) | 1.7B | **21/35** · hops 5/12/24 · ¶28 · 286 s | 8/35 · ¶4 | 15/35 |
| 2026-09-18 | ae3b04a (walk-10) | 4B | **17/35** · hops 4/8/14 · ¶19 · 227 s | 8/35 · ¶4 | 10/35 |
| 2026-09-18 | ae3b04a (walk-10) | 8B | **22/35** · hops 8/15/19 · ¶24 · 480 s | 8/35 · ¶4 | 20/35 |
| 2026-09-18 | bc2e15a (walk-11, hop children from links) | 1.7B | 22/35 · hops 5/12/12 · ¶36 · 175 s | 10/35 | — |
| 2026-09-18 | bc2e15a (walk-11) | 4B | 17/35 · hops 5/18/19 · ¶23 · 132 s | 9/35 | — |
| 2026-09-18 | bc2e15a (walk-11) | 8B | 20/35 · hops 17/42/42 · ¶44 · 410 s | 9/35 | — |
| 2026-09-18 | 71ee567 (walk-11, hops read the part about the subject; root keeps 6) | 1.7B | **26/35** · hops 14/17/17 · ¶42 · 45 nodes · 119 s | 15/35 · ¶4 | — |
| 2026-09-18 | 71ee567 (walk-11) | 4B | **22/35** · hops 13/23/24 · ¶31 · 44 nodes · 194 s | 16/35 · ¶4 | — |
| 2026-09-18 | 71ee567 (walk-11) | 8B | **26/35** · hops 22/41/42 · ¶49 · 70 nodes · 464 s | 13/35 · ¶4 | — |
| 2026-09-18 | 14ddbc1 (walk-12, hops hand down hops; names checked against the subject) | 1.7B | 25/35 · hops 25/25/25 · ¶45 · 53 nodes · 162 s | — | — |
| 2026-09-18 | 14ddbc1 (walk-12) | 4B | 22/35 · hops 24/37/37 · ¶39 · 57 nodes · 252 s | — | — |
| 2026-09-18 | 14ddbc1 (walk-12) | 8B | 24/35 · hops 46/61/61 · ¶53 · 89 nodes · 638 s · three sections lost to the 6,000-char cap | — | — |
| 2026-09-18 | 0f58764 (walk-12, hop paragraphs go first at the cap; short sections skipped) | 1.7B | **26/35** · hops 35/36/36 · ¶61 · 64 nodes · 168 s | 15/35 (71ee567) | 15/35 |
| 2026-09-18 | 0f58764 (walk-12) | 4B | **23/35** · hops 34/51/51 · ¶50 · 73 nodes · 321 s | 16/35 (71ee567) | 10/35 |
| 2026-09-18 | 0f58764 (walk-12) | 8B | **27/35** · hops 47/66/66 · ¶62 · 94 nodes · 635 s | 13/35 (71ee567) | 20/35 |
| 2026-09-18 | 27f36a8 (walk-12, Node · Ollama q4_K_M) | 8B | 25/35 · hops 43/62/62 · ¶69 · 317 s | — | — |
| 2026-09-18 | 27f36a8 (walk-12, Node · Ollama q4_K_M) | 14B | 27/35 · hops 41/53/54 · ¶67 · 535 s | — | — |
| 2026-09-18 | 3cecdec (walk-12, Node · Ollama q4_K_M) | 32B | **30/35** · hops 45/56/56 · ¶69 · 1213 s | — | — |

Overflow briefs (`evals/seeds-overflow.json`: the Antikythera mechanism and how it was decoded, the Rosetta mission and what it found, the Aral Sea and its restoration; 30 topics spread over many sections and linked articles, on subjects the models know less well). Topics of 30.

| date | commit | model | tangle | flat (walk, one node) | closed (memory) |
|---|---|---|---|---|---|
| 2026-09-18 | 0f58764 (walk-12) | 0.6B | — | — | 2/30 |
| 2026-09-18 | 0f58764 (walk-12) | 1.7B | **24/30** · hops 20/20/20 · ¶41 · 41 nodes · 138 s | 18/30 | 5/30 |
| 2026-09-18 | 0f58764 (walk-12) | 4B | **25/30** · hops 16/25/25 · ¶34 · 44 nodes · 228 s | 18/30 | 12/30 |
| 2026-09-18 | 0f58764 (walk-12) | 8B | **27/30** · hops 18/27/27 · ¶37 · 48 nodes · 372 s | 16/30 | 17/30 |
| 2026-09-18 | 27f36a8 (walk-12, Node · Ollama q4_K_M) | 8B | 24/30 · hops 17/25/25 · ¶35 · 147 s | — | — |
| 2026-09-18 | 27f36a8 (walk-12, Node · Ollama q4_K_M) | 14B | 24/30 · hops 17/24/24 · ¶38 · 291 s | — | — |
| 2026-09-18 | 3cecdec (walk-12, Node · Ollama q4_K_M) | 32B | 26/30 · hops 17/22/22 · ¶37 · 717 s | — | — |
| 2026-09-18 | 495d69d (walk-13, hops name the subject by its capitalised words) | 1.7B | 24/30 · hops 21/21/21 · ¶42 · 106 s · the Juno and "rosetta orbit" paragraphs gone | — | — |
| 2026-09-18 | 495d69d (walk-13, Node · Ollama) | 1.7B | 24/30 · hops 8/8/8 · ¶28 · 37 s | — | — |

The graph beats both controls at every size on both brief sets, and on the overflow briefs the gap to memory is 19 topics at 1.7B. Reading in [evals/readings.md](evals/readings.md).

walk-12 at 0f58764: with hop paragraphs going before sections at the cap (now 8,000) and short headings skipped, the profile ladder is 27 / 23 / 26 at 8B / 4B / 1.7B, above every earlier row at every size. walk-12 (14ddbc1): a hop child hands down hops of its own, with a reserve for every open node, and a name is offered only if code finds its article says something about the subject: every hop chosen at 1.7B is now cited (25 of 25), and the 8B profiles reach 25 nodes and 19 articles — but topics fell (26 → 24) because the 6,000-character cap dropped the last three sections of the Turing profile, conviction and apology among them, in favour of hops under the first three. Fixed at 0f58764 (hop paragraphs go before sections; cap 8,000; short headings not handed down); rerunning. walk-11 (71ee567): a brief's child hands the things its kept sentences name — the article's links that occur in them — to children of its own, each reading the part of its article that names the brief's subject. Topics 26 / 22 / 26 against walk-10's 22 / 17 / 21, from two to three times the paragraphs and eleven articles per profile at 8B; the one-node control rises to 13–16 because a brief's root now keeps six lead sentences. Node counts 44–70 over four briefs (the budget is 40 each). The first table where the graph beats both the one-node control and memory at every size from 1.7B up was walk-10's, below. The Hubble brief scored 1 and 2 of 8 at every size because the search for the whole brief never returned the telescope's article and 8B read *Edwin Hubble* instead; fixed in code at 120c0fc (a brief searches for its subject, and a hit whose title is the search term is read without asking). Reading in [evals/readings.md](evals/readings.md).

The bridge (ROADMAP milestone 4): the same walk in Node against an OpenAI-compatible server, `scripts/eval.mjs runs --endpoint <url>`. Base seeds (23 facts), tangle unless marked. The weights are the same Qwen3 family at a different quantisation (Ollama GGUF q4_K_M, LM Studio MLX 4-bit), so each row is its own column, not a rerun of the page's; the page's own rows at walk-12 (27f36a8) are 10 / 17 / 14 at 1.7B / 4B / 8B (walk-7: 10 / 17 / 16; 8B's sky-blue chained seven nodes from the colour article to nothing), and its memory rows 14 / 19 / 20.

| date | commit | server | model | tangle (facts) | calls · lookups · seconds | memory (closed) |
|---|---|---|---|---|---|---|
| 2026-09-18 | b71a368 (walk-12) | Ollama | 1.7B | 15/23 | 43 · 15 · **12** | — |
| 2026-09-18 | b71a368 | Ollama | 4B | 12/23 | 69 · 22 · 75 | — |
| 2026-09-18 | b71a368 | Ollama | 8B | 12/23 | 61 · 16 · 96 | 18/23 |
| 2026-09-18 | b71a368 | Ollama | 14B | 16/23 | 96 · 28 · 372 | **21/23** |
| 2026-09-19 | walk-14 (uncommitted at 3b3daac) | Ollama | 1.7B / 4B / 8B / 14B | 15 / 12 / 12 / 16 of 23, identical to walk-12; page 1.7B 10/23 | 1.7B 38 · 13 · 11 (five calls fewer); 4B, 8B, 14B the same calls | — |
| 2026-09-18 | 27f36a8 | Ollama | 32B | **17/23** | 73 · 18 · 358 | 19/23 |
| 2026-09-18 | b71a368 | LM Studio (MLX) | 4B | 16/23 · Dead Sea lost to a schema error, fixed at 27f36a8; rerun 16/23 with the Dead Sea resolved at 0 | 52 · 13 · 104 | — |
| 2026-09-18 | 4ea1f89 | LM Studio (MLX) | 30B-A3B (2507) | 16/23 · the same error; rerun at 495d69d: **17/23** in 313 s | 50 · 15 · 239 | — |

On the briefs the ladder does move: profiles 25 / 27 / **30** of 35 and overflow 24 / 24 / 26 of 30 at 8B / 14B / 32B in Node (rows in the profile and overflow tables above; the page's 8B: 27 and 27). 32B's four profiles are the best row on that set, in twenty minutes.

Parity (`test/parity.test.js`): the same three seeds, recording and scripted picks give the identical graph in the page and in Node (1, 3 and 28 nodes). The node evals through Ollama are level with or above the page per ask (sentence list 19 / 21 / 22 of 23 at 1.7B / 4B / 8B, check 20 / 19 / 23, article snippets 10 / 11 / 12, section list 15 / 14 / 14; rows in [evals/node/results.md](evals/node/results.md)). Reading in [evals/readings.md](evals/readings.md).

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

## The tool control (milestone 5b, 2026-09-19)

The same model with the four source requests as tools in one context, each seed budgeted to the graph's calls and tokens on it (`scripts/eval.mjs runs --mode tools|tools-cited --match <tangle json>`, tools-3, a811bbd). Reading in [evals/readings.md](evals/readings.md).

| suite | size | the graph (walk-15) | tool control, composing | tool control, cited | memory |
|---|---|---|---|---|---|
| questions, 23 facts | 1.7B | **15** · 38 calls · 16k · 1.0k/fact | 14 (0 supported) · 29 · 18k · 1.3k | 0 | 14 |
| | 4B | 12 · 69 · 24k · 2.0k | **18** (0 supported) · 24 · 29k · 1.6k | 0 | 19 |
| | 8B | 12 · 61 · 19k · 1.6k | **17** (15 supported) · 23 · 18k · 1.1k | 1 | 20 |
| profiles, 35 topics | 1.7B | **25** · 197 · 71k · 2.8k | 13 · 34 · 49k · 3.8k | 11 | 15 |
| | 4B | **24** · 241 · 76k · 3.2k | 11 · 28 · 64k · 5.8k | 1 | 10 |
| | 8B | **24** · 266 · 85k · 3.5k | 20 · 19 · 25k · 1.3k | 8 | 20 |
| | 14B | **27** · 265 · 87k · 3.2k | 20 (18 supported) · 15 · 16k · 0.8k | 16 | 21 (walk-12 day) |
| | DeepSeek V3.2 (API) | **27** · 249 · 115k · 4.2k | 21 · 45 · 106k · 5.0k | 0 | — |
| | Haiku 4.5 (API) | **23** · 271 · 139k · 6.0k | 15 · 19 · 46k · 3.0k | 12 | — |
| overflow, 30 topics | 1.7B | **24** · 117 · 44k · 1.8k | 11 · 25 · 39k · 3.5k | 0 | 5 |
| | 4B | **23** · 135 · 50k · 2.2k | 11 · 17 · 35k · 3.2k | 0 | 12 |
| | 8B | **24** · 141 · 51k · 2.1k | 21 · 15 · 18k · 0.9k | 6 | 17 |
| MangoDB, 42 topics | 1.7B | **14** · 122 · 40k · 2.9k | 6 · 30 · 37k · 6.1k | 0 | 9 |
| | 4B | **11** · 164 · 47k · 4.3k | 11 (6 supported) · 24 · 43k · 4.0k | 0 | 8 |
| | 8B | 12 · 167 · 53k · 4.4k | **15** (14 supported) · 16 · 15k · 1.0k | 0 | 9 |
| | 14B | **18** · 201 · 62k · 3.5k | 15 · 26 · 32k · 2.1k | 3 | — |
| | DeepSeek V3.2 (API) | **13** · 137 · 67k · 5.2k | 8 (7 supported) · 35 · 76k · 9.4k | 0 | — |
| | Haiku 4.5 (API) | **25** · 239 · 128k · 5.1k | 20 · 20 · 48k · 2.4k | 0 | — |

Each cell: topics (or facts) present · model calls · tokens · tokens per topic. The graph's topics are all supported by construction; the tool control's "supported" means the fact was named and something read held it. Memory is the closed-book column (page rows for Wikipedia, Node for MangoDB). Budget: each seed's calls and tokens are the graph's spend on that seed; the tool control may stop early, and at 8B it does.

## Files as a source (milestone 5, begun 2026-09-19)

Four briefs over MangoDB's `src/` (`evals/seeds-code.json`, 42 topics), the walk unchanged, `src/files.js` as the source, Node through Ollama. Reading in [evals/readings.md](evals/readings.md).

| date | commit | model | tangle | read anywhere | one node | memory | nodes · calls · tokens · seconds |
|---|---|---|---|---|---|---|---|
| 2026-09-19 | e02f312 (first run, docs in the corpus, no summaries) | 1.7B | 16/42 | 27 | 9 | 9 | — |
| 2026-09-19 | fc81ce1 (walk-15: hops follow calls, declarations with summaries, src only) | 1.7B | **14/42** | 25 | 7 | 9 | 28 · 122 · 40k · 19 |
| 2026-09-19 | fc81ce1 | 4B | **11/42** | 24 | 2 | 8 | 45 · 164 · 47k · 66 |
| 2026-09-19 | fc81ce1 | 8B | **12/42** | 31 | 3 | 9 | 42 · 167 · 53k · 97 |

Memory writes a write-ahead log and replication into a database that has neither (persist 0 of 9 at every size). The graph reads most of the rubric at every size and keeps a third to a half: the sentence pick over lines of code is the frontier. Exit condition (a cited, correct profile of one module at 4B): not met.

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

### 2026-09-19 · the reference column, a day early

- The graph and the tool control on DeepSeek V3.2 and Claude Haiku 4.5 over OpenRouter (`--endpoint https://openrouter.ai/api/v1`, the key from the environment, 054ad09), profile and MangoDB suites, under a dollar. The graph wins on both models and both suites; Haiku through the graph is the best code row, 25 of 42, all cited; DeepSeek picks poorly (13 of 42, one-topic persist profile). Rows in the table above; reading in evals/readings.md.

### 2026-09-19 · milestone 5b · the tool control

- `scripts/tools.mjs` (59c9099 → a811bbd): the same model with search, read, section and about as tools in one context, budget-matched per seed to the graph's row, composing and cited. tools-1: at 1.7B every seed was answered on the first call with no tool used, and Ollama ignores `tool_choice`; tools-2 refuses an unread answer with the reason and charges the call; tools-3 cuts a search line handed back as a title and checks the budget against the next call's cost.
- The table above. At 1.7B and 4B the graph beats the tool control on every brief set about two to one and the tool control equals memory; at 8B the tool control closes to within three or four topics on Wikipedia briefs and beats the graph on MangoDB (15 against 12) at a third of the tokens per topic; at 14B the graph leads again (27 and 18 against 20 and 15) at three to four times the tokens per topic. The cited variant is near zero below 8B and 16 of 35 on profiles at 14B. The warm-graph row is not built: no node question repeats across the four MangoDB briefs at any size.

### 2026-09-19 · milestone 5a · the replay

- `src/replay.js`: every model call recorded by its exact context (model, messages, schema, token cap, sampling) and served back without the model when the context comes round again, in either runtime; the files are the Wikipedia recording's, under `evals/model-cache/<model>/`. `scripts/eval.mjs` and `run.mjs` record by default; each row says how many calls were replayed; `--replay-only` runs from the cache alone and fails on a miss. A new `checks` workflow runs the tests, the build parity and a replay of the base suite on every push.
- Verified at 1.7B: the base, profile, overflow and code suites replay 38, 197, 117 and 122 calls with zero misses in 0.5, 19, 7 and 0.6 seconds, rows identical to the live ones (15 / 23, 25 / 35, 24 / 30, 14 / 42). One word changed in the article ask missed exactly the five article calls and nothing else, and the row held. The cache is 474 files, 2.6 MB. Reading in evals/readings.md.
- Now the loop after a code change is the replay, not the model: a row that moves with zero misses is a fault in code, and the miss count is what a change touched.
- First architecture pause under the replay: a CPU profile of the replayed profile suite put 17.7 of its 19 seconds in `occurs`, every link of an article regex-tested against every kept sentence. A substring check before the regex took the four suites to under a second each, with the same calls and rows.

### 2026-09-19 · milestone 5, day one · files as a source

- `src/files.js` and `scripts/corpus.mjs` (e02f312): a directory as a corpus behind the wiki driver's four requests; MangoDB the first corpus; `--source <dir>` in Node; four briefs with topics checked against the code; a scripted walk over a fixture corpus in the tests.
- Eight reruns at 1.7B, each fixing one fault reading found, all code's: the article pick's none over file paths, hops refused by the subject test, a hop to `rename` from a comment, the corpus's name as the subject, a brief's root that would not fan out from a one-line header, a barrel file chosen by name, sections chosen by name alone. Two prompt experiments lost and the asks are unchanged. Then, at John's asking, the loop changed: classes of fault, tests first (two fixture files, six failing parser tests), the parser rebuilt (fc81ce1). Table above; reading in evals/readings.md.
- Wikipedia unchanged at walk-15 in Node at 1.7B: 15 of 23, profiles 25 of 35, overflow 24 of 30.

### 2026-09-19 · morning · walk-14, the observer's second case

- The observer clarified their earlier point as a synthetic reproduction, and it reproduced on 3b3daac: a question's parent, shown its child's finding as "a finding below", says none, and the "nothing left to judge" fallback resolves it with that finding anyway. A scan of the recorded runs: 41 parents resolved that way, on about 16 of which the model had said none, and on most of the rest it was never asked, because a one-sentence finding sits in the run-wide kept set and was filtered out of the pool before the pick. Reading in [evals/readings.md](evals/readings.md).
- walk-14: a parent whose children are settled resolves with what they found by code, with no pick, for a question as for a split or a brief; a child's finding is no longer a sentence candidate. Three tests, one of them the observer's script with a model that throws if asked. The alternative, honouring the none so the parent blocks, is recorded and not taken: it leaves the root blocked on every recorded chain, and whether a narrower answer answers the parent is a judge's call.
- Base rows after the change: unchanged at every size (table above); 1.7B five calls fewer for the same findings.

### 2026-09-18 · night, later · the bridge

- An observer's reading of b0aa02a, verified: 1.7B's Rosetta profile carries a paragraph on Juno's measurements of Jupiter and a sentence about a "rosetta orbit", both cited, both off the brief; the on-subject test passed any sentence sharing one lower-case word with "Rosetta mission". walk-13 (namesSubject in text.js) requires one of the subject's capitalised words with its capitals. Also verified and fixed: the first search went to Wikipedia before approval. Recorded as open: the graph's token budget on the overflow briefs is 56k against 10k for one node at 1.7B, and a control with an equal budget does not exist yet; the topic rubric cannot penalise a cited paragraph that is off the brief, which is the judge's job.

- Milestone 4 built (4a36db9 → 27f36a8): `src/endpoint.js`, a second model adapter over an OpenAI-compatible endpoint behind the WebLLM adapter's surface; `wikiDriver` in wiki.js, the one Wikipedia driver both runtimes call; `scripts/recording.mjs`, the recording as a fetch; `scripts/node-lab.mjs` and `scripts/run.mjs`, the walk in Node with no browser; `eval.mjs --endpoint` and `node-eval.mjs --models endpoint:<id>`. The page is unchanged but for a scripted-model hook for the parity test.
- Parity: three seeds, one recording, one scripted model, the identical graph in both runtimes, down to the trace. The recording gained the 67 responses the scripted model reads.
- The ladder past the page (table above): Ollama at 1.7B–32B and LM Studio at 4B and 30B-A3B on the base seeds, with memory at 8B, 14B and 32B; the page rerun at walk-12 (10 / 17 / 14). Reading scores 15–17 from 1.7B to 32B while memory climbs to 21 at 14B: on memorised questions a bigger picker changes nothing, as LEARNED.md said. Node is fast: the 1.7B suite in 12 s, 32B's in six minutes.
- Faults found by the bridge, all code's: Ollama's OpenAI route needs `reasoning_effort: "none"` or Qwen3 thinks its token cap away; LM Studio refuses an enum with a repeated item (the Dead Sea's headings), now a set; lab.mjs lost an import in the refactor that no test covered, which cost one round of page reruns. Seen in 14B's traces and recorded, not fixed: a question child re-reads the article and section its parent read.

### 2026-09-18 · late night · the overflow briefs

- walk-12 at 0f58764 (table above): profiles 27 / 23 / 26 of 35 at 8B / 4B / 1.7B; 8B's Turing profile is 28 nodes and 22 articles in 17 paragraphs, all cited. Milestone 2 exited on its topic condition; the forty-node profile did not happen because the models choose fewer hops than the budget allows (most at 8B: 28), which is their call.
- The overflow briefs, four columns: tangle 27 / 25 / 24 of 30 against one node 16 / 18 / 18 and memory 17 / 12 / 5 (0.6B 2). Every size beats both controls; 1.7B reads its way to 24 topics it could name 5 of from memory. Milestone 3 exited. Not claimed: that a single node *cannot* hold the text — it reads three sentences of one article under its budget and stops, as it always has; the claim is that the graph reaches what one node does not.
- Seen and not yet fixed: 8B fills every hop slot and a third of its hops are found empty after the check (the model keeps nothing of what the article says); 1.7B says none more often and cites every hop it opens. 4B's Turing profile keeps losing the conviction and apology sections to its own section picks. The Aral Sea brief scores 10 of 10 at every size because its lead names nearly every topic.

### 2026-09-18 · night · the profile benchmark, and the frontier

- [ROADMAP.md](ROADMAP.md): the milestones from here to a self-building agent, each with an entry, the work, what verifies it and an exit; what a key buys and when. README gained a standing description of the frontier.
- Milestone 1: `gradeProfile` (paragraphs, sentences, articles and sections read, hops chosen / read / cited, duplicates) and four briefs with topic lists checked against live Wikipedia (Turing, the Silk Road, the Hubble Space Telescope, the Great Barrier Reef). The walk-10 profile ladder (table above): tangle 22, 17, 21 of 35 topics at 8B, 4B, 1.7B against 8 for one node and 20, 10, 15 for memory. Faults read from the rows: the Hubble search found Edwin Hubble (fixed in code); 4B's free-text hop names the subject; 0.6B keeps nothing under a brief and blocks.
- walk-12 (14ddbc1): hop children hand down one level of hops of their own; a reserve keeps room for every open node's hops; a name is offered only after code reads what its article says about the subject (trace `hop_checked`). 1.7B: every hop chosen is cited (25/25), 53 nodes over four briefs; 8B: 89 nodes, 65 articles, and a lower topic count (24) because the profile cap dropped the last sections. 0f58764: over the cap, hop paragraphs go before sections (cap 8,000); a heading under 600 characters is not offered to a child ("Career and research"); a brief's subject keeps its lower-case words ("Antikythera mechanism", not the island). `evals/seeds-overflow.json`: three briefs (the Antikythera mechanism, the Rosetta mission, the Aral Sea's restoration; 30 topics) whose topics sit in many sections and linked articles, for milestone 3. Both sets running.
- walk-11 at 71ee567, the ladder read: topics 26 / 22 / 26 of 35 (walk-10: 22 / 17 / 21); 8B profiles of thirteen paragraphs from eleven articles; hops cited 22 of 42 at 8B and 14 of 17 at 1.7B once a hop child reads the part of its article that names the subject rather than the lead (the first cut cited 17 of 42 with 21 blocked). Faults from the first cut, fixed in code: junk names (disambiguation hatnotes, months, nationalities), hop children reading on into "section none", a linked name searched for and lost to a sibling's article, the Hubble brief searched as a whole and reading *Edwin Hubble*. Still open: generic links (Astronomy, Universe, Star) chosen and found empty; the root's picks under a brief cap what the lead contributes; hop children are leaves, so the graph stops near 19 nodes of 40.
- Milestone 2 begun, walk-11 (ea39412): a brief's child hands the things its kept sentences name to children of its own — the article's links that occur in those sentences (a new Wikipedia request, cached), else capitalised phrases — the model picking from a list ranked by how many excerpts in the run name each, minus anything read or opened anywhere; a hop child reads that article and keeps only sentences naming the brief's subject; a sentence kept anywhere is never offered again; profiles gather paragraph by paragraph. `limits.maxHops` (2). The walk-11 ladder is running.

### 2026-09-18 · evening · the Turing test

- John's turn: a brief instead of a question. "Tell me about Alan Turing and elaborate on the impact of his work." walk-7 gave one to three lead sentences. walk-8 (6be04a1) made a brief a profile: the root reads the lead, the model picks the sections worth reading (up to six), code makes one child per section, each child keeps its sentences and may hop once, and the root's finding is the paragraphs in order. walk-9 (57a4eb9) and walk-10 (29d44c2) fixed what the profiles showed: model-asked questions under a brief, children fanning out, hops re-reading the lead, pick order, duplicates, the eight-citation cap. At walk-10: 8B six cited paragraphs in 37 calls, 4B four, 1.7B seven in 36 calls and 12k tokens. Reading in [evals/readings.md](evals/readings.md); runs in experiments/.

### 2026-09-18 · afternoon

- The vanilla column, on John's question: `--mode closed` (the model alone, one call, no tools). 4B names 19/23 and 21/30 from memory, 8B 20 and 18, above every reading mode; 1.7B 14 and 9; 0.6B 8 and 8. The walk beats memory only at 1.7B on the graph seeds (16 vs 9). The benchmark seeds are questions these models have memorised; the next seed set is to be chosen where 8B's closed-book score is low.
- walk-7 rows: on the graph seeds the tangle leads its one-node control at every size (16, 15, 14 against 12, 12, 12 of 30) and the whole lead is the code-made split of two-subject questions; reading on adds about a fact on the base seeds (4B 17/23, the best walk row yet). 8B's model-asked children take the graph seeds to 828 s. Base seeds against the composing node: behind at 1.7B and 8B, ahead at 4B.
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
