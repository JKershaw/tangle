import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyResult,
  buildContext,
  captureEvidence,
  createRun,
  nextRunnable,
  outcomeLabel,
  parseModelOutput,
  validateImport,
  validateResult,
} from "../src/graph.js";

test("a run starts with one open seed node and empty counters", () => {
  const run = createRun("Why is the sky blue?", "live");
  assert.equal(run.nodes.length, 1);
  assert.deepEqual(run.nodes[0], {
    id: "n1", parent: null, depth: 0, question: "Why is the sky blue?", status: "open",
    visits: 0, finding: "", evidence: [], observed: [], failedLookups: [], reason: "",
  });
  assert.equal(run.mode, "live");
  assert.equal(run.stopReason, null);
  assert.equal(nextRunnable(run).id, "n1");
});

test("the seed must be a question of 1 to 400 characters", () => {
  assert.throws(() => createRun("   "), /1.400 characters/);
  assert.throws(() => createRun("x".repeat(401)), /1.400 characters/);
});

test("decompose parks the parent as waiting and children run first, in order", () => {
  const run = createRun("Root");
  applyResult(run, "n1", { action: "decompose", questions: ["A", "B"] }, []);
  assert.equal(run.nodes[0].status, "waiting");
  assert.deepEqual(run.nodes.map((node) => [node.id, node.parent, node.depth]), [["n1", null, 0], ["n2", "n1", 1], ["n3", "n1", 1]]);
  assert.equal(nextRunnable(run).id, "n2");
  run.nodes[1].status = "resolved";
  assert.equal(nextRunnable(run).id, "n3");
});

test("a parent is revisited once every child is settled; under the older strict rule a blocked child leaves it unrunnable", () => {
  const run = createRun("Root", "simulation", { revisitSettled: false });
  applyResult(run, "n1", { action: "decompose", questions: ["A", "B"] }, []);
  run.nodes[1].status = "resolved";
  run.nodes[2].status = "blocked";
  assert.equal(nextRunnable(run), null);
  assert.equal(outcomeLabel(run), "No runnable nodes · root unresolved");
  run.nodes[2].status = "resolved";
  assert.equal(nextRunnable(run).id, "n1");
  assert.equal(outcomeLabel(run), "Ready");
});

test("the scheduler is depth-first: a grandchild runs before an open sibling of its parent", () => {
  const run = createRun("Root");
  applyResult(run, "n1", { action: "decompose", questions: ["A", "B"] }, []);
  applyResult(run, "n2", { action: "decompose", questions: ["A1"] }, []);
  assert.equal(nextRunnable(run).id, "n4");
});

test("a resolution may cite only evidence that was in the model's context", () => {
  const run = createRun("Root");
  const record = captureEvidence(run, "n1", { kind: "wiki", title: "T", text: "some text" });
  assert.equal(record.id, "e1");
  assert.deepEqual(run.nodes[0].observed, ["e1"]);
  const node = run.nodes[0];
  assert.throws(() => validateResult(run, node, { action: "resolved", finding: "A finding with enough words in it.", evidence: ["e9"] }, ["e1"]), /invented evidence/);
  assert.throws(() => validateResult(run, node, { action: "resolved", finding: "A finding with enough words in it.", evidence: ["e1"] }, []), /invented evidence/);
  assert.throws(() => validateResult(run, node, { action: "resolved", finding: "A finding with enough words in it.", evidence: [] }, ["e1"]), /needs inspected evidence/);
  validateResult(run, node, { action: "resolved", finding: "A finding with enough words in it.", evidence: ["e1"] }, ["e1"]);
  applyResult(run, "n1", { action: "resolved", finding: "  A finding with enough words in it.  ", evidence: ["e1", "e1"] }, ["e1"]);
  assert.equal(node.status, "resolved");
  assert.equal(node.finding, "A finding with enough words in it.");
  assert.deepEqual(node.evidence, ["e1"]);
  assert.equal(outcomeLabel(run), "Root resolved");
});

