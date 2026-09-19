# How we work

*The method behind the milestones, in plain English, for anyone (or any agent) starting a session on Tangle. [ROADMAP.md](ROADMAP.md) says where we are going, [PROGRESS.md](PROGRESS.md) says where the numbers are, [PLAN.md](PLAN.md) says how we measure, [LEARNED.md](LEARNED.md) says what the numbers taught, [BRIEF.md](BRIEF.md) is the design brief. This says how a day of work goes. Written 2026-09-19, after milestone 5's first day.*

## The rhyme

Tangle answers a brief by reading a little, choosing from what code prepared, keeping only what it can cite, recording what it saw before judging it, and growing only where the last step earned it. It turns out that is also how Tangle gets built. The same five moves repeat at every altitude: one model call, one node, one run, one session, one milestone. When a session goes wrong it is usually because one of the five was skipped at some altitude: the model was asked to compose, a fault was fixed before it was written down, a layer was built on one nobody had measured.

## The rules

These come from the brief and the plan and have held through fifteen versions of the walk.

- **The harness owns the graph.** Code decides the shape: what is read, what is offered, when a node stops, what a parent's answer is.
- **The model only selects.** Every call is one pick from a list code prepared. If code can do it, the model is not asked.
- **Findings are not evidence.** A finding is verbatim text with a citation to what was read. A child's finding is never offered as a sentence to keep.
- **Record strange behaviour before fixing it.** In [evals/readings.md](evals/readings.md), with the run that showed it, before the code changes.
- **Nothing is built on an unmeasured layer.** Every milestone has an entry, work, a way of verifying and an exit; the next does not start until the exit is met.
- **Determinism.** Fixed sampling, Wikipedia replayed, one variable at a time. A row moves only when the code moves; repeating a run is pointless; only more seeds widen a claim.
- **Tangle stays tiny.** One HTML file, adapters not subsystems, rules removed when their row no longer needs them.

## The loops, innermost first

Each loop is a way of finding out something at a cost. Use the cheapest one that can answer the question.

1. **The test loop, seconds.** Scripted walks over fixtures: the model's picks are fixed, the graph's shape is asserted. Every rule in the walk lands as one of these, and every fault found by reading becomes one before it is fixed. `npm test`.
2. **The replay loop, seconds.** A rerun of a suite with the model's responses cached by their exact context (`src/replay.js`, `evals/model-cache/`, since milestone 5a). Unchanged prompts replay; changed ones go to the model. The miss count is the blast radius of the change, and a row that moved with zero misses is a bug in code. A suite that replays end to end costs a second and no GPU, so it is the loop to run after every code change, and `--replay-only` is what CI runs. Populate a cache with one live run at a size; keep it committed.
3. **The text loop, minutes.** Run one seed live and read the output as a person would: the profile, then the trace. Write down each strange thing. Then sort the faults: code's (a candidate that should not have been offered, a rule that assumed the wrong shape) or the model's (a bad pick from a good list). Code's faults go to the test loop in classes, not one at a time. The model's faults become node-eval cases.
4. **The eval loop, minutes to an hour.** The benchmark: every seed set, every column (the graph, one node, memory, and soon the same model with the same tools), every size that fits. A change is kept when it lifts its target without lowering the rest. Prompt changes are measured here and mostly lose; the walk's shape decides the row.
5. **The architecture pause, an hour, after each text loop.** Step back from the faults and ask: what did the model just decide that code could have prepared or decided outright? Do the units (sentence, section, link) still fit the source? What shape should a node have for this task? The answers become code the model no longer has to think about, then the loops resume with the code tidied for the next change.
6. **The milestone loop, a day or two.** The roadmap's entry and exit conditions bound it. It ends with the row in PROGRESS.md, the reading in evals/readings.md, the date and commit on the milestone in ROADMAP.md, a commit and a push.

## What we have learned about working

- **Do not use the model to find bugs in code.** A day of milestone 5 was eight reruns at 1.7B, each fixing one fault. All eight were code's and all fit four classes that a fixture and a scripted walk cover in seconds. Run the model once, classify, test the class, fix, refactor, then run again.
- **Candidates beat prompts.** Showing a snippet with each search title fixed the article pick; showing a summary with each declaration doubled what 4B and 8B read over code. Rewording the ask to describe what the model is looking at was tried in four combinations and lost every time.
- **Where code can rank, code ranks.** A search over files is ranked by content, so its first hit is read when the model says none; Wikipedia's first hit is not ranked that way, so the model picks. Know which kind of list you are offering.
- **A source has units, and the walk assumes them.** A lead with something to keep, a section that is not a stub, a sentence of six words, a subject named by capitalised words. Each assumption broke on code and each was a code fix. When a new source arrives, list the assumptions first.
- **Relevance by mention is Wikipedia's; relevance by construction is code's.** A callee never restates its caller's subject. Over code a link is a use and is on subject because of how it was reached.
- **Read the trace before the score.** A row of 6 of 9 hid a hop into the wrong `rename`; the topic hit was in the off-brief paragraph. The rubric counts touches and cannot see that. Until there is a judge, the reader is the judge.
- **Keep the controls honest.** Memory beats reading on memorised questions and is worthless on a codebase it has never seen, which makes a codebase the cleanest overflow set. One node of the walk is still the walk's structure; the fair control is the same model with the same tools in one context at the same budget.
- **Cost is a first-class column.** Nodes, calls, tokens and seconds on every row. The question Harbour will ask is cost per correct unit, and the graph's answer is not yet good.

## A session's shape

1. **Orient.** README's frontier, the top of PROGRESS.md, the current milestone in ROADMAP.md, the latest entry in evals/readings.md, and the memory notes if you have them. Check `git status` and `git fetch` before assuming main's shape.
2. **Pick the milestone's next step**, the smallest one with a test or a row at the end of it.
3. **Run the loops** from the inside out. Never rebuild `docs/index.html` while a page suite is using it.
4. **Before stopping or compacting:** the row, the reading, the roadmap date, the commit and push, and a memory note of what is not derivable from the repository.

## Where things live

| document | holds |
|---|---|
| [BRIEF.md](BRIEF.md) | the design brief and its rules |
| [PLAN.md](PLAN.md) | how we measure: tests, node evals, the benchmark, the turn |
| [ROADMAP.md](ROADMAP.md) | the milestones, their entry and exit conditions, the loops in brief |
| [PROGRESS.md](PROGRESS.md) | the scoreboard and the log |
| [LEARNED.md](LEARNED.md) | what the numbers mean and how far this can go |
| [evals/readings.md](evals/readings.md) | what each round of runs showed, faults first |
| this file | how a day of work goes |
