import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../src/graph.js";
import { runEpisode, PROMPT_VERSION } from "../src/episode.js";
import { provenanceViolations, runSimulation, scriptedGenerate, statusCounts } from "./helpers.js";

// The three scripted scenarios are the fixed points of the harness. The numbers
// below were measured on the original one-shot build; a change here is a change
// in behaviour and should be deliberate.

test("revisit: the parent asks again after its children resolve, then resolves the root", async () => {
  const { run, steps } = await runSimulation("revisit");
  assert.equal(steps, 13);
  assert.deepEqual(statusCounts(run), { resolved: 9 });
  assert.equal(run.nodes[0].visits, 3);
  assert.equal(run.nodes[0].status, "resolved");
  assert.equal(run.nodes.at(-1).question, "What supplies the energy for the cycle?");
  assert.deepEqual([run.visits, run.modelCalls, run.lookups, run.evidence.length, run.tokens], [13, 19, 6, 6, 0]);
  assert.deepEqual(provenanceViolations(run), []);
  assert.equal(run.promptVersion, PROMPT_VERSION);
  assert.ok(run.trace.every((event) => event.event !== "model_output" || event.simulated === true));
});

test("blocked: one blocked leaf leaves its ancestors waiting and the root unresolved", async () => {
  const { run, steps } = await runSimulation("blocked");
  assert.equal(steps, 9);
  assert.deepEqual(statusCounts(run), { waiting: 2, resolved: 5, blocked: 1 });
  assert.equal(run.nodes[0].status, "waiting");
  assert.equal(run.stopReason, null);
  assert.deepEqual([run.visits, run.modelCalls, run.lookups, run.evidence.length], [9, 13, 4, 4]);
  assert.deepEqual(provenanceViolations(run), []);
});

test("repeat: a question that keeps re-asking itself spirals to the depth limit and pauses on error", async () => {
  const { run, steps } = await runSimulation("repeat");
  assert.equal(steps, 7);
  assert.deepEqual(statusCounts(run), { waiting: 6, error: 1 });
  assert.equal(run.nodes.at(-1).depth, 6);
  assert.match(run.nodes.at(-1).reason, /Depth safety limit/);
  assert.equal(run.stopReason, "Paused on error · inspect or retry");
  assert.deepEqual([run.visits, run.modelCalls, run.lookups], [7, 7, 0]);
});

test("the visit safety limit stops a run and records why", async () => {
  const { run } = await runSimulation("revisit", { maxVisits: 4 });
  assert.equal(run.visits, 4);
  assert.equal(run.stopReason, "Visit safety limit · root unresolved");
  assert.equal(run.trace.at(-1).event, "limit_reached");
});

test("cancellation restores the node's previous status and keeps the trace", async () => {
  const run = createRun("Root", "live");
  const controller = new AbortController();
  const generate = async () => {
    controller.abort();
    return { text: '{"action":"blocked","reason":"never applied"}', tokens: 5 };
  };
  const ok = await runEpisode(run, { signal: controller.signal, generate, wiki: async () => ({ ok: false }) });
  assert.equal(ok, false);
  assert.equal(run.nodes[0].status, "open");
  assert.equal(run.stopReason, null);
  assert.equal(run.trace.at(-1).event, "node_cancelled");
});

test("unparseable or invalid model output pauses the run on that node", async () => {
  const run = createRun("Root", "live");
  const ok = await runEpisode(run, { generate: scriptedGenerate(["not json"]), wiki: async () => ({ ok: false }) });
  assert.equal(ok, false);
  assert.equal(run.nodes[0].status, "error");
  assert.match(run.stopReason, /Paused on error/);
  const invalid = createRun("Root", "live");
  await runEpisode(invalid, { generate: scriptedGenerate([{ action: "resolved", finding: "F", evidence: ["e1"] }]), wiki: async () => ({ ok: false }) });
  assert.match(invalid.nodes[0].reason, /invented evidence/);
});

test("a wiki lookup captures evidence and the next pass can cite it", async () => {
  const run = createRun("Root", "live");
  const wiki = async (query) => ({ ok: true, kind: "wiki", title: query, text: "Text about " + query, url: "https://en.wikipedia.org/wiki/X" });
  const generate = scriptedGenerate([{ action: "wiki", query: "X" }, { action: "resolved", finding: "F", evidence: ["e1"] }]);
  const ok = await runEpisode(run, { generate, wiki });
  assert.equal(ok, true);
  assert.equal(run.nodes[0].status, "resolved");
  assert.deepEqual([run.modelCalls, run.lookups, run.tokens, run.evidence.length], [2, 1, 20, 1]);
  assert.deepEqual(run.trace.map((event) => event.event), [
    "node_started", "model_input", "model_output", "tool_proposed", "tool_result", "evidence_captured",
    "model_input", "model_output", "node_resolved",
  ]);
});

test("a declined lookup blocks the node with the user's decision recorded", async () => {
  const run = createRun("Root", "live");
  const ok = await runEpisode(run, {
    generate: scriptedGenerate([{ action: "wiki", query: "X" }]),
    wiki: async () => { throw new Error("must not be called"); },
    approve: async () => false,
  });
  assert.equal(ok, true);
  assert.equal(run.nodes[0].status, "blocked");
  assert.match(run.nodes[0].reason, /declined by the user/);
});

test("lookups per visit are bounded", async () => {
  const run = createRun("Root", "live");
  const wiki = async (query) => ({ ok: true, kind: "wiki", title: query, text: "t" });
  const generate = scriptedGenerate([{ action: "wiki", query: "a" }, { action: "wiki", query: "b" }, { action: "wiki", query: "c" }]);
  await runEpisode(run, { generate, wiki });
  assert.equal(run.nodes[0].status, "error");
  assert.match(run.nodes[0].reason, /lookup safety limit/);
  assert.equal(run.lookups, 2);
});

test("current behaviour: a failed lookup pauses the run on that node (see issue #4)", async () => {
  const run = createRun("Root", "live");
  const wiki = async () => ({ ok: false, error: { kind: "no_match", message: "No article matched." } });
  await runEpisode(run, { generate: scriptedGenerate([{ action: "wiki", query: "zzz" }]), wiki });
  assert.equal(run.nodes[0].status, "error");
  assert.equal(run.nodes[0].reason, "No article matched.");
});
