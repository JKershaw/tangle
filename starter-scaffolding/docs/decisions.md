# Decision Log

This is a chronological record of methodological and engineering decisions. It is not a prospective architecture specification.

Add a decision only when it has been deliberately made. Do not use this file to settle the research questions in `open-questions.md`.

## D001 — Tangle is an experimental harness

**Status:** Accepted

Tangle exists first to study whether useful global understanding can emerge from recursively resolving small local questions. Product features and framework generality are secondary.

## D002 — Vanilla JavaScript and minimal dependencies

**Status:** Accepted

The implementation uses Node.js and vanilla JavaScript. Dependencies must solve an immediate, demonstrated need.

## D003 — Files before a database

**Status:** Accepted

Graph state, configuration, traces, and experiment outputs begin as ordinary files. This keeps runs inspectable and portable.

## D004 — Serial, deterministic execution first

**Status:** Accepted

The initial harness processes one node at a time using a deterministic selection order. Parallel execution can be considered only after experiments show useful independent work and a reason to accept the extra variables.

## D005 — The harness owns graph mutation

**Status:** Accepted

Models may propose findings, evidence references, and child questions. Deterministic application code validates and applies those proposals. Models do not edit the persisted graph directly.

## D006 — Findings and evidence are distinct

**Status:** Accepted

A finding is a claim that may be wrong. Evidence records material actually inspected, such as a file range, symbol, command result, or test output. Model reasoning and summaries cannot serve as their own evidence.

## D007 — One invocation, one node

**Status:** Accepted

Each fresh model invocation works on one bounded node. It must not opportunistically resolve parents, siblings, or unrelated parts of the graph.

## D008 — Revisit parents rather than auto-synthesise them

**Status:** Accepted for the initial experiment

When a node's known children are resolved, the parent is revisited in a fresh invocation with the relevant child findings and evidence. Resolved children do not automatically imply that the parent is resolved.

## D009 — Raw history is primary experimental data

**Status:** Accepted

Persist enough raw information to reconstruct what happened. Prefer append-only trace events alongside derived graph state.

