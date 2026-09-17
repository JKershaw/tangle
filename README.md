# Tangle

**Can a very small language model understand something by asking itself small questions?**

Tangle is a research toy for finding out. You give it one question. It hands that question to a model that can see almost nothing else, and the model must do one of three things: answer it from evidence it has actually read, break it into smaller questions, or admit it is stuck. Every smaller question gets the same treatment, with a fresh, empty context. When the children are answered, the parent is asked again with their findings in hand. What grows is a graph of questions, and you can watch it grow.

**Try it: [www.jkershaw.com/tangle](https://www.jkershaw.com/tangle/)** — the simulation runs instantly with no download; live mode runs a real model on your own GPU, in the browser, with nothing sent to any server.

![A finished run: nine question nodes, all resolved, growing down from the seed](previews/water-cycle-simulation.png)

## Why

Large models answer questions in one long, linear pass, and they need to be large to hold the whole problem in view at once. Tangle asks whether the *shape of the work* can substitute for size: if every model call only ever sees one bounded question plus a few paragraphs of evidence, then a model with 600 million parameters, running on a phone, is not asked to do anything it is bad at. The open question is whether the pieces add up to anything — or whether error compounds at every hop and the graph fills with confident nonsense.

We don't know yet. That is the point. Tangle is built to make the behaviour visible rather than to hide it: repeated questions, awkward decompositions, branches that never resolve and findings that contradict each other are the data, and the harness is designed to record them before anyone is tempted to fix them.

## What you'll see

The page has two modes.

**Simulation** replays scripted model responses so you can see the mechanics without a model. Three scenarios are worth a minute each: *The parent asks again* (children resolve, the parent is revisited and asks one more question before it will answer), *A source is unavailable* (one blocked leaf leaves the whole chain above it unresolved) and *Repeated questions* (a question that keeps re-asking itself until it hits the depth limit).

**Local LLM + Wiki** is the real thing. Pick a Qwen3 model (0.6B to 8B), download it once, and the browser runs it on your GPU via [WebLLM](https://webllm.mlc.ai/). English Wikipedia is the only source the model may consult, and you approve each lookup — or allow them all for a run. Type any seed question and press Run.

Either way, tap a node to see its exact local context — precisely what the model was shown — and its raw responses. The whole run exports as JSON: every prompt, every output, every lookup, every finding, and which pieces of evidence each finding leans on.

## How it works

A **node** is one bounded question. It is `open` until visited, `waiting` while its children are open, and ends `resolved`, `blocked` or `error`.

A **visit** is one model invocation on one node. The model receives the question, the findings of any resolved children (as claims, not evidence) and up to five short excerpts of evidence it or its children have captured. Nothing else — no parent, no siblings, no history. It replies with one JSON object choosing an action:

| action | what it must include | what the harness does |
|---|---|---|
| `wiki` | a search term | fetches the article's lead as evidence and asks again; asking for an article already in context reads its next section |
| `decompose` | 1–3 smaller questions | adds them as children; the parent waits |
| `resolved` | a finding and the IDs of evidence it rests on | records the finding, rejects it if any ID was not actually shown to the model |
| `blocked` | a reason | marks the node blocked; ancestors stay unresolved |

The **harness owns the graph**. Models only propose; deterministic code validates every mutation and refuses invented evidence, over-long output, too many children or too much depth. Output is grammar-constrained to the schema, so the model physically cannot reply off-format — what it *can* do is reply with well-formed nonsense, and that is what the experiments are for.

The scheduler is depth-first and serial: the deepest open node runs next, and a parent is revisited only once every child has resolved. Safety limits: 40 nodes, 60 visits, depth 6, 4 model calls and 2 lookups per visit.

**Findings are not evidence.** A finding is what the model claims ("Evaporation and transpiration supply atmospheric water vapour"). Evidence is what was actually read (the *Water cycle* article, revision 1234, these 700 characters). The finding can be wrong; the evidence records what happened. "Resolved" is a model decision, never a guarantee of correctness.

## In this repository

```
src/graph.js       the harness-owned graph: run creation, scheduler, local context,
                   output parsing, validation, mutation, import validation
src/episode.js     one visit (the episode runner) and the system prompt
src/simulation.js  the scripted water-cycle scenarios and fixture evidence
src/wiki.js        the Wikipedia tool (HTTPS en.wikipedia.org only, timeout, byte cap)
src/webllm.js      device, storage and cache probes; the WebLLM engine adapter; model list
src/map.js         the graph map (layout, pan, zoom)
src/main.js        UI wiring
src/page.html      page template; the bundle is inlined at build time
build.js           esbuild bundle + inline -> docs/index.html (one self-contained file, ~6 MB)
test/              node --test suites, including one that drives the built page
scripts/           live-run.mjs drives a full run and records it; summarise.js reads an export
experiments/       exported runs and notes, committed next to the code that produced them
docs/index.html    the built page, served by GitHub Pages
BRIEF.md           the original design brief the project is built to
```

The whole app is one HTML file. Open `docs/index.html` from disk and the simulation works offline; live mode wants an HTTPS or localhost origin so the browser will cache model weights.

## Run it locally

Node 22 or later.

```
npm ci
npm test          # graph, episode, wiki and adapter tests, plus the built page in headless Chrome
npm run build     # rewrites docs/index.html
```

CI rebuilds the page on every push to `main` and refuses to deploy if the committed `docs/index.html` differs from a fresh build.

## Run an experiment

Experiments are driven by a script so that the export, a screenshot of the map and a notes file land in `experiments/` together.

```
python3 -m http.server 8765 -d docs --bind 127.0.0.1        # in one terminal

node scripts/live-run.mjs --mode live --model Qwen3-1.7B-q4f16_1-MLC \
  --seed "Why does the water cycle keep going?" \
  --out experiments/2026-09-17-qwen3-1.7b-water-cycle         # in another

node scripts/summarise.js experiments/2026-09-17-qwen3-1.7b-water-cycle.json
```

Live mode opens a headed Chrome (WebGPU is not available headless) and keeps model weights in a persistent profile at `~/.cache/tangle/chrome-profile`, so only the first run per model downloads. Use `127.0.0.1`, not `localhost`. `--mode simulation --headless --scenario revisit|blocked|repeat` runs a scripted scenario without a model.

Each run writes `<out>.json` (the export — everything the model saw and said), `<out>.png` (the finished map) and `<out>.md` (driver log, summary, and space for observations). Commit all three. The summariser flags what deserves a second look: repeated questions, lookups that found nothing, findings that cite only their children's sources, generations cut off mid-way.

Models available in the page, all Qwen3 at 4-bit: 0.6B (~0.4 GB download, runs on a recent phone), 1.7B (~1 GB), 4B (~2.5 GB) and 8B (~5 GB, ~5.7 GB of GPU memory). Same family, quantisation and chat template, so size is the only thing that changes between runs.

## Where it stands

Verified: the graph and episode logic under test; all three simulation scenarios in a real browser; export and re-import; the Pages deploy. Live mode with a real model was first exercised on 17 September 2026 — earlier builds were developed on machines without WebGPU and had never run it.

The first day of live runs (all in `experiments/`, raw model output quoted) reshaped the harness. In order:

- A flat response schema let Qwen3 0.6B answer `decompose` with its questions written as prose in `reason`. The grammar is now one variant per action.
- Given no evidence, it chose `resolved` and wrote its own evidence sentences. Now `resolved` exists in the grammar only when the context holds excerpts, and the citation enum is exactly the labels shown.
- It decomposed to the depth ceiling, re-asking its own question, and never searched. The ceilings (depth, node count, lookups) are now part of the context and the grammar, so a ceiling is a choice the model can see rather than a rejection it cannot.
- Every distinct schema costs about 22 s to compile in WebLLM; enumerating real evidence IDs made nearly every call a fresh compile. Excerpts are cited by positional label so a session compiles at most ten grammars.
- Neither 0.6B nor 1.7B connected `wiki` with the arrival of evidence until the prompt said so plainly. 1.7B then found the right article at once — and re-read it nine times without resolving; 0.6B resolved the water-cycle seed from one article and, on "Why is the Dead Sea shrinking?", searched for the whole question, found the *Aral Sea*, and resolved with a fully cited finding about the wrong lake.

What that run shows is the current frontier: the evidence rule is necessary and not sufficient. A finding can rest entirely on its excerpts and still answer the wrong question — 4B later did the reverse, a correct answer citing a lead that does not contain it. The summariser now flags words in a finding that appear in none of its cited excerpts. With sections readable by name, 8B asked for *Dead Sea / Receding shoreline* on its first move and gave the first finding today that is both correct and fully supported. 1.7B, given the same list, repeated the bare title 98 times — so a bare-title repeat now becomes a forced pick from the headings (one small model call with the headings as its grammar), and with that 1.7B resolved a 40-node graph with a correct root finding, no errors and no retries, reading *Receding shoreline* and *Extraction* on its own account. The remaining cost is repetition: one question asked a dozen times, because no node can see its siblings. The real outputs behind every one of these failures are fixtures in `test/fixtures/`, and `test/model-outputs.test.js` states what the harness does with each. Since then: asking again for an article already in context reads its next section, because both models kept re-requesting the same article — 1.7B read the two-sentence *Dead Sea* lead 79 times across one run and blocked twenty times, truthfully, on "insufficient evidence" while the answer sat in the Recession section. Open next: search queries from the smallest model, and whether a parent should be revisited once its children are settled rather than all resolved.

Small models will decompose badly, repeat themselves, misread evidence and resolve too early. Keep the exports; that is the experiment.

## Lineage

This is the third iteration of the idea. The WebLLM adapter and Wikipedia tool descend from [Browser-agent](https://github.com/JKershaw/Browser-agent). The project's design brief — the rules it is built to, written for the agents helping build it — is [`BRIEF.md`](BRIEF.md); read it before changing how the harness works. The source bundle as originally delivered is preserved at the git tag `original-source`.

MIT licence. Wikipedia content remains attributed to its contributors under CC BY-SA 4.0; model weights are under their own licences.
