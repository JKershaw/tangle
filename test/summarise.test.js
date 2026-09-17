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

test("a finding whose substance is absent from its cited excerpts is flagged, a supported one is not", async () => {
  const { createRun, captureEvidence, applyResult } = await import("../src/graph.js");
  const run = createRun("Why is the Dead Sea shrinking?", "live");
  captureEvidence(run, "n1", { kind: "wiki", title: "Dead Sea", text: "The Dead Sea is a salt lake bordered by Jordan. Its main tributary is the Jordan River." });
  applyResult(run, "n1", { action: "resolved", finding: "The Dead Sea is shrinking because of diversion of water for agriculture and industry, reducing inflow.", evidence: ["e1"] }, ["e1"]);
  assert.match(summarise(run), /n1 finding uses words absent from its cited excerpts: .*diversion/);
  const supported = createRun("Root", "live");
  captureEvidence(supported, "n1", { kind: "wiki", title: "Dead Sea", text: "The Dead Sea has been shrinking since the 1960s because of diversion of incoming water from the Jordan River for agriculture." });
  applyResult(supported, "n1", { action: "resolved", finding: "It is shrinking because of diversion of Jordan River water for agriculture.", evidence: ["e1"] }, ["e1"]);
  assert.doesNotMatch(summarise(supported), /absent from its cited excerpts/);
});