test("the validator rejects malformed actions and enforces the safety limits", () => {
  const run = createRun("Root", "simulation", { maxDepth: 1, maxNodes: 3 });
  const node = run.nodes[0];
  assert.throws(() => validateResult(run, node, { action: "fly" }, []), /Unknown action/);
  assert.throws(() => validateResult(run, node, { action: "wiki", query: "" }, []), /1.180 characters/);
  assert.throws(() => validateResult(run, node, { action: "decompose", questions: [] }, []), /1.3 questions/);
  assert.throws(() => validateResult(run, node, { action: "decompose", questions: ["a", "b", "c", "d"] }, []), /1.3 questions/);
  assert.throws(() => validateResult(run, node, { action: "decompose", questions: ["a", "b", "c"] }, []), /Node safety limit/);
  assert.throws(() => validateResult(run, node, { action: "blocked", reason: "" }, []), /needs a reason/);
  applyResult(run, "n1", { action: "decompose", questions: ["a"] }, []);
  assert.throws(() => validateResult(run, run.nodes[1], { action: "decompose", questions: ["b"] }, []), /Depth safety limit/);
  assert.throws(() => applyResult(run, "n1", { action: "wiki", query: "x" }, []), /Tools do not mutate/);
  run.nodes[1].status = "resolved";
  assert.throws(() => applyResult(run, "n2", { action: "blocked", reason: "r" }, []), /not runnable/);
});

test("model output may be wrapped in think tags or a code fence", () => {
  assert.deepEqual(parseModelOutput('<think>hmm</think>\n```json\n{"action":"blocked","reason":"x"}\n```'), { action: "blocked", reason: "x" });
  assert.throws(() => parseModelOutput("[1,2]"), /Expected a JSON object/);
  assert.throws(() => parseModelOutput("not json"), SyntaxError);
});

test("the local context holds the question, recent child findings and the last five excerpts only", () => {
  const run = createRun("Root");
  applyResult(run, "n1", { action: "decompose", questions: ["a", "b", "c"] }, []);
  applyResult(run, "n2", { action: "decompose", questions: ["d", "e", "f"] }, []);
  applyResult(run, "n5", { action: "decompose", questions: ["g", "h"] }, []);
  for (let i = 0; i < 7; i++) captureEvidence(run, "n1", { kind: "wiki", title: "T" + i, text: "x".repeat(900) });
  const context = buildContext(run, run.nodes[0]);
  assert.equal(context.question, "Root");
  assert.deepEqual(context.children, []);
  assert.deepEqual(context.evidence.map((excerpt) => excerpt.id), ["e3", "e4", "e5", "e6", "e7"]);
  assert.equal(context.evidence[0].text.length, 700);
  assert.equal(context.omittedEvidence, 2);
  assert.equal(context.excerptCharacterLimit, 700);
  // Child findings are claims; their evidence IDs are made visible so the parent may cite the source.
  captureEvidence(run, "n3", { kind: "wiki", title: "child", text: "child text" });
  applyResult(run, "n3", { action: "resolved", finding: "A finding with enough words in it. ".repeat(20), evidence: ["e8"] }, ["e8"]);
  const withChild = buildContext(run, run.nodes[0]);
  assert.equal(withChild.children.length, 1);
  assert.equal(withChild.children[0].finding.length, 500);
  assert.ok(withChild.evidence.some((excerpt) => excerpt.id === "e8"));
});

test("import accepts an export, rejects unsafe files, and marks in-progress nodes inspect-only", () => {
  const run = createRun("Root");
  captureEvidence(run, "n1", { kind: "wiki", title: "T", text: "t", url: "https://en.wikipedia.org/wiki/T" });
  run.nodes[0].status = "working";
  const imported = validateImport(JSON.stringify(run));
  assert.equal(imported.readOnly, true);
  assert.equal(imported.nodes[0].status, "error");
  assert.match(imported.nodes[0].reason, /inspect only/);
  assert.throws(() => validateImport(JSON.stringify({ ...run, format: "other" })), /Not a Tangle/);
  const badUrl = JSON.parse(JSON.stringify(run));
  badUrl.evidence[0].url = "https://example.com/x";
  assert.throws(() => validateImport(JSON.stringify(badUrl)), /Unsafe evidence URL/);
  const cycle = JSON.parse(JSON.stringify(run));
  cycle.nodes.push({ ...cycle.nodes[0], id: "n2", parent: "n3", depth: 1 }, { ...cycle.nodes[0], id: "n3", parent: "n2", depth: 1 });
  assert.throws(() => validateImport(JSON.stringify(cycle)), /Cycle|Disconnected/);
  const orphan = JSON.parse(JSON.stringify(run));
  orphan.nodes.push({ ...orphan.nodes[0], id: "n2", parent: "n9", depth: 1 });
  assert.throws(() => validateImport(JSON.stringify(orphan)), /Missing parent/);
  const legacy = JSON.parse(JSON.stringify(run));
  delete legacy.nodes[0].failedLookups;
  assert.deepEqual(validateImport(JSON.stringify(legacy)).nodes[0].failedLookups, []);
  const badLookups = JSON.parse(JSON.stringify(run));
  badLookups.nodes[0].failedLookups = [{ query: "", error: "x" }];
  assert.throws(() => validateImport(JSON.stringify(badLookups)), /Invalid failed lookups/);
});

