# Readings

*What each eval round meant, newest first. The rows themselves are in [results.md](results.md); the node-eval rows in [node/results.md](node/results.md).*

## 2026-09-18 · the walk's first benchmark (1.7B)

The walk (`src/walk.js`) replaced the one-prompt visit: code sequences the visit, the model only picks a numbered sentence (then confirms it with one yes-or-no), a section heading, a search term, or one smaller question. Same seven seeds, same rubric, same Wikipedia recording.

| build | mode | seeds resolved | facts stated | supported | nodes | calls | lookups | tokens | seconds |
|---|---|---|---|---|---|---|---|---|---|
| pocket-9 one-prompt (2026-09-17) | flat | 5/7 | **8/23** | 7/23 | 7 | 84 | — | 48k | 179 |
| pocket-9 one-prompt (2026-09-17) | tangle | 1/7 | 2/23 | 2/23 | 280 | 1290 | — | 962k | 2489 |
| walk-1 (ee83f51) | flat | 2/7 | 2/23 | 2/23 | 7 | 91 | 32 | 21k | 49 |
| walk-1 (ee83f51) | tangle | 6/7 | **7/23** | **7/23** | 60 | 737 | 162 | 261k | 515 |
| walk-3 (ce5474e) | tangle | 6/7 | **8/23** | **8/23** | 24 | 269 | 52 | 101k | 202 |
| walk-4 (42c937e) | tangle | **7/7** | **9/23** | **9/23** | 16 | 183 | 41 | 62k | 145 |
| walk-5 (5887c5d) | tangle | **7/7** | **9/23** | **9/23** | 7 | 31 | 9 | 11k | **35** |

walk-4 across the ladder (tangle mode; the pocket-9 one-prompt rows are in the matrix below for comparison):

| model | walk-4 facts | supported | seconds | pocket-9 flat | pocket-9 tangle |
|---|---|---|---|---|---|
| 0.6B | 0/23 | 0/23 | 60 | 0/23 | 5/23 |
| 1.7B | **9/23** | 9/23 | 145 | 8/23 (7) | 2/23 |
| 4B | 14/23 | 14/23 | 64 | 14/23 | 14/23 |
| 8B | 14/23 | 14/23 | 150 | 19/23 | 18/23 |

walk-5 (both search terms, the article picked from the union, confirmation only for foreign sources): 0.6B 2/23 · 1.7B 9/23 in 35 s · 4B **16/23** · 8B 12/23, all supported.

walk-6 (search snippets with the titles; the check by model size): 0.6B 2/23 · 1.7B 9/23 in 56 s · 4B 14/23 with the check, **16/23** without it (65 s) · 8B **16/23** with the check, every seed resolved, 104 s. All supported.

| model | best walk row (all supported) | fair control: pocket-9 one-prompt flat (supported) |
|---|---|---|
| 0.6B | 2/23 | 0/23 (0) |
| 1.7B | **9/23** in 35 s | 8/23 (7) in 179 s |
| 4B | **16/23** in 67 s | 14/23 (14) in 97 s |
| 8B | 16/23 in 104 s | **19/23** (19) in 334 s |

Three things changed at once, so read it as a floor, not a verdict.

