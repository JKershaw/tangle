# Readings

*What each eval round meant, newest first. The rows themselves are in [results.md](results.md); the node-eval rows in [node/results.md](node/results.md).*

## 2026-09-19 · the reference column: the graph and the tool control on DeepSeek and Haiku

Milestone 7 brought forward by a day, at John's question: does the boost run out when the model is large, or does a task that needs a large model run cheaper as the graph on a mid-sized one? The same graph and the same tool control over OpenRouter, DeepSeek V3.2 and Claude Haiku 4.5, on the profile and MangoDB suites, under a dollar in all; rows added to the table below.

- **The graph beats the tool control on both API models, on both suites.** DeepSeek: profiles 27 against 21, MangoDB 13 against 8. Haiku: profiles 23 against 15, MangoDB 25 against 20. The one size where the single context won, 8B on code, stays the one size.
- **Haiku through the graph is the best code row by seven topics**, 25 of 42 against 14B's 18, every one cited, at 5.1k tokens a topic (about a cent a topic at Haiku's prices). So the harness is not the ceiling over code: given a model that picks well, the same units and candidates reach most of the rubric. The first draft of this note, written on DeepSeek's row alone, said the opposite and was wrong.
- **DeepSeek V3.2 is poor at these picks.** 13 of 42 on code, with the persist brief a single paragraph of one topic, and 27 of 35 on profiles, level with 14B. As the tool control it is worse still (8 of 42) and it never copies a sentence word for word (0 cited on both suites). A frontier-class model is not automatically a good picker; the node evals over the recorded calls can now say which ask it fails.
- **The cited single context stays near zero on code at every size and model.** Haiku copies 12 of 35 on profiles and 0 of 42 on code; 14B 16 and 3; DeepSeek 0 and 0. Only the graph cites over code, at any size.
- **Cost, in money.** Haiku's graph rows cost about twenty cents a suite and its tool control eight; the whole reference column was under a dollar. A 1.7B graph on this machine costs electricity. For Harbour the question is now concrete: the graph on Haiku reads a codebase better than Haiku driving itself and better than any local size, at two and a half times the tokens.

## 2026-09-19 · milestone 5b: the tool control, 1.7B to 8B

The control the graph had to beat (ROADMAP 5b): the same model with the four source requests as tools in one context, driving itself, each seed given the calls and tokens the graph's row spent on it, in the walk's context window. tools-3: an answer given before anything was read is refused with the reason and charged; a search line handed back as a title is cut to the title; the budget is checked against the next call's cost. Rows in Node against Ollama, the four seed sets, three sizes, and 14B on the profile and code suites (the 14B memory row is from the walk-12 day; there is none for MangoDB).

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

- **At 1.7B and 4B the graph earns its keep on every brief set, about two to one.** Profiles 25 and 24 against 13 and 11; overflow 24 and 23 against 11 and 11; MangoDB 14 against 6 at 1.7B and 11 against 11 at 4B, where the tool control's 11 has 6 supported. The tool control at these sizes reads, is refused a few times, spends its whole budget on the transcript and then answers from memory: on the question seeds it lands within a fact of the memory column (14 against 14, 18 against 19) with nothing supported.
- **At 8B the answer changes, and at 14B it changes back.** At 8B the tool control stops by itself after two or three reads, spends a fifth to a third of its budget, and states what it read: profiles 20 against the graph's 24, overflow 21 against 24, and on MangoDB 15 against 12, ahead of the graph at a third of the tokens per topic (1.0k against 4.4k). The graph's rows do not move from 4B to 8B; the tool control's double. At 14B the graph moves again, profiles 27 (its best row) and MangoDB 18 (its best code row, above 8B's 12), while the tool control stays at 20 and 15. So the single context overtakes the graph at one size on one suite, and per topic it is cheaper from 8B up (0.8k against 3.2k on profiles at 14B). The 14B profile row is the first where the cited single context is real: 16 of 35, every one supported.
- **Cost per topic in compute favours the graph at 1.7B.** Tokens are not equal across sizes: a token at 8B costs about five times one at 1.7B. The graph at 1.7B on profiles is 2.8k tokens per topic; the tool control at 8B is 1.3k tokens per topic at five times the price per token. For Harbour's question, small acting big beats big driving itself, on the briefs, so far.
- **The cited variant fails below 8B, and mostly at 8B.** Told to answer only in sentences copied word for word, 1.7B and 4B paraphrase everything: 0 of 23, 0 of 30, 0 of 42, and 11 of 35 on profiles at 1.7B is the one place it copied. At 8B some sentences survive the cut (8 of 35, 6 of 30) and none on code. A single context cannot be made to cite by asking; the graph cites because a finding is a pick, not a composition.
- **The question seeds are memory's, whoever reads.** The tool control equals memory at every size on them and the graph is below memory from 4B up, as it has been since the bridge. They measure recall, and the reading columns add nothing to a model that already knows.
- **Refusals and drops.** At 1.7B and 4B most seeds were refused an unread answer once or twice and then stopped by the token budget; at 8B one refusal across 36 seeds and every seed stopped by answer. The context window forced a drop of the oldest tool result on four seeds in all, so the window was not the binding limit; the budget was.
- **The warm-graph row is not built, on a measurement.** Across the four MangoDB briefs no node question repeats at any size (28, 45 and 42 nodes, all distinct), so a store of findings keyed by question would reuse nothing under the current node design; what the briefs share is reads, which the corpus already holds in memory. It waits for a node design whose questions recur.

