# Experiments

Exported runs and notes live here, next to the code that produced them. Name files `<date>-<model>-<seed-slug>.json` with a matching `.md` (hardware, timings, observations) and `.png` (the map). `scripts/live-run.mjs` writes all three; `scripts/summarise.js` reads an export.

Every export records the model, prompt version, grammar version, sampling settings and every model input and output, so a run can be re-read without re-running it. The `.md` quotes raw model output for the observations that matter.

## 17 September 2026 — first live runs

Machine: Apple M1 Max, Chrome 152, WebGPU. Seeds: "Why does the water cycle keep going?" and "Why is the Dead Sea shrinking?". Each row is one change and what it revealed.

| run | model · prompt · grammar | outcome | what it showed |
|---|---|---|---|
| `qwen3-0.6b-water-cycle` | 0.6B · pocket-2 · flat | error | decompose with the questions written as prose in `reason`, ×3 identical |
| `…-water-cycle-2` | 0.6B · pocket-2 · per-action-1 | error | decomposed cleanly, then `resolved` with evidence it wrote itself |
| `…-water-cycle-3` | 0.6B · pocket-2 · per-action-2 | error | decompose ×9, never wiki, re-asked its own question to the depth ceiling |
| `…-water-cycle-4` | 0.6B · pocket-3 · per-action-3 | 14 resolved, 10 blocked | searched only where decompose was gone; 387 of 420 s were grammar compiles |
| `qwen3-1.7b-water-cycle` | 1.7B · pocket-3 · per-action-3 | blocked | the seed decomposed into itself six times, then blocked on "empty evidence" |
| `…-0.6b-water-cycle-5` | 0.6B · pocket-4 · per-action-4 | error | compiles bounded; cited labels 2 and 3 when shown only 1 |
| `…-0.6b-water-cycle-6` | 0.6B · pocket-5 · per-action-5 | root resolved | wiki-first works; one article, a correct half-answer, no decomposition |
| `…-1.7b-water-cycle-2` | 1.7B · pocket-5 · per-action-5 | error | found the article at once, re-read it nine times, never resolved, decomposed well |
| `…-0.6b-dead-sea` | 0.6B · pocket-5 · per-action-6 | root resolved | searched the whole question, found the Aral Sea, resolved with a fully cited answer about the wrong lake |
| `…-1.7b-dead-sea` | 1.7B · pocket-5 · per-action-6 | 8 resolved, 20 blocked | 79 reads of the Dead Sea lead; honest blocks (the lead never mentions recession); Aral Sea from memory, cited to Dead Sea excerpts |
| `…-4b-dead-sea` | 4B · pocket-5 · per-action-6 | root resolved | the best query ("Dead Sea shrinking causes"); a correct finding citing a two-sentence lead that does not contain it |
| `…-1.7b-dead-sea-2` | 1.7B · pocket-7 · per-action-6 · sections by name | 33 resolved, 1 blocked | never asked for a section by name; repeated "Dead Sea" 98×; 33 supported-and-wrong salinity findings; one output ran to the token cap in spaces |
| `…-8b-dead-sea` | 8B · pocket-7 · per-action-6 · sections by name | root resolved | asked for "Dead Sea / Receding shoreline" — the prompt's example named that section (fixed in pocket-9); the first correct, fully supported answer to a question no lead answers |
| `…-1.7b-dead-sea-3` | 1.7B · pocket-8 · section list on bare repeat | **40 resolved, root correct** | first full-graph root resolution: the list was enough at the third try; 59 section reads; two pass-ceiling retries |
| `…-1.7b-dead-sea-4` | 1.7B · pocket-8 · forced section pick | **40 resolved, root correct, no errors** | 44 picks (Receding shoreline 32, Extraction 12); the loop is gone; one answer found forty times |
| `…-0.6b-dead-sea-2` | 0.6B · pocket-8 · forced pick | "root resolved" | copied the prompt's example as its query and then as its finding — which exposed that the example named the answer's section |
| `…-4b-dead-sea-2` | 4B · pocket-8 · forced pick | root resolved | copied the example too; read the lead only; correct and unsupported again |
| `…-8b-dead-sea-2` | 8B · **pocket-9 (neutral example)** · forced pick | root resolved | lead, then chose *Receding shoreline* from the listed headings unaided; correct, specific, fully supported |
| `…-1.7b-dead-sea-5` | 1.7B · pocket-9 (neutral example) · forced pick | 32 resolved, 2 blocked, root waiting | the mechanism holds without the hint; two honest blocks freeze the root above 32 findings — the settled-children question, with a price tag |
| `…-1.7b-dead-sea-walk-1` | 1.7B · **walk-1** (asks, code sequencing) | root "resolved" | the raw question as search term found the Aral Sea; the pick took the Aral Sea's reason. Wrong lake, every number green |
| `…-1.7b-dead-sea-walk-2` | 1.7B · walk-1 · stripped search term · checked pick | root resolved | lead, no; *Receding shoreline*; the National Water Carrier sentence, verbatim. Five calls, five seconds |
| `…-qwen3-8b-turing-walk-7` | 8B · walk-7 · the brief "Tell me about Alan Turing and elaborate on the impact of his work." | root resolved | one node, two reads (lead, *Career and research*), one sentence: the Turing-machine sentence. The baseline a profile mode has to beat |
| `…-qwen3-4b-turing-walk-7` | 4B · walk-7 · the same brief | root resolved | one node, the lead only, three sentences (Turing machine, the ACE, "father of theoretical computer science"). Four calls |
| `…-qwen3-8b-turing-walk-8` | 8B · walk-8 · the brief as a profile: lead, six chosen sections, one child each | root resolved | the first profile: seven cited paragraphs (Turing machine and Bletchley; the stored-program idea; the ACE and *Intelligent Machinery*; the conviction; the 2009 apology; the bombe; morphogenesis), 14 nodes, 91 calls, 33k tokens. Faults: "Career and research" found nothing in its short section and chained seven model-asked questions into Prolog and symbolic AI; no child hopped (the hop sat behind the sentence cap); sentences in pick order |
| `…-qwen3-4b-turing-walk-8` | 4B · walk-8 · the same | root resolved | four paragraphs (lead; the 1934 dissertation; the ACE; morphogenesis): the section pick said none after three, so no war, no conviction. 18 calls |
| `…-qwen3-8b-turing-walk-9` | 8B · walk-9 · root-only fan-out, on-subject hops | root resolved | six paragraphs, 7 nodes, 40 calls, 17k tokens (half of walk-8). The morphogenesis child hopped to *The Chemical Basis of Morphogenesis* and added Turing patterns; the "Turing test" hop re-read the Alan Turing lead (already read by the root, not by the child) and duplicated it; paragraphs in pick order (apology before conviction). Fixed in walk-10 |
| `…-qwen3-4b-turing-walk-9` | 4B · walk-9 | root resolved | four paragraphs (lead; 1934 dissertation; the ACE; morphogenesis), 23 calls; every hop named "Alan Turing" and was refused as known; the section pick stopped after three, so no war and no conviction |
| `…-qwen3-1.7b-turing-walk-9` | 1.7B · walk-9 | paused on error | six children resolved (Wittgenstein; the conviction; Morcom and the 1935 paper; the ACE; round-the-house chess via a hop to *Chess boxing*; morphogenesis), then the root's gather failed: a profile cites eleven excerpts and the validator allowed eight. Fixed in walk-10 |
| `…-qwen3-8b-turing-walk-11` | 8B · **walk-11** (hop children from the article's links, first cut; from the profile suite, no map) | root resolved | eleven paragraphs, 17 nodes, 62 calls: the bombe's design, the Polish bomba, Harry Huskey, Turing patterns, the 1952 plea. Six hop children blocked: junk names offered (a disambiguation page, months, nationalities), children that found nothing on-subject reading on into "section none", a linked name searched for and lost to a sibling's article. All three fixed in code before the ladder ran |
| `…-qwen3-8b-turing-walk-10` | 8B · walk-10 · hops never re-read, article order, deduped | root resolved | **the essay**: six cited paragraphs in the article's order (Bletchley and the Turing machine; the bombe; the ACE and *Intelligent Machinery*; morphogenesis with a hop to *The Chemical Basis of Morphogenesis*; the conviction; the 2009 apology), 7 nodes, 37 calls, 15k tokens. Three of five hops named "Alan Turing" and were refused |
| `…-qwen3-4b-turing-walk-10` | 4B · walk-10 | root resolved | four paragraphs, 23 calls, 9k tokens; the section pick stops after three; every hop names the subject |
| `…-qwen3-1.7b-turing-walk-10` | 1.7B · walk-10 | root resolved | seven paragraphs from the smallest model that can do it: the lead; Morcom and the 1935 paper; the Wittgenstein lectures; the ACE; morphogenesis; round-the-house chess (a hop to *Chess boxing*, filtered to the Turing sentence); the conviction. 36 calls, 12k tokens |
| `…-qwen3-8b-turing-walk-10b` | 8B · walk-10 + the hop ask told "not the subject itself" | root resolved | six paragraphs, 49 calls, 20k tokens, and **five real hops, four cited**: *Computing Machinery and Intelligence*, *The Chemical Basis of Morphogenesis*, the *Labouchère Amendment*, the *Alan Turing law*. The Bombe hop was lost: the article pick said none over Bombe, Baked Alaska and Bombe glacée (a title equal to the query now overrides none) |
| `…-qwen3-4b-turing-walk-10b` | 4B · same | root resolved | four paragraphs; two of three hops still name the subject, the third ("Turing Test") lost to the pick |
| `…-qwen3-1.7b-turing-walk-10b` | 1.7B · same | root resolved | seven paragraphs, 44 calls, 14k tokens; six hops, none naming the subject; one cited (*Tractatus Logico-Philosophicus*, via "Wittgenstein") |
| `…-qwen3-1.7b-turing-walk-8` | 1.7B · walk-8 · the same | paused on error, 25 nodes | the "Chess" section child hopped to the *Chess* article and fanned its sections into grandchildren (chess boxing, tournaments, champions), which fanned again; "Articles" (a bibliography) was chosen as a section; the Wittgenstein lectures stood for *Career and research*. Every fault is code's: only the root may fan out, a hop's sentences must name the subject, bibliographic sections are skipped (walk-9) |

Prompt versions are in `src/episode.js`; the walk and its ask variants in `src/walk.js` and `src/asks.js`; grammar versions in `src/webllm.js`.
