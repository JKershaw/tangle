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

**Simulation** replays scripted model responses so you can see the mechanics without a model. Three scenarios are worth a minute each: *The parent asks again* (children resolve, the parent is revisited and asks one more question before it will answer), *A source is unavailable* (one leaf blocks; its parent runs again with what it has, and the root still resolves) and *Repeated questions* (a question that keeps re-asking itself until it hits the depth limit).

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
scripts/           lab.mjs drives the built page; live-run.mjs records one run; eval.mjs runs the
                   eval suites; grade.js holds the graders; summarise.js reads an export
evals/             micro-eval cases, benchmark seeds with rubrics, the Wikipedia recording, results
experiments/       exported runs and notes, committed next to the code that produced them
docs/index.html    the built page, served by GitHub Pages
BRIEF.md           the original design brief the project is built to
PLAN.md            the eval-driven plan for pushing tiny models further; PROGRESS.md logs against it
ROADMAP.md         the milestones from the pocket lab to a self-building agent, and what verifies each
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

Live mode first ran on 17 September 2026. The first day's failures (all in `experiments/`, raw model output quoted, each pinned as a fixture in `test/fixtures/`) reshaped the harness: 0.6B wrote its own evidence, decomposed to the depth ceiling, and answered a Dead Sea question with a fully cited finding about the Aral Sea; 1.7B read a two-sentence lead 79 times. The one-prompt visit that asked the model for five decisions at once was measured and replaced (PLAN.md, *The turn*) by the walk: one decision per model call, the model only ever picking from things code prepared, and a finding that is the chosen sentence verbatim.

Since then the project has a measuring stick. [PLAN.md](PLAN.md) sets out three layers of checking: unit tests, fixture replays of real model outputs, and evals that run the model. Node evals (`evals/node/`) re-run one ask at a time across the model ladder; a benchmark (`evals/seeds.json`, `evals/seeds-graph.json`, `evals/seeds-profile.json`) scores whole runs for facts stated, facts supported by a cited excerpt, and cost, against three controls: the same walk on one node, a one-node model that writes its own answer, and the model alone with no tools. Wikipedia is recorded and replayed so a harness change is the only variable. [PROGRESS.md](PROGRESS.md) holds the scoreboard, [evals/readings.md](evals/readings.md) says what each round meant, and [ROADMAP.md](ROADMAP.md) says what comes next.

## The frontier

What is known to work, what is known to fail, and what is next, as of walk-12 at 0f58764 (18 September 2026). Kept current as the numbers move.

**Works, measured.**
- A node finds the sentence that answers a question in every node-eval case from 1.7B up; every walk finding is supported by construction, and no walk row has ever stated a fact its evidence did not hold. The one-node model that writes its own answer states more on easy seeds and invents on hard ones.
- Decomposition pays only where code can see the join: a two-subject question split by code leads its one-node control at every size on the seeds no single article answers (16, 15, 14 against 12, 12, 12 of 30). Model-asked sub-questions drift and are refused as paraphrases far more often than they help.
- A brief ("Tell me about Alan Turing and elaborate on the impact of his work") becomes a cited profile: the lead, one child per section the model chooses, and under each up to two levels of children opened on the things the kept sentences name, each reading the part of that article that names the subject. Up to 28 nodes and 22 articles in 17 paragraphs at 8B, every sentence Wikipedia's and cited. On four profile briefs (35 topics) the graph touches 27 / 23 / 26 at 8B / 4B / 1.7B against 13–16 for one node and 20 / 10 / 15 for memory; on three briefs chosen where memory is weak (30 topics) it touches 27 / 25 / 24 against 16–18 and 17 / 12 / 5. The shape beats both controls at every size on every brief set tried.

**Fails, measured.**
- Memory beats reading. From 4B up the model alone names more rubric facts than any reading mode on the question seeds, because those questions are ones it has memorised. Seeds have to be chosen where the closed-book score is low, or they measure recall.
- 8B fills every hop slot and rejects a third of what its hops find; 1.7B opens fewer and cites every one. Neither reaches the forty-node budget: the models choose fewer hops than the harness allows. The topic rubric counts touches and cannot see that a longer profile is better or worse; a judge is missing.
- What a profile sheds when it is over its cap decides what it keeps. Hop paragraphs go before sections now; the earlier rule dropped a biography's last sections first.
- 0.6B answers "none" to every sentence under a brief and blocks; it is below the floor for profiles. A free-text ask is the weakest kind at every size (the old hop named the subject itself at 4B); a pick from a code-made list is not.
- Section choice sets breadth. 4B stops choosing after three sections; a short parent heading ("Career and research") is chosen and blocks.

**Next (roadmap milestone 4).** The bridge: the same walk in Node against an OpenAI-compatible endpoint, with a parity test against the page, so the ladder can extend to Qwen3 14B and 32B through Ollama. Then read-only tools over files, with this repository as the first corpus. The order and the exit conditions are in [ROADMAP.md](ROADMAP.md).

Small models will decompose badly, repeat themselves, misread evidence and resolve too early. Keep the exports; that is the experiment.

## Lineage

This is the third iteration of the idea. The WebLLM adapter and Wikipedia tool descend from [Browser-agent](https://github.com/JKershaw/Browser-agent). The project's design brief — the rules it is built to, written for the agents helping build it — is [`BRIEF.md`](BRIEF.md); read it before changing how the harness works. The source bundle as originally delivered is preserved at the git tag `original-source`.

MIT licence. Wikipedia content remains attributed to its contributors under CC BY-SA 4.0; model weights are under their own licences.