## 2026-09-19 · milestone 5b, first rows: a small model offered tools does not use them

The tool control (`scripts/tools.mjs`): the same model, the four source requests as tools in one context, each seed given the calls and tokens the graph's row spent on it. At 1.7B, tools-1, all 36 seeds across the four suites were answered on the first call with no tool used: composing 14 / 23, 14 / 35, 10 / 30 and 8 / 42 topics with nothing read and nothing supported, which is the memory column under another name; cited 0 everywhere, because there was nothing to cite. 4B on two seeds searched once and answered from the snippets without reading. Probes on the OpenAI route: with a shorter system prompt 1.7B does call search, and with the suite's prompt it does not, whatever `tool_choice` says; Ollama 0.34.2 ignores `"required"` and a named tool (identical output all three ways). So the API cannot force a read, and the prompt is not going to be reworded to beg for one. The rule "read before you answer" is the harness's to enforce: an answer given before anything was read is refused with the reason, costs its call, and the model gets the next turn (tools-2). If a model then spends its whole budget refusing to read, the row says so, and that is the finding.

## 2026-09-19 · milestone 5a: the replay

Milestone 5a of [ROADMAP.md](../ROADMAP.md). Every model call is now recorded by its exact context and replayed when it recurs (`src/replay.js`, `evals/model-cache/`), the way Wikipedia has been replayed since the bridge. The point was never the cache itself but what it makes cheap: a rerun of unchanged code, and the miss count after a change.

| suite (1.7B, tangle) | calls | replayed | misses | seconds live | seconds replayed | row |
|---|---|---|---|---|---|---|
| base (7 seeds) | 38 | 38 | 0 | 22 | 0.5 | 15 / 23, unchanged |
| profile (4) | 197 | 197 | 0 | ~180 | 19 | 25 / 35, unchanged |
| overflow (3) | 117 | 117 | 0 | ~120 | 7 | 24 / 30, unchanged |
| code, MangoDB (4) | 122 | 122 | 0 | 19 | 0.6 | 14 / 42, unchanged |

- **The benchmark is deterministic to the call.** Four suites, 474 calls, and the second run asked for the same 474 contexts in the same order. That is the strongest statement of determinism yet: not just the same score but the same conversation. It also means every recorded call is a node-eval case waiting to be written, with the model's actual answer attached.
- **The blast radius of a change is countable.** One word added to the article ask ("the one article") on a scratch copy of the cache: 5 of 38 calls missed, exactly the five article picks in the base suite, the model gave the same five picks, and nothing downstream moved. A prompt change now announces which calls it touched before anyone reads a row.
- **With the model gone, the harness's own cost shows, and the profile finds it in a minute.** The profile suite first replayed in 19 seconds for 197 calls, and a CPU profile put 17.7 of them in one function: `occurs`, testing every link of an article (thousands) against every kept sentence with a fresh Unicode regex, two million tests in the suite. A lower-cased substring check before the regex, with the regex still deciding, took the suite to 0.8 seconds with the same 197 calls and the same row. The guess in the first draft of this note (sentence splitting, grading) was wrong; the profile was right. Under a model that takes a second a call this was invisible, and it is the kind of thing the replay loop is for.
- **What it does not cover.** The page's adapter is wrapped and the parity test checks its hooks, but no page suite has been recorded yet; a page cache is its own directory because the weights differ. The code suite cannot replay in CI because the corpus lives outside the repository. Ollama's prompt cache is known to perturb a pick when the preceding calls differ, so a cache populated in one order is authoritative for that order; a change that reorders calls will miss more than it touched, and that is correct.

## 2026-09-19 · milestone 5, day one: the walk over a codebase

Milestone 5 of [ROADMAP.md](../ROADMAP.md). A directory of files as a second source behind the wiki driver's interface (`src/files.js`, `scripts/corpus.mjs`): a file is an article, its declarations (top-level functions, classes, methods; a document's headings) are sections, its lines are sentences, and the declarations a line uses that the corpus declares are its links, offered as "name (path)". No AST: a declaration is a line that looks like one. The first corpus is MangoDB (`../mangodb`: 55 files of source and docs, 568 declared names). Four briefs in `evals/seeds-code.json`, 42 topics, chosen where memory should be low: how writes are persisted, how a find with a filter is evaluated, how indexes work and when they are used, how an aggregation pipeline runs. Rows in Node only; the page does not read files yet.

