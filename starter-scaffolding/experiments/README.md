# Experiments

Experiments are first-class project artifacts. Their purpose is to make runs inspectable, comparable, and reproducible—not to prove that every run succeeded.

Use a numbered directory for each run:

```text
experiments/
  001-understand-mangodb/
    config.json
    graph.json
    trace.jsonl
    observations.md
```

## Expected artifacts

### `config.json`

Record the inputs required to identify the run, including:

- seed;
- subject repository and commit;
- model and provider;
- prompt version;
- harness commit;
- deterministic scheduling rule;
- relevant limits or stopping conditions.

### `graph.json`

The latest derived graph state. It should be replaceable from recorded history where practical.

### `trace.jsonl`

Append one immutable JSON event per line. Preserve raw events rather than only summaries. Useful events may eventually include node creation and selection, supplied context, tool calls and results, model responses, parsed outcomes, graph mutations, token usage, latency, cost, and timestamps.

Do not invent the complete event taxonomy before the harness needs it.

Example shape only:

```json
{"event":"node_created","node":"n1","parent":null}
{"event":"node_started","node":"n1"}
{"event":"tool_read","node":"n1","path":"README.md"}
{"event":"node_decomposed","node":"n1","children":["n2","n3"]}
```

### `observations.md`

Record what happened before proposing improvements. Include surprises, repeated behaviour, unresolved branches, apparent contradictions, graph shape, node and revisit counts, depth, repository reads, token use, latency, and cost when available.

Distinguish observations from interpretations and proposed changes.

## Experimental discipline

- Change one meaningful variable at a time where possible.
- Record the exact subject commit and harness commit.
- Preserve failed and strange runs.
- Do not repair every anomaly after its first appearance.
- Repeat the same seed, repository commit, model, and prompt before inferring a pattern.
- Compare early graphs by inspection before inventing graph-similarity metrics.

