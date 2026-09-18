# Eval results

One row per suite run; the JSON next to each holds every graded output. Newest last.

| date | commit | suite | model | prompt · grammar | passed | detail | latency |
|---|---|---|---|---|---|---|---|
| 2026-09-17 | 9f8bc21 | visits | qwen3-0.6b | tangle-pocket-9 · per-action-6 | **8/24** | not fully passing: degenerate output 0/1, memory over evidence 0/1, grounded resolution 0/1, section by name 0/4, resolve when supported 0/3, synthesis 0/2, specific finding 0/1, section pick 0/3 | median 2103 ms |
| 2026-09-17 | 9f8bc21 | visits | qwen3-1.7b | tangle-pocket-9 · per-action-6 | **12/24** | not fully passing: grounded resolution 0/1, section by name 0/4, resolve when supported 0/3, synthesis 0/2, specific finding 0/1, repeat question 0/1 | median 2176 ms |
| 2026-09-17 | 41c9a63 | visits | qwen3-4b | tangle-pocket-9 · per-action-6 | **11/24** | not fully passing: degenerate output 0/1, grounded resolution 0/1, section by name 0/4, resolve when supported 0/3, synthesis 0/2, specific finding 0/1, repeat question 0/1 | median 9119 ms |
| 2026-09-17 | 79e918e | visits | qwen3-8b | tangle-pocket-9 · per-action-6 | **20/24** | not fully passing: degenerate output 0/1, grounded resolution 0/1, synthesis 0/2 | median 10917 ms |
| 2026-09-17 | 79e918e | runs · tangle | qwen3-1.7b | tangle-pocket-9 · per-action-6 | **1/7 resolved** · facts 2/23 · supported 2/23 | dead-sea ✗ 0/0/3, water-cycle ✗ 0/0/3, bronze-age ✗ 0/0/4, colony-collapse ✗ 0/0/4, coral ✗ 0/0/3, sky-blue ✗ 0/0/3, aral ✓ 2/2/3 (supported/present/total) · 1290 calls · 671 lookups | 2489 s |
| 2026-09-17 | 79e918e | runs · flat | qwen3-1.7b | ? · ? | **5/7 resolved** · facts 8/23 · supported 7/23 | dead-sea ✓ 1/1/3, water-cycle ✓ 1/2/3, bronze-age ✓ 1/1/4, colony-collapse ✗ 0/0/4, coral ✓ 2/2/3, sky-blue ✗ 0/0/3, aral ✓ 2/2/3 (supported/present/total) · 84 calls · 42 lookups | 179 s |
| 2026-09-17 | 79e918e | runs · tangle | qwen3-0.6b | ? · ? | **5/7 resolved** · facts 5/23 · supported 5/23 | dead-sea ✓ 0/0/3, water-cycle ✓ 2/2/3, bronze-age ✓ 1/1/4, colony-collapse ✗ 0/0/4, coral ✓ 2/2/3, sky-blue ✗ 0/0/3, aral ✓ 0/0/3 (supported/present/total) · 27 calls · 11 lookups | 110 s |
| 2026-09-17 | 79e918e | runs · flat | qwen3-0.6b | ? · ? | **3/7 resolved** · facts 0/23 · supported 0/23 | dead-sea ✓ 0/0/3, water-cycle ✗ 0/0/3, bronze-age ✗ 0/0/4, colony-collapse ✗ 0/0/4, coral ✗ 0/0/3, sky-blue ✓ 0/0/3, aral ✓ 0/0/3 (supported/present/total) · 23 calls · 10 lookups | 69 s |
| 2026-09-17 | 79e918e | runs · tangle | qwen3-4b | ? · ? | **7/7 resolved** · facts 14/23 · supported 14/23 | dead-sea ✓ 1/1/3, water-cycle ✓ 2/2/3, bronze-age ✓ 0/0/4, colony-collapse ✓ 3/3/4, coral ✓ 3/3/3, sky-blue ✓ 3/3/3, aral ✓ 2/2/3 (supported/present/total) · 14 calls · 7 lookups | 115 s |
| 2026-09-17 | 79e918e | runs · flat | qwen3-4b | ? · ? | **7/7 resolved** · facts 14/23 · supported 14/23 | dead-sea ✓ 1/1/3, water-cycle ✓ 2/2/3, bronze-age ✓ 0/0/4, colony-collapse ✓ 3/3/4, coral ✓ 3/3/3, sky-blue ✓ 3/3/3, aral ✓ 2/2/3 (supported/present/total) · 14 calls · 7 lookups | 97 s |
| 2026-09-17 | 79e918e | runs · tangle | qwen3-8b | ? · ? | **7/7 resolved** · facts 18/23 · supported 18/23 | dead-sea ✓ 1/1/3, water-cycle ✓ 2/2/3, bronze-age ✓ 3/3/4, colony-collapse ✓ 3/3/4, coral ✓ 3/3/3, sky-blue ✓ 3/3/3, aral ✓ 3/3/3 (supported/present/total) · 23 calls · 14 lookups | 218 s |
| 2026-09-17 | 79e918e | runs · flat | qwen3-8b | ? · ? | **7/7 resolved** · facts 19/23 · supported 19/23 | dead-sea ✓ 1/1/3, water-cycle ✓ 2/2/3, bronze-age ✓ 3/3/4, colony-collapse ✓ 4/4/4, coral ✓ 3/3/3, sky-blue ✓ 3/3/3, aral ✓ 3/3/3 (supported/present/total) · 39 calls · 30 lookups | 334 s |

The `runs` rows above were written with the prompt and grammar read from the source tree, which was on branch `pocket-10` at the time; the page they drove was the committed build, `tangle-pocket-9` / `per-action-6`, commit `79e918e`. Corrected in place here and in the JSON records. Every suite loaded the page between 21:26 and 22:22, before that branch was ever built.

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

So on this evidence the fractal approach does not beat flat lookup at any size available here. Where it engages it is worse, and the reason is mechanical: a parent waits for *all* its children to resolve, so one honest block freezes it above a graph full of findings.