| model | tangle (topics of 42) | read anywhere | one node | memory | nodes · calls · tokens · seconds |
|---|---|---|---|---|---|
| 1.7B | **14** (5 / 2 / 6 / 1) | 25 | 7 | 9 | 28 · 122 · 40k · 19 |
| 4B | **11** (2 / 2 / 4 / 3) | 24 | 2 | 8 | 45 · 164 · 47k · 66 |
| 8B | **12** (2 / 3 / 3 / 4) | 31 | 3 | 9 | 42 · 167 · 53k · 97 |

Per brief: persist (9) / find (11) / indexes (11) / aggregate (11). Rows at fc81ce1 in Node through Ollama, the corpus `src/` only. The graph beats one node and memory at every size, by less than over Wikipedia, and reads two to three times what it keeps: what it reads is most of the rubric at every size, and the sentence pick over lines of code keeps a third to a half of it. That pick is the frontier.

**Memory is worthless here, and confidently so.** Asked from memory how MangoDB persists writes, 1.7B wrote of a journal, a write-ahead log, file-based replication and snapshotting, none of which exist: 0 of 9 topics. The graph read its way to the temp file and the rename, the index sidecar file and the lazy index build. This is the overflow set by construction: a corpus no model has seen.

**What reading the first profile found, in the order found, each a code fault fixed the same hour.**
- The first run blocked at the first step: shown eight file paths with a line from each, 1.7B said none, and no path shares a content word with a brief, so the none was honoured and nothing was read. The search had the right file first. A ranked search's first hit is read when the model says none (a file search is ranked by content; Wikipedia's first hit is not).
- No child hopped. The check that a hop's article "says something about the subject" wanted the brief's words in the callee's text, and a callee rarely restates its caller's subject; the same test filtered every line of a hop child out. Over code a link comes from a line that used the declaration, so it is on subject by construction; both tests pass for file records. Then a hop to another method of a file already read was refused, because a hop never re-reads an article; over code the unit is the declaration, and that rule now applies to the declaration.
- A hop went to the collection's `rename` method from the comment "// Atomic write: write to temp file, then rename", and its paragraph was about namespace validation. A line of code names a link by using it (a call, a member, a type argument, a code span), not by containing the word; and a name the file imports from outside the corpus ("rename" from node:fs) is that import when called bare, even if a method shares the name.
- "MangoDB" was the subject of every brief, so the search looked for it and the hop filter demanded it. The corpus's own name is neither a search token nor a brief's subject, and a brief's framing words ("tell me about") are not search terms, which also turned "Tell me about coral bleaching" into the search "coral bleaching" over Wikipedia.
- A kept line can be shorter than a finding is allowed to be ("export class Store"); the lines after it in the same read come along, verbatim and cited.
- A brief's root fanned out only after keeping something from the lead, and a file's header can be one line ("Common types and interfaces for MangoDB"): the find brief blocked at its root. A brief's root now hands its sections down regardless.

**Two prompt experiments, both lost, both recorded.** Wordings that named what the model was looking at (numbered lines from a source file; the declarations of a file; the files a search returned) were tried at 1.7B in four combinations on the four briefs. The section wording halved the graph: 1.7B picked one declaration and said none, 42 topics fell from 18 to 12. The article wording sent the persist brief to the index manager instead of the collection. The sentence wording changed one topic. None beat the brief's own wording, so the asks are unchanged and the code variants were removed. Second, the lead of a code file was tried as the header comment alone, so that a profile would open with what the author says the file is for rather than three signatures: 1.7B then kept less of the file's shape and chose worse sections, 18 to 13. The signatures stay. Both are the pattern of the first two days over Wikipedia: the prompt loop plateaus fast, and the walk's shape decides the row.

**What the profiles are.** Seven or eight paragraphs, every line cited to a file and line range, most of them JSDoc summaries and inline comments, with the signature they describe; the model prefers a comment to the code below it, which for a reader is right and for a rubric of identifiers is not. A JSDoc `@example` line is kept as readily as a `@description`, and an example is not a finding. Sections were chosen by name alone, and 1.7B chose `bulkWrite` and `insertOne` for persistence where `writeDocuments` is the answer; 4B chose `RangeBounds`, `IndexScanPlan` and `extractRangeBounds` for how indexes work; 8B chose a barrel of re-exports for aggregation and read eight lines of exports. So each declaration now carries the first line of its comment, shown beside its name in the section ask as a search snippet is shown with a title (the walk-6 fix, again): what 4B and 8B read went from 10 and 13 topics to 24 and 31, and what they kept did not move. The bottleneck moved from the section pick to the sentence pick, where it belongs.

