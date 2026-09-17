import { test } from "node:test";
import assert from "node:assert/strict";
import { summarise } from "../scripts/summarise.js";
import { runSimulation } from "./helpers.js";

test("the summary shows the tree, counters and flagged oddities", async () => {
  const { run: revisit } = await runSimulation("revisit");
  const text = summarise(revisit);
  assert.match(text, /nodes 9 · visits 13 · model calls 19 · lookups 6 · evidence 6/);
  assert.match(text, /outcome: root resolved/);
  assert.match(text, /^n1 \[resolved v3\] Why does the water cycle keep going\?/m);
  assert.match(text, /^    n5 \[resolved\] What drives evaporation\?/m);
  assert.match(text, /n1 resolved citing only its children's sources/);
  const { run: repeat } = await runSimulation("repeat");
  const repeated = summarise(repeat);
  assert.match(repeated, /repeated question \(n2, n3, n4, n5, n6, n7\): how does water move\?/);
  assert.match(repeated, /n3 re-asks its parent's question verbatim/);
  assert.match(repeated, /n7 error: Depth safety limit/);
});
