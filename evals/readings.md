# Readings

*What each eval round meant, newest first. The rows themselves are in [results.md](results.md); the node-eval rows in [node/results.md](node/results.md).*

## 2026-09-18 · the vanilla column: what the model already knows

John asked whether we can now stack the vanilla models against models-plus-Tangle. The missing column was the model alone: `--mode closed` asks the seed question with no tools, one call, and grades the answer on facts named. Nothing in that column is supported, by construction — there is no evidence — so it measures memory, and the other columns measure reading.

| model | seeds | closed (memory) | tangle walk-7 | flat walk-7 | composing (one node + Wikipedia) |
|---|---|---|---|---|---|
| 0.6B | base 23 | 8 | 2 (walk-6) | — | 0 (pocket-9) |
| 1.7B | base 23 | 14 | 10 | 12 | **16** |
| 4B | base 23 | **19** | 17 | 17 | 13 |
| 8B | base 23 | **20** | 16 | 17 | 18 |
| 0.6B | graph 30 | 8 | — | — | — |
| 1.7B | graph 30 | 9 | **16** | 12 | 12 (11 supported) |
| 4B | graph 30 | **21** | 15 | 12 | 14 (9 supported) |
| 8B | graph 30 | **18** | 14 | 12 | 17 (16 supported) |

- **From 4B up, memory names more rubric facts than any reading mode, on both seed sets.** 4B alone names 19 of 23 and 21 of 30; 8B 20 and 18. The seeds are Wikipedia's best-known questions — why the sky is blue, why the Dead Sea shrinks — and a 4B model has read that Wikipedia. Every column that reads is capped by what it reads and how it picks; the memory column is capped by nothing but recall, and these seeds do not test recall.
- **Tangle beats memory in one cell: 1.7B on the graph seeds, 16 against 9.** That is the size that does not know the answers and the seeds that need more than one article — the split did that. At 1.7B on the base seeds memory (14) beats the walk (10) and the composing node (16) beats both. At 0.6B memory names 8 and the walk 2.
- **The columns measure different things, and the table should say so.** Closed-book facts are named, not shown: 1.7B's Dead Sea answer names the Jordan River and then says the sea is being filled from it. The walk's facts are verbatim sentences from a cited excerpt. "Vanilla beats Tangle" on this table means "recall beats grounded reading on questions the model has memorised"; it does not say which answer to trust.
- **What this changes.** The benchmark's seeds were chosen for where the facts sit in Wikipedia, not for whether the model already knows them. A seed the model answers from memory cannot show what reading adds. The next seed set should be filtered by the closed column — keep questions where 8B names under a third of the facts alone — and the same four columns rerun. Only there can the thesis be tested; here it is being tested against a model that has already read the book.

## 2026-09-18 · walk-7: the split, and reading on

Two code changes from the graph-seed traces (5c51800). A question naming two subjects joined by *and* or *or* is split before anything is read, one child per subject ("… — about the Aral Sea"), each child's search term drops the other subject, and the parent's answer is its children's findings with no pick. After a first pick, while the finding has room and lookups remain, a node reads one more section the model chooses and asks again over it. Both seed sets, three sizes, tangle and flat; the composing column is the pocket-10 one-node control from the rounds above.

| model | seeds | tangle walk-7 (walk-6) | flat walk-7 (walk-6) | composing |
|---|---|---|---|---|
| 1.7B | base 23 | 10 (9) · 62 s | **12** (11) · 44 s | **16** · 107 s |
| 4B | base 23 | **17** (16) · 71 s | **17** (16) · 74 s | 13 · 65 s |
| 8B | base 23 | 16 (16) · 125 s | **17** (—) · 200 s | **18** · 480 s |
| 1.7B | graph 30 | **16** (12) · 102 s | 12 (12) · 56 s | 12 (11 supported) · 244 s |
| 4B | graph 30 | **15** (10) · 143 s | 12 (10) · 110 s | 14 (9 supported) · 136 s |
| 8B | graph 30 | 14 (12) · **828 s** | 12 (11) · 311 s | **17** (16 supported) · 522 s |

Every walk fact is supported.