**Hops follow calls.** With comments kept, the kept lines use nothing, so no child hopped; over code the hops are the declarations the section read calls, ranked as before by how many reads name them. 4B then opened thirteen hops for the aggregation brief across seven files and cited eleven; 8B six. The reserve holds; the profiles grew long and the topics did not, which is the same coverage-not-understanding the observer named, now over code.

**The parser, test first.** After the last of those runs the loop changed, at John's asking: the faults were code's, in classes, and each class can be tested without a model. Two fixture files with the shapes MangoDB happens not to have (`test/fixtures/corpus-shapes`): a class body at four spaces found no methods at all; a field holding an arrow function, a getter, a generator, overload signatures and a decorator were not declarations. Six tests, all failing, then a parser split into declarations, sections and lead that passes them and finds the same 44, 19, 38 sections in MangoDB's files as before. The three faults still open, each a case for a node eval rather than a code fix: a JSDoc example kept as a sentence, a comment preferred to the code beneath it, and 4B saying none to most lines.

**Cost.** A 1.7B profile over MangoDB is two to twelve nodes, ten to fifty calls, ten thousand tokens and a few seconds in Node; 8B an order of magnitude more time for the same topics. That is the number to set beside the warm-graph row when it exists.

## 2026-09-19 · walk-14: a parent no longer judges its child's finding

An observer's synthetic reproduction on 3b3daac, run and confirmed before anything was changed: a question node with one resolved child is shown the child's finding as one more sentence ("a finding below"), the sentence pick says none, and the "nothing left to judge" fallback resolves the parent with that finding anyway. A rejected finding became the parent's answer, and the trace shows both the none and the resolution.

**How often, and how it really behaved.** A scan of the recorded runs (`evals/results/runs`, 2026-09-18) finds 41 parents resolved by that fallback with a finding equal to their children's. On about 16 the model had said none over the finding first; on about 9 it picked the finding and then read on for more, which added text in two cases; on the rest it was never asked at all, because a child's finding that is one kept sentence is in the run-wide kept set and the pool filtered it out before the pick. So whether the model was consulted depended on whether the child had kept one sentence or two, and its answer changed nothing either way. At 14B every chain parent on the Dead Sea and sky seeds resolved without a pick.

**The rule, made one rule.** README already said it: when the children are settled, the parent's answer is what they found. The split and the brief did that by code, with no pick, and only the model-asked question consulted the model and then ignored it. walk-14 resolves every parent with settled children the same way, by code, traced as the harness's, and a child's finding is no longer a sentence candidate: a finding is not evidence, and a pick over it was never honoured. A question whose handed-down question blocked still judges its own excerpts again and may read on or ask another. Pinned as three tests, one of them the observer's script with a model that throws if asked.

**The alternative, not taken.** Honour the none: a parent that rejects its child's finding blocks, with the finding visible under it. That is more honest about the one chain where the child answered a narrower question than the parent's, and it would leave the root blocked on every chain in the recorded runs, where the child's finding was the only answer the run had. Whether a narrower answer is an answer is a judge's call, not a rubric's; the rubric counts touches and cannot see the difference. Recorded here so that a judge, when there is one, can be pointed at these 41 parents.

**The rows do not move.** Rerun on the base seeds after the change: Node through Ollama 15 / 12 / 12 / 16 of 23 at 1.7B / 4B / 8B / 14B, the page 10 at 1.7B, every one identical to its walk-12 row. Calls at 4B, 8B and 14B are identical too (69, 61, 96): those parents were never asked. 1.7B drops from 43 calls and 15 lookups to 38 and 13, the picks over "a finding below" and the reading-on after them, for the same findings. The change removes a call whose answer was ignored and nothing else.

## 2026-09-18 · the bridge: the same walk in Node, and the ladder past 8B

Milestone 4 of [ROADMAP.md](../ROADMAP.md). The walk now runs in Node with no browser (`scripts/node-lab.mjs`) against any OpenAI-compatible server through a second model adapter (`src/endpoint.js`), reading Wikipedia through the same driver as the page and the same recording (`scripts/recording.mjs`, the files the page dumps). `scripts/eval.mjs runs --endpoint <url> --model <id>` runs a suite in Node; `scripts/node-eval.mjs --models endpoint:<id>` runs the node evals there. Ollama (0.34, a standalone binary; Homebrew needs an Xcode licence this machine has not accepted) serves Qwen3 1.7B to 32B as GGUF q4_K_M; LM Studio, which John has installed, serves Qwen3 4B and 30B-A3B as MLX 4-bit on port 1234.

