import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, nextRunnable } from "../src/graph.js";
import { candidates, isRepeat, runWalk, unreadSections } from "../src/walk.js";

// A scripted model: answers come off a queue, keyed by the field the schema
// asks for, so a test states exactly what the model says at each ask.
function scripted(queue) {
  const seen = [];
  const ask = async (call) => {
    const field = Object.keys(call.schema.properties)[0];
    seen.push({ field, user: call.messages[1].content, options: call.schema.properties[field].enum ?? null });
    const next = queue.shift();
    assert.ok(next !== undefined, `the script ran out at ask #${seen.length} (${field})`);
    assert.equal(next[0], field, `ask #${seen.length} asked for ${field}, the script expected ${next[0]}`);
    return { text: JSON.stringify({ [field]: next[1] }), tokens: 10 };
  };
  return { ask, seen };
}

const LEAD = "The Dead Sea is a salt lake bordered by Jordan and Israel. Its main tributary is the Jordan River. The Dead Sea is receding at a swift rate today.";
const SHORELINE = "Since 1930 the Dead Sea has been monitored continuously. It has been shrinking since the 1960s because of diversion of the Jordan River by the National Water Carrier.";
const GEOGRAPHY = "The Dead Sea lies in the Jordan Rift Valley between two mountain ranges. Its northern basin is fifty kilometres long.";
function wikiFixture(query, { readOn } = {}) {
  if (readOn) {
    assert.equal(readOn.article, "Dead Sea");
    return { ok: true, kind: "wiki", title: `Dead Sea § ${readOn.section}`, article: "Dead Sea", section: readOn.section === "Geography" ? 1 : 2, text: readOn.section === "Geography" ? GEOGRAPHY : SHORELINE, url: "u" };
  }
  if (/dead sea/i.test(query)) return { ok: true, kind: "wiki", title: "Dead Sea", article: "Dead Sea", section: 0, headings: ["Geography", "Receding shoreline"], text: LEAD, url: "u" };
  return { ok: false, error: { kind: "no_match", message: `nothing for ${query}` } };
}

test("the first lookup is the question itself; a picked sentence becomes the finding verbatim, cited", async () => {
  const run = createRun("What is the Dead Sea's main tributary?", "live");
  const { ask, seen } = scripted([["sentence", "2"]]);
  assert.equal(await runWalk(run, { ask, wiki: wikiFixture }), true);
  const root = run.nodes[0];
  assert.equal(root.status, "resolved");
  assert.equal(root.finding, "Its main tributary is the Jordan River.");
  assert.deepEqual(root.evidence, ["e1"]);
  assert.equal(run.lookups, 1);
  assert.equal(run.modelCalls, 1);
  assert.deepEqual(seen[0].options, ["1", "2", "3", "none"]);
  assert.match(seen[0].user, /2\. Its main tributary is the Jordan River\./);
  assert.match(run.promptVersion, /^walk-1\/asks-\d+\/sentence:list/);
  assert.ok(run.trace.some((event) => event.event === "sentence_picked" && event.pick === "2"));
});

test("when the lead does not answer, the walk reads a chosen section and picks from it", async () => {
  const run = createRun("Why is the Dead Sea shrinking?", "live");
  const { ask, seen } = scripted([["sentence", "none"], ["section", "Receding shoreline"], ["sentence", "2"]]);
  assert.equal(await runWalk(run, { ask, wiki: wikiFixture }), true);
  const root = run.nodes[0];
  assert.equal(root.status, "resolved");
  assert.match(root.finding, /^It has been shrinking since the 1960s/);
  assert.deepEqual(root.evidence, ["e2"]);
  assert.deepEqual(seen[1].options, ["Geography", "Receding shoreline"]);
  assert.equal(run.lookups, 2);
  assert.deepEqual(unreadSections(run, root), [{ article: "Dead Sea", headings: ["Geography"] }]);
});