- **The split is the first decomposition that pays, at every size.** On the three comparison seeds the graph states 5, 6 and 6 facts (1.7B, 4B, 8B) against 1, 2 and 3 for the same walk on one node. Lake Chad and the Dead Sea went from 0 or 1 at every size to 2 at every size; the Dead Sea and the Aral Sea from 1 to 2 at 1.7B and 8B. This is decomposition by code — the model is not asked — and it is the whole of the graph's lead over its one-node control on the graph seeds (16, 15, 14 against 12, 12, 12).
- **Reading on is worth about a fact.** Dead Sea 1.7B 0 → 1 (the lead's "receding" sentence, then the section's "shrinking since the 1960s"); 4B base 16 → 17; 8B base unchanged. It cannot fix a pick that stops at the wrong sentence: 1.7B's water cycle finding is "the water returns to the ocean, to continue the water cycle", and its colony-collapse finding is the definition of the disorder.
- **Against the composing node the picture is now split by seed set.** On the graph seeds the walk is ahead at 1.7B (16 against 12) and 4B (15 against 14, with 9 of the 14 supported), behind at 8B (14 against 17). On the base seeds it is behind at 1.7B (10 against 16), ahead at 4B (17 against 13), behind at 8B (16 against 18). Where the composing node loses it is because it stops reading; where it wins it is because a paragraph names more facts than three sentences, and at 4B and above on hard seeds some of those facts are not in its evidence.
- **The model-asked children are still the cost.** 8B on the graph seeds took 828 s: Lake Chad and the Dead Sea grew to 14 nodes and 312 s, the Jordan two-hop to 11 nodes and 206 s, because each split child went on to ask its own questions. The Sahara at 8B is four nodes with the same junk sentence as every finding — the check said yes to "the rainfall inhibition … most accentuated over the eastern section" — and Venus is a lead sentence about early oceans, twice. The 1.7B sky seed lost its two facts to photosynthesis children again.

So the frontier moved by one mechanism: where code can see the shape of the question, the graph beats one node at every size. The model-asked question is still the ask that drifts, and the pick still takes the first sentence that reads like an answer.

## 2026-09-18 · the seeds no single article answers

Ten seeds in `evals/seeds-graph.json`: three comparisons (the Dead Sea and the Aral Sea; Lake Chad and the Dead Sea; the Bronze Age collapse and the fall of Rome), one two-hop (why less Jordan water reaches the Dead Sea), five whose first article's lead lacks the answer (the Sahara's dryness, the Black Death's route, almond pollination, Venus against Earth, the Gulf Stream), and one control both leads answer (the Moon's face). Thirty facts, checked against live Wikipedia sections. Same page (walk-6, dca1958), three sizes, three modes, one pass each (the benchmark is deterministic, above).

| model | tangle (walk) | flat (walk, one node) | composing (pocket-10, one node) |
|---|---|---|---|
| 1.7B | 12/30 (12 supported) · 88 s | 12/30 (12) · 59 s | 12/30 (**11**) · 244 s |
| 4B | 10/30 (10) · 158 s | 10/30 (10) · 95 s | 14/30 (**9**) · 136 s |
| 8B | 12/30 (12) · 333 s | 11/30 (11) · 239 s | **17/30** (**16**) · 522 s |

- **No size gets past one article.** The walk resolves 8 of 10 seeds at 1.7B and 10 of 10 at 4B and 8B, most of them in one node, four calls and one lookup: it reads one article, picks the first sentence that reads like an answer, and stops. The Dead Sea and the Aral Sea "both shrink" is answered from the Aral Sea alone at every size; the Sahara from "Rain shadow"; the Black Death's route from a lead that says only how plague spreads. One fact a seed is the ceiling of that shape, and the table is that ceiling.
- **The graph does not fire where it is needed, and drifts where it does.** Tangle and flat are level at every size: the children the question ask adds are not the halves of the question. 4B on Lake Chad and the Dead Sea went to "2010 Sahel famine" and then four nodes deep into global dimming; 8B on the Sahara asked three real sub-questions about the rain shadow and the subtropical ridge and every node's finding is the same junk sentence, gathered up the chain. 8B did once ask the right thing — "What were the primary causes of the shrinking of the Aral Sea?" — and the child read the Caspian Sea, and the check accepted a sentence about oil pollution as the Aral's cause.
- **The composing node invents once the seeds get hard.** On the base seeds every composed fact was supported; here 4B states 14 and supports 9, 8B states 17 and supports 16, 1.7B 12 and 11. The walk states 34 facts across the three sizes and supports 34. The gap is small in facts and large in kind: the rubric only counts a keyword in a cited excerpt, so "unsupported" here means the model named a cause its evidence never mentioned.
- **8B composing on the base seeds: 18/23** (all supported, 480 s), against the walk's 16 and pocket-9's 19. So the full base-seed control row is 1.7B 16, 4B 13, 8B 18.

