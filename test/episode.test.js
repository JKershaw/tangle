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

test("blocked: a blocked leaf no longer freezes its ancestors; the parent runs again with what it has and the root resolves", async () => {
  const { run, steps } = await runSimulation("blocked");
  assert.equal(steps, 11);
  assert.deepEqual(statusCounts(run), { resolved: 7, blocked: 1 });
  assert.equal(run.nodes[0].status, "resolved");
  assert.equal(run.nodes[0].visits, 2);
  assert.equal(run.stopReason, null);
  assert.deepEqual([run.visits, run.modelCalls, run.lookups, run.evidence.length], [11, 15, 4, 4]);
  assert.deepEqual(provenanceViolations(run), []);
});

test("blocked, strict rule: with revisitSettled off one blocked leaf leaves its ancestors waiting and the root unresolved", async () => {
  const { run, steps } = await runSimulation("blocked", { revisitSettled: false });
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
  await runEpisode(invalid, { generate: scriptedGenerate([{ action: "resolved", finding: "A finding with enough words in it.", evidence: ["e1"] }]), wiki: async () => ({ ok: false }) });
  assert.match(invalid.nodes[0].reason, /invented evidence/);
});

test("a wiki lookup captures evidence and the next pass can cite it", async () => {
  const run = createRun("Root", "live");
  const wiki = async (query) => ({ ok: true, kind: "wiki", title: query, text: "Text about " + query, url: "https://en.wikipedia.org/wiki/X" });
  const generate = scriptedGenerate([{ action: "wiki", query: "X" }, { action: "resolved", finding: "A finding with enough words in it.", evidence: ["e1"] }]);
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

test("a failed lookup is fed back to the model instead of pausing the run", async () => {
  const run = createRun("Root", "live");
  const wiki = async (query) => (query === "zzz" ? { ok: false, error: { kind: "no_match", message: "No article matched." } } : { ok: true, kind: "wiki", title: query, text: "t" });
  const generate = scriptedGenerate([{ action: "wiki", query: "zzz" }, { action: "wiki", query: "Water" }, { action: "resolved", finding: "A finding with enough words in it.", evidence: ["e1"] }]);
  const ok = await runEpisode(run, { generate, wiki });
  assert.equal(ok, true);
  assert.equal(run.nodes[0].status, "resolved");
  assert.equal(run.stopReason, null);
  assert.deepEqual(run.nodes[0].failedLookups, [{ query: "zzz", error: "No article matched." }]);
  const inputs = run.trace.filter((event) => event.event === "model_input").map((event) => event.context);
  assert.equal(inputs[0].failedLookups, undefined);
  assert.deepEqual(inputs[0].lookupsRemaining, 2);
  assert.deepEqual(inputs[1].failedLookups, [{ query: "zzz", error: "No article matched." }]);
  assert.equal(inputs[1].lookupsRemaining, 1);
  assert.equal(inputs[2].lookupsRemaining, 0);
  assert.ok(run.trace.some((event) => event.event === "lookup_failed" && event.query === "zzz"));
});

test("failed lookups are remembered across visits so a revisit sees them", async () => {
  const run = createRun("Root", "live");
  const wiki = async () => ({ ok: false, error: { kind: "no_match", message: "Nothing." } });
  await runEpisode(run, { generate: scriptedGenerate([{ action: "wiki", query: "a" }, { action: "decompose", questions: ["child"] }]), wiki });
  assert.equal(run.nodes[0].status, "waiting");
  await runEpisode(run, { generate: scriptedGenerate([{ action: "blocked", reason: "no source" }]), wiki });
  assert.equal(run.nodes[1].status, "blocked");
  run.nodes[1].status = "resolved";
  await runEpisode(run, { generate: scriptedGenerate([{ action: "blocked", reason: "still nothing" }]), wiki });
  const revisit = run.trace.filter((event) => event.event === "model_input" && event.node === "n1").at(-1).context;
  assert.deepEqual(revisit.failedLookups, [{ query: "a", error: "Nothing." }]);
  assert.equal(run.nodes[0].visits, 2);
});

test("the lookup limit still bounds a visit that keeps searching", async () => {
  const run = createRun("Root", "live");
  const wiki = async () => ({ ok: false, error: { kind: "no_match", message: "Nothing." } });
  await runEpisode(run, { generate: scriptedGenerate([{ action: "wiki", query: "a" }, { action: "wiki", query: "b" }, { action: "wiki", query: "c" }]), wiki });
  assert.equal(run.nodes[0].status, "error");
  assert.match(run.nodes[0].reason, /lookup safety limit/);
  assert.equal(run.nodes[0].failedLookups.length, 2);
});

test("a finding may cite excerpts by label; labels map back to evidence IDs and unknown labels are rejected", async () => {
  const run = createRun("Root", "live");
  const wiki = async () => ({ ok: true, kind: "wiki", title: "T", text: "some text" });
  const cited = scriptedGenerate([{ action: "wiki", query: "X" }, { action: "resolved", finding: "A finding with enough words in it.", evidence: ["1"] }]);
  assert.equal(await runEpisode(run, { generate: cited, wiki }), true);
  assert.deepEqual(run.nodes[0].evidence, ["e1"]);
  const invented = createRun("Root", "live");
  await runEpisode(invented, { generate: scriptedGenerate([{ action: "wiki", query: "X" }, { action: "resolved", finding: "A finding with enough words in it.", evidence: ["3"] }]), wiki });
  assert.equal(invented.nodes[0].status, "error");
  assert.match(invented.nodes[0].reason, /invented evidence/);
});

test("looking up an article that is already in the context is a visible failed lookup, not a second excerpt", async () => {
  const run = createRun("Root", "live");
  const wiki = async () => ({ ok: true, kind: "wiki", title: "Water cycle", text: "lead section" });
  const inputs = [];
  const generate = async (messages, { context }) => {
    inputs.push(context);
    const proposal = inputs.length < 3 ? { action: "wiki", query: "water cycle" } : { action: "resolved", finding: "A finding with enough words in it.", evidence: ["1"] };
    return { text: JSON.stringify(proposal), tokens: 1 };
  };
  assert.equal(await runEpisode(run, { generate, wiki }), true);
  assert.equal(run.evidence.length, 1);
  assert.match(run.nodes[0].failedLookups[0].error, /Already read: “Water cycle” is in the context/);
  assert.equal(inputs[2].failedLookups.length, 1, "the next pass sees the failed lookup");
  assert.equal(run.nodes[0].status, "resolved");
});

test("asking again for an article already in the context reads its next section", async () => {
  const run = createRun("Root", "live");
  const wikiCalls = [];
  const wiki = async (query, { readOn } = {}) => {
    wikiCalls.push(readOn ?? null);
    if (!readOn) return { ok: true, kind: "wiki", title: "Dead Sea", article: "Dead Sea", section: 0, text: "lead" };
    return { ok: true, kind: "wiki", title: "Dead Sea § Recession", article: "Dead Sea", section: readOn.section, text: "it is receding" };
  };
  const generate = scriptedGenerate([{ action: "wiki", query: "Dead Sea" }, { action: "wiki", query: "Dead Sea" }, { action: "resolved", finding: "A finding with enough words in it.", evidence: ["1", "2"] }]);
  assert.equal(await runEpisode(run, { generate, wiki }), true);
  assert.deepEqual(wikiCalls, [null, { article: "Dead Sea", section: 1 }]);
  assert.deepEqual(run.evidence.map((record) => record.title), ["Dead Sea", "Dead Sea § Recession"]);
  assert.deepEqual(run.nodes[0].evidence, ["e1", "e2"]);
  assert.equal(run.trace.filter((event) => event.event === "tool_result").length, 2);
});

test("a 'Title / Section' query reads that section of an article already in the context", async () => {
  const run = createRun("Root", "live");
  const wikiCalls = [];
  const wiki = async (query, { readOn } = {}) => {
    wikiCalls.push([query, readOn ?? null]);
    if (!readOn) return { ok: true, kind: "wiki", title: "Dead Sea", article: "Dead Sea", section: 0, text: "lead", headings: ["Geography", "Receding shoreline"] };
    return { ok: true, kind: "wiki", title: "Dead Sea § " + readOn.section, article: "Dead Sea", section: 2, text: "diversion" };
  };
  const generate = scriptedGenerate([{ action: "wiki", query: "Dead Sea" }, { action: "wiki", query: "Dead Sea / Receding shoreline" }, { action: "resolved", finding: "A finding with enough words in it.", evidence: ["2"] }]);
  assert.equal(await runEpisode(run, { generate, wiki }), true);
  assert.deepEqual(wikiCalls, [["Dead Sea", null], ["Dead Sea / Receding shoreline", { article: "Dead Sea", section: "Receding shoreline" }]]);
  assert.deepEqual(run.nodes[0].evidence, ["e2"]);
  const context = run.trace.filter((event) => event.event === "model_input")[1].context;
  assert.deepEqual(context.evidence[0].sections, ["Geography", "Receding shoreline"]);
});

test("repeating the bare title of an article with sections hands back the section list without spending a lookup", async () => {
  const run = createRun("Root", "live");
  const wikiCalls = [];
  const wiki = async (query, { readOn } = {}) => {
    wikiCalls.push([query, readOn ?? null]);
    if (!readOn) return { ok: true, kind: "wiki", title: "Dead Sea", article: "Dead Sea", section: 0, text: "lead", headings: ["Geography", "Receding shoreline"] };
    return { ok: true, kind: "wiki", title: "Dead Sea § " + readOn.section, article: "Dead Sea", section: 2, text: "diversion" };
  };
  const inputs = [];
  const scripted = scriptedGenerate([{ action: "wiki", query: "Dead Sea" }, { action: "wiki", query: "Dead Sea" }, { action: "wiki", query: "Dead Sea / Receding shoreline" }, { action: "resolved", finding: "A finding with enough words in it.", evidence: ["2"] }]);
  const generate = async (messages, options) => { inputs.push(options.context); return scripted(messages, options); };
  assert.equal(await runEpisode(run, { generate, wiki }), true);
  assert.deepEqual(wikiCalls.map(([, readOn]) => readOn), [null, { article: "Dead Sea", section: "Receding shoreline" }], "the bare repeat made no request");
  assert.match(run.nodes[0].failedLookups[0].error, /ask for one section by name as “Dead Sea \/ <section>”\. Sections: Geography, Receding shoreline\./);
  assert.deepEqual(inputs.map((context) => context.lookupsRemaining), [2, 1, 1, 0], "the bare repeat did not count");
  assert.deepEqual(run.nodes[0].evidence, ["e2"]);
});

test("with a section chooser, repeating a bare title becomes a forced pick from the headings and reads that section", async () => {
  const run = createRun("Why is the Dead Sea shrinking?", "live");
  const wiki = async (query, { readOn } = {}) => {
    if (!readOn) return { ok: true, kind: "wiki", title: "Dead Sea", article: "Dead Sea", section: 0, text: "lead", headings: ["Names", "Geography", "Receding shoreline"] };
    return { ok: true, kind: "wiki", title: "Dead Sea § " + readOn.section, article: "Dead Sea", section: 3, text: "diversion of the Jordan" };
  };
  const asked = [];
  const chooseSection = async (request) => {
    asked.push(request);
    return { text: '{"section": "Receding shoreline"}', tokens: 7 };
  };
  const generate = scriptedGenerate([{ action: "wiki", query: "Dead Sea" }, { action: "wiki", query: "Dead Sea" }, { action: "resolved", finding: "A finding with enough words in it.", evidence: ["2"] }]);
  assert.equal(await runEpisode(run, { generate, wiki, chooseSection }), true);
  assert.deepEqual(asked, [{ question: "Why is the Dead Sea shrinking?", article: "Dead Sea", sections: ["Names", "Geography", "Receding shoreline"] }]);
  assert.deepEqual(run.evidence.map((record) => record.title), ["Dead Sea", "Dead Sea § Receding shoreline"]);
  const chosen = run.trace.find((event) => event.event === "section_chosen");
  assert.equal(chosen.section, "Receding shoreline");
  assert.equal(run.modelCalls, 4, "the pick counts as a model call");
  assert.equal(run.lookups, 2, "the section read counts as a lookup");
  assert.equal(run.nodes[0].status, "resolved");
});