**Parity.** `test/parity.test.js` gives both runtimes the same seed, the same recording and the same scripted model (`src/scripted.js`: always the first real choice offered) and asserts the same nodes, evidence and trace. Three shapes: one node that reads and picks (19 trace events); a two-subject question split by code and gathered (3 nodes, 43 events); the Turing brief with sections, hops and hops' hops (28 nodes, 512 events). Identical in all three. What differs between the runtimes is how the model is called and how Wikipedia is read, and that changes nothing.

**Speed.** The base suite at 1.7B takes 12 seconds in Node against about a minute in the page; 4B 75 s, 8B 96 s, 14B 372 s. Nothing is compiled per schema (the page pays ~22 s for each new grammar, webllm.js) and the server caches the prompt prefix, so an ask at 1.7B answers in 100–300 ms.

**The base seeds, one more column each.** Tangle through Ollama: 15 / 12 / 12 / 16 / 17 of 23 at 1.7B / 4B / 8B / 14B / 32B; the page's own rows, rerun at walk-12 the same night, are 10 / 17 / 14 (walk-7: 10 / 17 / 16). Through LM Studio (MLX): 16 at 4B and 16 at 30B-A3B, each with the Dead Sea seed lost to an error (below). Memory through Ollama: 18 at 8B, 21 at 14B, 19 at 32B (the page: 20 at 8B). From 1.7B to 32B, reading moves two facts and memory climbs seven: the base seeds are memorised questions, and a bigger picker has nothing to add on them. A Node row is its own column: the weights are quantised differently, and a differently quantised 4B chose *Coral reef* over *Coral bleaching* for a bleaching question and *Sky blue*, the colour, over *Diffuse sky radiation*. It is not a weaker picker. The node evals through Ollama are level with or above the page per ask: sentence list 19 / 21 / 22 of 23 at 1.7B / 4B / 8B (page 18 / 20 / 19), check 20 / 19 / 23 (17 / 21 / 23), article snippets 10 / 11 / 12 of 12 (9 / 9 / 12), section list 15 / 14 / 14 of 15 (14 / 14 / 14). The base seeds are the memorised questions LEARNED.md warns about; they were run because the roadmap said to expect the page's rows, and they say the runtime is sound, not that size moves anything here.

**The briefs past 8B.** Profiles 25 / 27 / 30 of 35 and overflow 24 / 24 / 26 of 30 at 8B / 14B / 32B in Node, against the page's 27 and 27 at 8B. 32B's four profiles are the best row on that set: Turing 8 of 8, the reef 9 of 10, in twenty minutes. On the briefs a stronger picker does move the ceiling, by three topics between 8B and 32B on the same candidates; on the question seeds it does not. That is the answer milestone 7 was going to buy with an API key.

**An observer's reading, verified.** Two of the recorded 1.7B Rosetta profile's paragraphs are cited and off the brief: "Data from the Juno mission showed that Jupiter has a diffuse core…" (a hop to *Jupiter*, kept because "mission" is a word of "Rosetta mission") and "For an elliptical system, the result is a rosetta orbit" (a hop to *Orbit*, kept for "rosetta"). 8B's profile has the Juno paragraph too. The on-subject test for a hop's sentence accepted any content word of the subject, in any case. walk-13 requires one of the subject's capitalised words, with its capitals ("Rosetta", "Turing", "Hubble"), and falls back to content words only for a subject with none ("coral bleaching"); the about-read in wiki.js uses the same rule. Rerun at walk-13, 1.7B's overflow row is 24 of 30 as before, the Rosetta profile 8 of 10 with the Juno and "rosetta orbit" paragraphs gone and every hop cited (21 of 21); one new hop, to *Rosetta (Vangelis album)*, passes the new test because the album's article names Rosetta with a capital, which is the next case for a judge or a disambiguation rule. The same observer found that the first search went to Wikipedia before the user approved anything, against the page's promise; it asks first now, and a refusal blocks the node with nothing sent. Two of the observer's points stay open and are right: the graph reads 56k tokens on the overflow briefs at 1.7B against 10k for one node, and a control with an equal budget would say how much of the gain is the shape and how much the reading; and the topic rubric counts touches and cannot penalise a cited paragraph that does not belong, which is the judge's job.

**Read in the traces.**
- 14B says none more often than any smaller size and then asks a question; on the Dead Sea seed four nodes in a chain each read *Dead Sea* again, two of them the same section (*Receding shoreline*, *Extraction*) their parent had read, before the last one kept a sentence and every parent inherited it. The walk forbids a hop from re-reading any article the run has read; it does not forbid a question child from re-reading its parent's. Recorded, not yet fixed: milestone 4 changes runtimes, not the walk.
- LM Studio refused a section ask on the Dead Sea: `enum must NOT have duplicate items` — the article has two sections with one heading, and the page's grammar had let the duplicate pass. Fixed in the schema builder (an enum is a set, asks.js); the two LM Studio rows are rerun below.
- Ollama's OpenAI route ignores `think: false` and spent a sentence pick's 24 tokens on reasoning with no content; `reasoning_effort: "none"` stops it. LM Studio emits no reasoning tokens with the soft switch alone.

