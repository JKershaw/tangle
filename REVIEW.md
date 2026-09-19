# The foundations review

*A check of the code before a milestone builds on it: where patches have accumulated that fit one seed, one size or one source, and whether the shape is right to continue on. Done 2026-09-19 after milestones 5a and 5b, before 6 (actions). Three reviewers, one each for the walk, the sources and graph, and the harness and tests; this is the synthesis. The next one is due before the milestone after 6.*

## Verdict

The seams are right and proven: the model adapter (page and endpoint behind one surface, the replay wrapping either), the source driver (Wikipedia and files behind one call), the lab interface (page and Node behind one driver). Three things have accreted under them and each would fight milestone 6. About two to three days of refactoring, with the replay as the safety net, and then actions. Nothing here is a rewrite.

## What has accreted

**1. The walk decides by booleans.** `runWalk` is 575 lines with nine exits, and a node's kind lives in flags checked in ad hoc combinations: `split`, `fanned`, `readFirst`, `hopTo`, `brief && depth === 0`, `candidate.line`. Nine sites decide resolve, block or fan out; kept text is de-duplicated in two places with different normalisation; three sites turn the model's "none" into a read anyway. The kinds are already there implicitly (question, split parent, brief root, section child, hop child); they should be a `kind` field set at creation with a table of what each may do. A source's units (`line`) are threaded as a flag through candidates, padding, joining and the kept set; the driver should declare its profile once (units, join, minimum finding, ranked search, words to ignore) and the walk should read it. `subjectIgnore` is module-level mutable state that belongs on the run.

**2. The source contract is two implementations that agree.** The dispatch is copied verbatim between `wiki.js` and `files.js`, result objects are built by hand in six places, and the walk captures the whole driver result as the evidence record, so an evidence record's shape is whichever driver ran. The page's import then rejects a file-source export (kind and host checks), so a MangoDB run cannot be opened in the lab. A third source would fit only by imitating the same ad hoc fields. Wanted: one result shape from one constructor both drivers call, five named requests, evidence built by the walk from it, and an import that accepts any source.

**3. Run state lives outside the run.** The kept set, the frontier and the judged sentences are in WeakMaps keyed by run; the node fields the walk adds are outside `makeNode` and the import validator. An export loses them, a run cannot be resumed, and the page's retry after an error is only approximately the same run. Milestone 6 needs exactly what this forbids: a node waiting on named nodes, worktree state that survives a pause, a scheduler with a fairness rule (today it is first-open depth-first). The walk also resolves through the episode's validator with a `harness: true` flag to lift the episode's caps.

## Patches that fit one thing

- `CHECK_FOREIGN` and `isForeign` (confirm a pick when the title shares no word with the question): Wikipedia-shaped; over code it can never fire and silently does not.
- `UNWANTED_NAME` (months, nationalities, "Section"): one run's junk list; the structural rule, "a link whose article says nothing about the subject", already exists in `namesFor`.
- `SHORT_SECTION` (600 characters from one heading), `room()` doubling a brief root's sentences (one Hubble run), the barrel-file skip (one 4B incident), the three-letter token rule and the search weights (path ×5, names ×2, exact +100): hand-set, small, mostly unpinned.
- `variantsFor` picks the 8B check variant by a regex over model names; a size the adapter reports would do.
- The replay key omits the adapter's `extra` (the no-thinking fields) and the context window: a change to either would replay stale answers. Put both in the cache's directory name so existing entries stay valid.
- `files.js` is TypeScript-shaped and fails softly: Python, Go or Rust files get no sections and an invisible twelve-line lead. Lines as sentences is the wrong unit twice (a comment block becomes many sentences, a multi-line statement becomes fragments, hence `padded()`); this belongs to milestone 5's own loop.

## The harness and the tests

`eval.mjs` is one script doing six jobs; the closed, tools and walk branches each build a grade by hand. Wanted: one `column(seed, lab) → export` per mode, every export shaped like a run, graded once. About 150 lines of `grade.js`, the `visits` suite, `composing` mode, `buildContext` and `parseModelOutput` in `graph.js` and `createLiveGenerator` serve the retired one-prompt visit. `profileOf` reads the walk's trace vocabulary (`hop_chosen`, `hops_chosen`) and would zero the hop columns silently if a name changed. The lab interface exists only as a comment; `eval.mjs` reaches past it. Result files are named by commit and collide within a commit. The tests cover the walk's rules well by scripted walks; live rows alone cover the sentence pick's quality and ranking over real link lists; there is no golden graph, and the replay now makes one cheap.

## The plan, in order

Each step lands with the four suites replaying at 1.7B with zero misses and identical rows, which is the test that nothing moved.

1. **A golden-graph test and a complete replay key.** walk-15 on the three parity seeds and one MangoDB brief, from the recording and the model cache, asserting node count, statuses and cited titles. Then the rest is safe.
2. **One result shape** (`src/source.js`): five requests, one constructor, evidence built by the walk, import accepting any source; a MangoDB export opens in the page.
3. **Run state into the run**: kept, frontier, judged and the node fields as serialisable fields; export mid-run, reimport, finish.
4. **Node kinds and one resolution path**: a `kind` with a table; `resolveWith` and the settled-children block become one `gather`; the source profile replaces the `line` flag; `subjectIgnore` moves to the run. Then drop `UNWANTED_NAME` and `CHECK_FOREIGN` if no row moves.
5. **Columns in the harness, the episode retired**: `columns.mjs`, `eval.mjs` grades once, the lab interface written down, the `visits` suite and `composing` mode deleted (their rows stay in the record), the page bundle smaller.

Not before milestone 6: the grader's fact form for a test result (arrives with the first action seed), the code unit and the search weights (milestone 5's loop).
