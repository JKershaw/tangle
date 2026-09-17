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

Prompt versions are in `src/episode.js`; grammar versions in `src/webllm.js`.