- **The tangle now beats its own flat control** (7 against 2) and every fact it states is supported, because a finding is a verbatim sentence the model picked and confirmed. The old composing flat prompt still states one more fact (8, of which 7 supported) in a third of the time.
- **Per seed it is either clean or lost.** Dead Sea: one node, five calls, two lookups, the National Water Carrier sentence, five seconds. Colony collapse: two nodes, all four facts, because one sentence lists the causes. Coral, water cycle: one fact each, the first answering sentence, and stop. Bronze Age, sky-blue, Aral: zero, for reasons the traces make plain.
- **The walk's own failures, all fixable in code.** (1) A child question about the sentences it was shown — "What is the name of the weapon described in the text?" under the Aral Sea — takes the graph somewhere it never returns from; Bronze Age drifted into food waste, sky-blue into Blue Sky Studios. (2) Junk leaf findings are gathered up to the root as its answer. (3) One sentence per finding caps a why-question at one fact. (4) "Sky blue" as a search term finds the colour. walk-2 refuses paraphrases of an ancestor or sibling; walk-3 refuses questions about the text and gathers up to three sentences per finding; the benchmark reruns on it next.
- **walk-3 (same day, second row):** refusing paraphrases and questions about the text, and gathering up to three checked sentences, took 1.7B to 8/23 — level with the old composing flat prompt, every fact supported, in 202 s — and the Aral runaway shrank from 32 nodes to 6. Bronze Age went from 0 to 2 facts. But the water cycle root blocked after showing the same lead windows twice across visits with the check saying no to the true sentence; sky-blue and Aral read the wrong article ("Sky blue" the colour, "North Aral Sea") for visits because the walk trusts Wikipedia's first hit; and the Dead Sea's second gathered sentence was filler the check let through. walk-4 picks the article from the five hits and remembers judged sentences across visits.
- **walk-4 is the first legitimate win, at one size.** With the article picked from the search hits and judged sentences remembered, 1.7B resolves every seed and states 9 facts, all supported, faster than the old composing prompt stated 8 with one unsupported. 4B holds its old score at two-thirds the time. 8B falls below its old rows: a finding of at most three verbatim sentences states fewer facts than a composed paragraph, and on the sky seed 8B chose the colour article, drifted into a painter's biography through four "waiting" ancestors, and the question ask overflowed the context window. 0.6B is now below the frontier for the walk's first step: it answers "none" to every article pick.
- **walk-5 halves the cost and moves the frontier at 4B.** Searching both terms and picking from the union, with the confirmation only when the source is foreign, took every 1.7B seed to one node and 35 s for the same 9 facts, and 4B to 16/23, above any earlier row at that size. It also showed the two remaining named failures: from titles alone every size prefers "Sky blue" (the colour) to "Diffuse sky radiation", and without a check 1.7B and 8B accept the Dead Sea lead's "receding at a swift rate" as the answer to *why*. walk-6 shows the search snippet with each title and applies the check by model size.
- **walk-6: the snippets fix the sky article; the check is a size-dependent trade.** With the search snippet after each title, 1.7B, 4B and 8B all read "Diffuse sky radiation" for the sky seed. Checking every pick took 8B from 12 to 16 facts and 4B from 16 to 14; the node evals had said the check was a one-case gain at 4B, and the benchmark disagreed, so the check applies at 8B only. Where the walk still loses to the old composing prompt is 8B: a finding of three verbatim sentences states fewer facts than a composed paragraph from a model that can compose one honestly. That is a real limit of "never compose", and the place to test a fourth ask — "which of these sentences also belongs in the answer" over several — rather than a reason to hand composition back.
- **The question ask is the weak ask at every size** (evals/node/results.md): under three phrasings, 0.6B to 8B mostly rephrase the parent ("What is the main cause of the Dead Sea's shrinking?"), which the paraphrase rule now refuses; the narrower phrasings help 1.7B a little and hurt 4B. Real sub-questions do appear ("What is the source of the water being removed from the Dead Sea?"). Decomposition is where the thesis lives, and it is the ask a tiny model does worst; the graph currently earns its keep by reading on, not by asking well.
- **The flat control under the walk is weak by construction**: one node, one sentence, no reading on after a "none". The fair control for "does decomposition help" remains the old composing flat prompt until the walk's flat mode reads on after an answer.

The node evals behind these choices are in [node/results.md](node/results.md): from 1.7B up the model finds the answering sentence in every positive case, fails only when nothing answers, and cannot tell a sentence about the wrong lake — which is why the pick is checked and why the first search term is code.

## 2026-09-17 · the first full matrix

Seven seeds, four models, two modes. `tangle` is the default limits (40 nodes, depth 6, 2 lookups a visit); `flat` is one node with six lookups, the control for decomposition itself.

| model | mode | seeds resolved | facts stated | supported | facts read | nodes | calls | tokens | seconds |
|---|---|---|---|---|---|---|---|---|---|
| 0.6B | flat | 3/7 | 0/23 | 0/23 | 9/23 | 7 | 23 | 13k | 69 |
| 0.6B | tangle | 5/7 | 5/23 | 5/23 | 16/23 | 7 | 27 | 16k | 110 |
| 1.7B | flat | 5/7 | **8/23** | 7/23 | 20/23 | 7 | 84 | 48k | 179 |
| 1.7B | tangle | 1/7 | **2/23** | 2/23 | **23/23** | 280 | 1290 | **962k** | **2489** |
| 4B | flat | 7/7 | 14/23 | 14/23 | 19/23 | 7 | 14 | 8k | 97 |
| 4B | tangle | 7/7 | 14/23 | 14/23 | 19/23 | 7 | 14 | 8k | 115 |
| 8B | flat | 7/7 | **19/23** | 19/23 | 23/23 | 7 | 39 | 30k | 334 |
| 8B | tangle | 7/7 | 18/23 | 18/23 | 23/23 | 7 | 23 | 15k | 218 |

Read the node counts before the scores. At 0.6B, 4B and 8B the tangle rows are seven nodes for seven seeds: **decomposition never fired**. Those models read and answered at the root, so those rows compare two lookups against six, not decomposition against none.

Only 1.7B decomposes. It is the one row where the tangle is tested, and it loses badly: twenty times the tokens and fourteen times the wall clock to state a quarter as many facts as the same model with one node. It is not that the graph failed to find the material — it read **every fact in the rubric, 23 of 23, more than any other row** — and then delivered two, because the root never resolved on six of seven seeds.

So on this evidence the fractal approach did not beat flat lookup at any size available here. Where it engaged it was worse, and the reason is mechanical: a parent waited for *all* its children to resolve, so one honest block froze it above a graph full of findings. Read this as a verdict on that build — the frozen scheduler and a visit that asked the model for five decisions at once — not on the approach. The plan turned on it: see *The turn* in [../PLAN.md](../PLAN.md).