## 2026-09-18 · walk-12 and the overflow briefs: the graph against both controls

Two changes after walk-11 and one new seed set. A hop child may hand down one level of hops of its own, with a reserve so that every node still open keeps room for its hops; and a name is offered only after code has read what its article says about the brief's subject (`hop_checked` in the trace), so *Astronomy* and *Star* are never on the list. The first cut lost topics at 8B to the profile cap — 6,000 characters dropped the last three sections of the Turing profile, conviction and apology among them, under hops beneath the first three — so over the cap a profile now sheds hop paragraphs before it sheds a section, the cap is 8,000, and a heading whose own text is under 600 characters ("Career and research", blocked at every size since walk-8) is not offered. Rows at 14ddbc1 and 0f58764 in [results.md](results.md).

| set | model | tangle (topics) | paragraphs · nodes · s | hops cited / read / chosen | one node | memory |
|---|---|---|---|---|---|---|
| profiles (35) | 1.7B | **26** | 61 · 64 · 168 | 35 / 36 / 36 | 15 | 15 |
| profiles (35) | 4B | **23** | 50 · 73 · 321 | 34 / 51 / 51 | 16 | 10 |
| profiles (35) | 8B | **27** | 62 · 94 · 635 | 47 / 66 / 66 | 13 | 20 |
| overflow (30) | 1.7B | **24** | 41 · 41 · 138 | 20 / 20 / 20 | 18 | 5 |
| overflow (30) | 4B | **25** | 34 · 44 · 228 | 16 / 25 / 25 | 18 | 12 |
| overflow (30) | 8B | **27** | 37 · 48 · 372 | 18 / 27 / 27 | 16 | 17 |

Nodes and seconds summed over the set's briefs. 0.6B: memory 2 of 30 on the overflow set; it keeps nothing under a brief.

- **On both sets the graph beats one node and memory at every size from 1.7B up.** The overflow briefs were chosen where memory is weak — the Antikythera mechanism's decoders, what Rosetta found, who is restoring the Aral Sea — and there the gap is widest: 1.7B names 5 topics of 30 from memory and reads its way to 24. This is milestone 3's exit condition met: a task a person would ask, on which the shape of the work beats one context at every size.
- **The recursion holds its subject.** With hops handing down hops, an 8B Turing profile is 28 nodes over 22 articles in 17 paragraphs, and every sentence names Turing: the bombe's design and *Victory*, the Polish bomba, Harry Huskey and the ACE, Turing patterns, the 1952 plea, the 2009 apology. The Aral Sea profile at 1.7B reaches the Kok-Aral Dam, the North Aral Sea and the World Bank from the lead's links. The on-subject filter, the run-wide read set and the kept set are what keep 94 nodes from drifting; the model never sees more than one window.
- **The check before the offer is worth more than the pick after it.** At 1.7B every hop opened is cited (35 of 36; 20 of 20). At 8B a third of hops opened are found empty: the article says something about the subject, the child is offered those sentences, and 8B's checked pick says none to all of them. 8B also fills every hop slot where 1.7B says none. The two sizes make different mistakes: 1.7B under-reaches, 8B over-reaches and then rejects.
- **The cap is a design decision, not a limit.** Which paragraphs a profile sheds when it is too long decides which topics it keeps; dropping from the end dropped the sections the article puts last, which for a biography are the end of the life. Hop paragraphs first, longest child first, is one reasonable rule; the story view should show what was shed.
- **Where the topic rubric stops being useful.** The Aral Sea brief is 10 of 10 at every size because its lead names nearly every topic, and 4B's Turing profile is 4 of 8 at three builds running because its section picks skip the conviction and the apology, which no hop reaches. The rubric counts touches; it does not see that 8B's seventeen paragraphs are specific and in order. A judge is the reference model's job.
- **Not claimed.** That one node *cannot* hold the text: under its budget the flat control reads three sentences of one article and stops, as it always has. The claim is that the graph reaches what one node does not, on every brief tried, at every size that can pick a sentence.

## 2026-09-18 · walk-11: children from what a node read

Milestone 2 of the roadmap: the graph should grow from what its nodes read, not from templates. In walk-11 a brief's child, having kept its sentences, is shown the things they name — the article's own links that occur in those sentences (a new Wikipedia request per article, cached like the rest), ranked by how many excerpts in the run name each, minus anything read or opened anywhere — and picks up to two, or none. Each pick is a child: the same brief with that focus, which reads the part of that article that names the brief's subject and keeps only sentences that do. A sentence kept anywhere in the run is never offered again. Rows in [results.md](results.md) at bc2e15a (first cut) and 71ee567.

