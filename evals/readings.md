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

Three things changed at once, so read it as a floor, not a verdict.

- **The tangle now beats its own flat control** (7 against 2) and every fact it states is supported, because a finding is a verbatim sentence the model picked and confirmed. The old composing flat prompt still states one more fact (8, of which 7 supported) in a third of the time.
- **Per seed it is either clean or lost.** Dead Sea: one node, five calls, two lookups, the National Water Carrier sentence, five seconds. Colony collapse: two nodes, all four facts, because one sentence lists the causes. Coral, water cycle: one fact each, the first answering sentence, and stop. Bronze Age, sky-blue, Aral: zero, for reasons the traces make plain.
- **The walk's own failures, all fixable in code.** (1) A child question about the sentences it was shown — "What is the name of the weapon described in the text?" under the Aral Sea — takes the graph somewhere it never returns from; Bronze Age drifted into food waste, sky-blue into Blue Sky Studios. (2) Junk leaf findings are gathered up to the root as its answer. (3) One sentence per finding caps a why-question at one fact. (4) "Sky blue" as a search term finds the colour. walk-2 refuses paraphrases of an ancestor or sibling; walk-3 refuses questions about the text and gathers up to three sentences per finding; the benchmark reruns on it next.
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