test("with lookups exhausted the walk hands down one question; the parent later chooses among its children's findings", async () => {
  const run = createRun("Why is the Dead Sea shrinking?", "live", { maxLookups: 2 });
  const { ask } = scripted([["sentence", "none"], ["section", "Geography"], ["sentence", "none"], ["question", "What diverts water from the Jordan River?"]]);
  assert.equal(await runWalk(run, { ask, wiki: wikiFixture }), true);
  assert.equal(run.nodes[0].status, "waiting");
  assert.equal(run.nodes.length, 2);
  assert.equal(run.nodes[1].question, "What diverts water from the Jordan River?");
  // The child's own question finds no article, so it is asked what to search
  // for, reads that, and picks.
  const child = scripted([["search", "Dead Sea"], ["sentence", "2"]]);
  assert.equal(nextRunnable(run).id, "n2");
  assert.equal(await runWalk(run, { ask: child.ask, wiki: wikiFixture }), true);
  assert.equal(run.nodes[1].status, "resolved");
  assert.equal(run.nodes[1].finding, "Its main tributary is the Jordan River.");
  assert.deepEqual(run.nodes[1].evidence, ["e3"], "the child reads its own copy of the lead");
  assert.equal(run.nodes[1].failedLookups[0].query, "What diverts water from the Jordan River?");
  // The parent runs again and sees the child's finding first, then its own excerpt.
  assert.equal(nextRunnable(run).id, "n1");
  const pool = candidates(run, run.nodes[0]);
  assert.equal(pool[0].from, "child");
  assert.deepEqual(pool[0].evidence, ["e3"]);
  assert.equal(pool.length, 1 + 2 + 3, "the child's finding, then Geography's two sentences, then the lead's three");
  const parent = scripted([["sentence", "1"]]);
  assert.equal(await runWalk(run, { ask: parent.ask, wiki: wikiFixture }), true);
  assert.equal(run.nodes[0].status, "resolved");
  assert.equal(run.nodes[0].finding, run.nodes[1].finding);
  assert.deepEqual(run.nodes[0].evidence, ["e3"]);
});

test("a parent that finds none of its children's sentences answers alone still resolves with what they found", async () => {
  const run = createRun("Why is the Dead Sea shrinking?", "live", { maxLookups: 1 });
  await runWalk(run, { ask: scripted([["sentence", "none"], ["question", "What feeds the Dead Sea?"]]).ask, wiki: wikiFixture });
  await runWalk(run, { ask: scripted([["sentence", "2"]]).ask, wiki: wikiFixture });
  assert.equal(run.nodes[1].finding, "Its main tributary is the Jordan River.");
  // The parent has judged its own lead already this visit? No: each visit
  // judges afresh. It sees the child's finding and its own three sentences.
  const parent = scripted([["sentence", "none"]]);
  assert.equal(await runWalk(run, { ask: parent.ask, wiki: wikiFixture }), true);
  assert.equal(run.nodes[0].status, "resolved");
  assert.equal(run.nodes[0].finding, "Its main tributary is the Jordan River.");
  assert.ok(run.trace.some((event) => event.event === "node_resolved" && event.node === "n1"));
});

test("a repeated question is refused by code and the node blocks", async () => {
  const run = createRun("Why is the Dead Sea shrinking?", "live", { maxLookups: 1 });
  const { ask } = scripted([["sentence", "none"], ["question", "Why is the Dead Sea shrinking?"]]);
  assert.equal(await runWalk(run, { ask, wiki: wikiFixture }), true);
  assert.equal(run.nodes[0].status, "blocked");
  assert.equal(run.nodes.length, 1);
  assert.ok(run.trace.some((event) => event.event === "question_rejected"));
  assert.equal(isRepeat(run, run.nodes[0], "why is the dead sea SHRINKING"), true);
  assert.equal(isRepeat(run, run.nodes[0], "What feeds it?"), false);
});

test("flat limits: no children, the walk searches for what is missing and reads on", async () => {
  const run = createRun("Why is the Dead Sea shrinking?", "live", { maxDepth: 0, maxLookups: 6, maxPasses: 8 });
  // The lead answers nothing; both sections get read; a search finds nothing;
  // the same search again is refused by code and the node blocks.
  const { ask, seen } = scripted([["sentence", "none"], ["section", "Receding shoreline"], ["sentence", "none"], ["section", "Geography"], ["sentence", "none"], ["search", "Jordan River"], ["search", "jordan river"]]);
  assert.equal(await runWalk(run, { ask, wiki: wikiFixture }), true);
  assert.equal(run.nodes[0].status, "blocked");
  assert.equal(run.nodes.length, 1, "no question ask at depth 0");
  assert.equal(run.lookups, 4);
  assert.deepEqual(run.nodes[0].failedLookups.map((entry) => entry.query), ["Jordan River", "jordan river"]);
  assert.equal(run.nodes[0].failedLookups.at(-1).error, "Already tried.");
  assert.ok(!seen.some((call) => call.field === "question"));
});

test("a bad pick pauses the visit as an error and a cancellation leaves the node open", async () => {
  const run = createRun("What is the Dead Sea's main tributary?", "live");
  assert.equal(await runWalk(run, { ask: scripted([["sentence", "9"]]).ask, wiki: wikiFixture }), false);
  assert.equal(run.nodes[0].status, "error");
  assert.match(run.nodes[0].reason, /picked sentence 9/);
  const fresh = createRun("What is the Dead Sea's main tributary?", "live");
  const controller = new AbortController();
  const ask = async () => {
    controller.abort();
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  };
  assert.equal(await runWalk(fresh, { ask, wiki: wikiFixture, signal: controller.signal }), false);
  assert.equal(fresh.nodes[0].status, "open");
});