| model | walk-10 | walk-11 first cut | walk-11 (hops read the part about the subject) | one node | memory |
|---|---|---|---|---|---|
| 1.7B | 21 · ¶28 · hops 5/12/24 | 22 · ¶36 · 5/12/12 | **26** · ¶42 · 14/17/17 · 45 nodes · 119 s | 15 | 15 |
| 4B | 17 · ¶19 · 4/8/14 | 17 · ¶23 · 5/18/19 | **22** · ¶31 · 13/23/24 · 44 nodes · 194 s | 16 | 10 |
| 8B | 22 · ¶24 · 8/15/19 | 20 · ¶44 · 17/42/42 | **26** · ¶49 · 22/41/42 · 70 nodes · 464 s | 13 | 20 |

Topics of 35; hops cited / read / chosen; nodes summed over the four briefs.

- **The pick beats the name.** walk-10's free-text hop was the weakest ask (4B named the subject itself in two of three). Offered the article's links that occur in what it kept, every size picks things worth a child: the *Bombe*, *Cryptanalysis of the Enigma*, the *Bendix G-15* and Harry Huskey, *The Chemical Basis of Morphogenesis* and Turing patterns, *Chemical castration*; for Hubble the *Hubble constant* and the Hubble tension, *Black hole*, *Eris*, *MACS 2129-1*. The profiles are two to three times longer and draw on eleven articles instead of six.
- **What a hop reads decides whether it is worth anything.** In the first cut a hop child read its article's lead and kept only sentences naming the subject; seven of ten leads had none (*Gordon Brown*, *Stored-program computer*, *Astronomy*), so half the children blocked and the topic count did not move. Reading the part of the article that names the subject instead — the lead if it does, else the first section that does, code's choice — took hops cited from 17 to 22 of 42 at 8B and from 5 to 14 of 17 at 1.7B, and topics from 20 to 26. The hop is only as good as the sentence it lands on.
- **Junk in a list is a code fault, not a model fault.** The first list offered "Turing (disambiguation)", "February", "German", "Section", "Thousands", "Murray"; 8B picked "Hubble (film)" over *Astronomy*. Links only when the article has them (the capitalised-phrase fallback ran beside them), never a disambiguation page, a month or a nationality. Generic links remain (*Astronomy*, *Universe*, *Star*, *Proceedings*) and are chosen and found empty; the frontier ranking puts them first because every excerpt names them. That is the next filter to find.
- **The root's lead is the profile's summary, and three picks lost it.** The Hubble lead holds the launch, the flawed mirror and the servicing missions; the root kept none of them and the sections chosen were all discoveries, as the brief asked. A brief's root now keeps six sentences, which also lifts the one-node control from 8 to 13–16: the control is a fairer one for it.
- **1.7B is level with 8B on topics at a quarter of the time**, with fewer, better hops (14 cited of 17 chosen; 8B chose 42 and cited 22). 8B fills every hop slot; 1.7B says none more often. The topic rubric does not reward the extra paragraphs, and reading them, 8B's are mostly on-subject and specific. A judge for that is the reference model's job (roadmap, milestone 7).
- **The graph still stops short of its budget.** Hop children are leaves, so a profile is at most 1 + 6 + 12 nodes; the exit condition for milestone 2 is a forty-node profile. Letting a hop child hand down children of its own, with a reserve so late sections are not starved, is the next step. Also seen: a kept sentence in a hop child that names the brief's subject word but not its subject ("Las Cumbres Observatory's telescope" for the Hubble Space Telescope); "Career and research" chosen and blocked at every size.

## 2026-09-18 · four briefs, three columns: the profile benchmark

The brief became a benchmark: four subjects from four fields, each with a topic list checked against the live article (`evals/seeds-profile.json`, 35 topics), and a grader for the profile's shape. Three columns — the walk, the walk on one node, the model alone with a profile prompt — at every size, all at walk-10 (rows in [results.md](results.md), `seeds-profile`).

| model | tangle (topics of 35) | one node | memory | tangle: paragraphs · hops cited / read / chosen |
|---|---|---|---|---|
| 0.6B | 0 (three roots blocked) | — | 7 | — |
| 1.7B | **21** | 8 | 15 | 28 · 5 / 12 / 24 |
| 4B | **17** | 8 | 10 | 19 · 4 / 8 / 14 |
| 8B | **22** | 8 | 20 | 24 · 8 / 15 / 19 |

