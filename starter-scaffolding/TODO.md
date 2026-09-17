# Next Thin Slice

Implement only this behaviour:

> A caller can create one node, save it to a file, load it again, and receive the same information back.

Use test-driven development:

1. Write one failing test that describes the round trip.
2. Introduce the smallest node representation needed by that test.
3. Persist it using ordinary file I/O and an intentionally boring format.
4. Load it and assert the observable values, not internal implementation details.
5. Run the full suite.
6. Refactor only if the passing implementation creates real friction.

Do not add child creation, scheduling, model calls, result application, trace infrastructure, node types, validation frameworks, or experiment orchestration in this increment.

Likely later increments, to be reconsidered one at a time rather than implemented as a batch:

1. Create a child node.
2. Select one runnable node deterministically.
3. Apply a resolved result.
4. Apply a decomposition result.
5. Revisit a parent whose children have resolved.
6. Record what happened.
7. Introduce a fake model boundary.
8. Introduce one real model.
9. Run the first MangoDB experiment.