What the traces say to fix, in code: a question that names two subjects is two questions and code can see the join (walk-7 splits it, one child per subject, and the parent's answer is their findings, no pick); a first answer is not the whole answer while the article has unread sections and lookups remain (walk-7 reads on and asks again); and a check on a foreign source should see the source. The first two are in walk-7, running next.

## 2026-09-18 · repeats, and the control we never ran

Three passes of each row, same page (walk-6, dca1958), same seeds, same Wikipedia recording. `tangle` is the walk with default limits; `flat` is the walk on one node with six lookups; `composing` is the old one-prompt visit on one node (pocket-10, the prompt written on the 17th after the first matrix and never benchmarked, because the walk started the next morning).

| model | tangle (walk) | flat (walk, one node) | composing (pocket-10, one node) |
|---|---|---|---|
| 1.7B | 9/23 · 9 · 9 (47–53 s) | 11/23 · 11 · 11 (38 s) | **16/23** · 16 · 16 (107–180 s) |
| 4B | **16/23** · 16 · 16 (65 s) | **16/23** · 16 · 16 (65 s) | 13/23 · 13 · 13 (65–100 s) |

Every fact stated in every row is supported.

- **The benchmark is deterministic.** Nine rows, three passes each, not one fact of difference. Sampling is temperature 0.2 with a fixed seed and Wikipedia is replayed from the recording, so a rerun is the same run. Repeats cannot measure noise here; the noise is across seeds. Every earlier single row was already the whole story, and a one-fact gap is a one-seed gap — real for that seed, and no evidence about the next one. More seeds are the only way to a wider claim.
- **The control we compared against was the wrong one.** The "fair control" in the walk readings was pocket-9's composing node: 8/23 (7 supported) at 1.7B. pocket-10 — resolve when the excerpts answer, read a listed section when the lead does not — scores **16/23, all supported**, at 1.7B on the same seeds. Against that, the walk at 1.7B is seven facts behind, not one ahead. At 4B the composing node scores 13 and the walk 16, so the order flips with size; 8B is not rerun yet.
- **At 1.7B the graph loses to its own single node** (9 against 11). The two facts are the sky seed: the section pick chose "The diffused skylight effect" (Pinatubo, photosynthesis), the question ask made two children about photosynthesis, and the root gathered their findings as its answer. The one-node walk, with no children to lean on, read on to the "Color" section and picked the wavelength sentence. Every other seed is identical between the two rows: at 1.7B the walk reads one article and picks from it whether or not it may have children.
- **Where the composing node wins at 1.7B,** it is by reading a section and writing a paragraph that names several facts: Dead Sea 2 against 0 (it read "Receding shoreline" and named the Jordan diversion; the walk stopped at the lead's "receding at a swift rate"), water cycle 2 against 0, sky 2 against 0, colony collapse 4 against 1. The walk wins Aral (3 against 2) and Bronze Age (2 against 1). The rubric counts facts named in the finding; a composed paragraph names more of them than three verbatim sentences, at every size, and the pocket-10 prompt now reads on as well.

So the standing claim is narrower than the walk readings said. Against a single node that reads on and composes, the graph is behind at 1.7B and ahead at 4B, on seeds that one article answers. What the walk keeps is that nothing it states is unsupported, by construction rather than by grading. The seeds no single article answers (`evals/seeds-graph.json`) are the next round.

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