- **The graph beats one node and memory at every size from 1.7B up.** On the question seeds memory won from 4B up; here the walk leads it at 1.7B (21 to 15), 4B (17 to 10) and 8B (22 to 20), and every one of its topics sits in a sentence read from Wikipedia and cited. The one-node walk is level at 8 at every size: three lead sentences, whatever the model. This is the first table where the shape of the work is doing what the thesis says it should.
- **One column was reading the wrong article.** Hubble scored 1, 1 and 2 of 8. Wikipedia's search for the whole brief minus its question words ("Tell me about Hubble Space Telescope and has discovered") returned *Nancy Grace Roman Space Telescope*, *Edwin Hubble*, *STS-125* and never the telescope; 8B picked Edwin Hubble and wrote a cited profile of the astronomer. Code can see a brief's subject, so from 120c0fc a brief searches for it ("Hubble Space Telescope") and a hit whose title is the search term is read without an article ask at all.
- **The free-text hop is where the sizes part.** 8B cited eight hops of nineteen chosen, 1.7B five of twenty-four, 4B four of fourteen — and 4B's Turing children named "Alan Turing" (refused as read) or "Turing Test" and then chose *Alan Turing* from the hits. The Silk Road profile at 8B read five hop articles and cited one. walk-11 replaces the name with a pick: the article's own links that occur in the kept sentences, ranked by how often the run has met each.
- **0.6B keeps nothing under a brief.** It says none to every sentence of the lead and of two sections, then blocks with nothing read; the Great Barrier Reef root kept one sentence. The profile is out of its reach as the walk stands.
- **What the grader shows that a score would not.** 4B's section pick stops at three or four, so its profiles are four paragraphs to 8B's six and 1.7B's seven; 1.7B reads more articles than 8B (four, seven, two, three) and cites fewer of them. Duplicates are zero everywhere since walk-10.

## 2026-09-18 · the Turing test: a brief instead of a question

John's turn: stop asking the tiny agent questions it has memorised and give it a brief — "Tell me about Alan Turing and elaborate on the impact of his work." — and read what it writes. No rubric first; the faults become evals. Runs in `experiments/*turing*`.

| build | 8B | 4B | 1.7B |
|---|---|---|---|
| walk-7 (a brief treated as a question) | one node, one sentence | one node, three lead sentences | — |
| walk-8 (lead, chosen sections to children, one hop each) | 7 paragraphs, 14 nodes, 91 calls; one child chained seven model-asked questions into Prolog | 4 paragraphs | 25 nodes, error: a child hopped to *Chess* and fanned its sections into grandchildren |
| walk-9 (root-only fan-out, no model questions, on-subject hops) | 6 paragraphs, 40 calls; a hop re-read the Alan Turing lead | 4 paragraphs | error: the profile cites eleven excerpts, the validator allowed eight |
| walk-10 (hops never re-read, article order, deduped) | **6 paragraphs, 37 calls, 15k tokens** | 4 paragraphs, 23 calls | **7 paragraphs, 36 calls, 12k tokens** |

- **The shape is code's, and it holds at every size.** The model makes three kinds of choice: which sentence to keep, which section is worth a child, and what to hop to. Code reads the lead, hands each chosen section to a child that reads it first, joins the findings in the article's order, and never lets a child fan out or ask a question. Under that shape 1.7B writes a seven-paragraph cited profile; under the question-shaped walk it wrote nothing past the lead.
- **Every sentence is Wikipedia's, in Wikipedia's order, cited to its section.** That is the whole point against the closed-book column: a 4B model would write a fluent Turing essay from memory, and nothing in it could be checked. This one can be, sentence by sentence.
- **The hop was the weakest ask, and one sentence of prompt moved it.** Of fourteen hops across the three walk-10 runs, eight named "Alan Turing" (refused as known), two "Turing", one *The Chemical Basis of Morphogenesis* (read, two sentences added), one *round-the-house chess* (read *Chess boxing*, one Turing sentence kept), one *Turing test* (lost to the article pick). Told "not Alan Turing itself, which has been read", 8B hopped five times for five and cited four: *Computing Machinery and Intelligence*, the morphogenesis paper, the *Labouchère Amendment*, the *Alan Turing law* (`…-walk-10b`). 1.7B hopped six times without naming the subject and cited one; 4B still names it twice in three. A node eval for the hop is the next case set to write.
- **The section pick sets the profile's breadth.** 8B chooses six sections and stops at the cap; 4B chooses three and says none, so its profile has no war and no conviction. A floor, or a second round of picks once the first children resolve, is a code choice to test.
- **Faults found and fixed by reading the profiles, all in code:** a bibliography chosen as a section (skipped now); "Career and research" chosen though it is a heading with a short introduction (blocked, dropped from the profile; could be filtered by length); pick order versus article order; duplicated lead sentences; the eight-citation cap.

What to measure next, so the brief is a benchmark rather than a demo: paragraphs, distinct sections and articles read, hops that added a sentence, calls and tokens, and a topic list per subject (Bletchley, the bombe, the Turing machine, the ACE, the Turing test, morphogenesis, the conviction, the pardon, Manchester, early life) marked touched or not — reported, not passed or failed. Then three more subjects from other fields.

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