test("the context says how many child questions may be proposed: fewer near the node ceiling, none at the depth ceiling", () => {
  const run = createRun("Root", "simulation", { maxDepth: 1, maxNodes: 5 });
  assert.equal(buildContext(run, run.nodes[0]).questionsAllowed, 3);
  applyResult(run, "n1", { action: "decompose", questions: ["a", "b", "c"] }, []);
  assert.equal(buildContext(run, run.nodes[1]).questionsAllowed, 0, "depth ceiling");
  assert.equal(buildContext(run, run.nodes[0]).questionsAllowed, 1, "one node left under the ceiling");
});

test("excerpts in the context are labelled 1 to 5 in order, beside their IDs", () => {
  const run = createRun("Root");
  for (let i = 0; i < 6; i++) captureEvidence(run, "n1", { kind: "wiki", title: "T" + i, text: "text " + i });
  const context = buildContext(run, run.nodes[0]);
  assert.deepEqual(context.evidence.map((excerpt) => [excerpt.label, excerpt.id]), [["1", "e2"], ["2", "e3"], ["3", "e4"], ["4", "e5"], ["5", "e6"]]);
});

test("a lead excerpt in the context lists the article's sections", () => {
  const run = createRun("Root");
  captureEvidence(run, "n1", { kind: "wiki", title: "Dead Sea", text: "lead", headings: ["Geography", "Receding shoreline"] });
  captureEvidence(run, "n1", { kind: "wiki", title: "Dead Sea § Geography", text: "rift", article: "Dead Sea", section: 1 });
  const [lead, section] = buildContext(run, run.nodes[0]).evidence;
  assert.deepEqual(lead.sections, ["Geography", "Receding shoreline"]);
  assert.equal("sections" in section, false);
});

test("revisitSettled: a parent frozen by a blocked child becomes runnable again, and an errored child still stops it", () => {
  // The shape the first benchmark matrix produced on six of seven seeds: a
  // root waiting over children that are done with, one of them honestly blocked.
  const build = (limits) => {
    const run = createRun("Why is the Dead Sea shrinking?", "live", limits);
    applyResult(run, "n1", { action: "decompose", questions: ["What feeds it?", "What drains it?"] }, []);
    captureEvidence(run, "n2", { kind: "wiki", title: "Dead Sea", text: "The Jordan River is its main tributary." });
    applyResult(run, "n2", { action: "resolved", finding: "The Jordan River is the main tributary of the Dead Sea.", evidence: ["e1"] }, ["e1"]);
    return run;
  };

  const strict = build({ revisitSettled: false });
  applyResult(strict, "n3", { action: "blocked", reason: "The excerpts do not say." }, []);
  assert.equal(nextRunnable(strict), null, "the older strict rule leaves the root frozen");
  assert.equal(strict.nodes[0].status, "waiting");
  assert.equal(outcomeLabel(strict), "No runnable nodes · root unresolved");

  const settled = build({});
  applyResult(settled, "n3", { action: "blocked", reason: "The excerpts do not say." }, []);
  assert.equal(nextRunnable(settled).id, "n1", "by default the root runs again");

  // Until then the root waits: an unsettled child is still tried first.
  const waiting = build({ revisitSettled: true });
  assert.equal(nextRunnable(waiting).id, "n3", "the open child goes before the parent");

  // An error is not an answer: it holds the parent under either rule.
  const errored = build({ revisitSettled: true });
  errored.nodes[2].status = "error";
  errored.nodes[2].reason = "Generation timed out.";
  assert.equal(nextRunnable(errored), null);
});

test("revisitSettled is on by default and travels with the run", () => {
  assert.equal(createRun("Why?", "live").limits.revisitSettled, true);
  assert.equal(createRun("Why?", "live", { revisitSettled: false }).limits.revisitSettled, false);
  assert.equal(validateImport(JSON.stringify(createRun("Why?", "live", { revisitSettled: true }))).limits.revisitSettled, true);
});
