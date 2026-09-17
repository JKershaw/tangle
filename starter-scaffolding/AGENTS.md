# Working on Tangle

Read `README.md` before changing the project. Tangle is an experimental harness, not an agent framework or a product architecture waiting to be completed.

## Development method

Work in small, test-driven increments:

1. Identify one observable behaviour.
2. Write the smallest useful failing test.
3. Implement only enough to make it pass.
4. Run the whole test suite.
5. Refactor only when the current implementation creates real friction.
6. Commit a working increment.
7. Let the implementation and experiments reveal the next behaviour.

Keep tests readable enough to document the behaviour they protect. Prefer extending an existing concept to introducing a new abstraction.

## Constraints

- Use vanilla JavaScript on Node.js.
- Use the project's existing module style and Node version.
- Keep dependencies few and justified; prefer the standard library.
- Use files for persistence until experiments demonstrate a need for something else.
- Keep execution serial and deterministic initially.
- One model invocation operates on one node.
- The harness owns and validates graph mutations. Models only propose results.
- Keep findings separate from evidence. A model statement is never evidence for itself.
- Preserve raw traces. Derived state can be rebuilt; an unrecorded run cannot.
- Run the full test suite before considering an increment complete.

## Research discipline

Do not silently turn an open research question into an architectural decision. Check `docs/open-questions.md` before adding a concept to the domain model.

Unexpected decomposition, repetition, contradictions, blocked branches, and awkward graph shapes are observations before they are bugs. Record them before attempting to correct them.

Do not add speculative support for parallelism, node types, semantic deduplication, confidence scores, verification agents, model routing, vector search, Harbour integration, or self-improvement.

When uncertain, choose the change that leaves Tangle smaller, easier to inspect, and easier to replace after the next experiment.

