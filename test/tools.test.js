// The tool control (ROADMAP milestone 5b): the same model with the four
// source requests as tools in one context, budget-matched, in a composing
// and a cited variant. The model here is scripted; the source is the
// Wikipedia recording, offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wikiDriver } from "../src/wiki.js";
import { recordingFetch } from "../scripts/recording.mjs";
import { CONTEXT_CHARS, TOOL_DEFINITIONS, citedCut, runTool, runTools, trimToFit } from "../scripts/tools.mjs";
import { gradeRun } from "../scripts/grade.js";

const RECORDING = new URL("../evals/wiki-cache", import.meta.url).pathname;
const wiki = wikiDriver({ fetchImpl: recordingFetch(RECORDING, { fetchImpl: null }).fetch });
const seed = { id: "dead-sea", seed: "Why is the Dead Sea shrinking?", facts: { jordan: "Jordan River|diversion|diverted" } };

// A scripted model: each step is either tool calls or an answer; every
// request it saw is kept.
function scripted(steps) {
  const seen = [];
  let step = 0;
  const generate = async (messages, options) => {
    seen.push({ messages: structuredClone(messages), options });
    const next = steps[Math.min(step++, steps.length - 1)];
    if (next.calls) return { text: "", tokens: 100, toolCalls: next.calls.map((call, index) => ({ id: `c${step}-${index}`, ...call })) };
    return { text: options.schema ? JSON.stringify({ answer: next.answer }) : next.answer, tokens: 100 };
  };
  return { generate, seen };
}

test("the tools read the recording in the walk's shapes: a search shows titles with snippets, a read captures the lead and lists the headings, a section and an about capture text", async () => {
  const search = await runTool(wiki, { name: "search", arguments: { term: "Dead Sea" } });
  assert.match(search.shown, /^1\. Dead Sea — /);
  assert.equal(search.evidence, undefined, "a search reads nothing");
  const lead = await runTool(wiki, { name: "read", arguments: { title: "Dead Sea" } });
  assert.match(lead.shown, /^Dead Sea\n\n/);
  assert.match(lead.shown, /\n\nSections: /);
  assert.equal(lead.evidence.kind, "read");
  assert.equal(lead.evidence.article, "Dead Sea");
  assert.ok(lead.evidence.text.length > 200);
  const heading = /Sections: ([^;\n]+)/.exec(lead.shown)[1];
  const section = await runTool(wiki, { name: "section", arguments: { title: "Dead Sea", heading } });
  assert.equal(section.evidence.title, `Dead Sea § ${heading}`);
  const about = await runTool(wiki, { name: "about", arguments: { title: "Dead Sea", phrase: "Jordan River" } });
  assert.equal(about.evidence.kind, "about");
  assert.match(about.evidence.text, /Jordan/);
  assert.match((await runTool(wiki, { name: "read", arguments: { title: "" } })).shown, /needs a title/);
  assert.match((await runTool(wiki, { name: "fly", arguments: {} })).shown, /No tool named fly/);
  assert.deepEqual(TOOL_DEFINITIONS.map((tool) => tool.function.name), ["search", "read", "section", "about"]);
});

test("the composing variant searches, reads, answers within the budget, and its evidence is everything it read", async () => {
  const lead = (await runTool(wiki, { name: "read", arguments: { title: "Dead Sea" } })).evidence.text;
  const verbatim = lead.split(/(?<=\.)\s+/)[0];
  const answer = `${verbatim} It is shrinking because the Jordan River was diverted upstream.`;
  const model = scripted([{ calls: [{ name: "search", arguments: { term: "Dead Sea" } }] }, { calls: [{ name: "read", arguments: { title: "Dead Sea" } }] }, { answer }]);
  const run = await runTools(seed.seed, { generate: model.generate, wiki, budget: { calls: 3, tokens: 20000 } });
  assert.equal(run.mode, "tools");
  assert.equal(run.modelCalls, 3);
  assert.equal(run.lookups, 2);
  assert.equal(run.tokens, 300);
  assert.equal(run.stoppedBy, "calls", "the third call is the last the budget allows, so it is the answer");
  assert.ok(model.seen[0].options.tools.length === 4 && !model.seen[0].options.schema);
  assert.ok(model.seen[2].options.schema && !model.seen[2].options.tools, "the last call asks for the answer, no tools");
  assert.equal(model.seen[2].messages.filter((message) => message.role === "tool").length, 2);
  assert.equal(model.seen[2].messages[2].role, "assistant");
  assert.equal(model.seen[2].messages[2].tool_calls[0].function.name, "search");
  assert.equal(run.nodes[0].status, "resolved");
  assert.equal(run.nodes[0].finding, answer);
  assert.deepEqual(run.nodes[0].evidence, ["e1"], "composing: cited to everything read");
  assert.equal(run.evidence.length, 1);
  const grade = gradeRun(seed, run);
  assert.equal(grade.factsPresent, 1);
  assert.equal(grade.factsSupported, 1, "named and read");
  assert.deepEqual(grade.cost, { nodes: 1, visits: 3, modelCalls: 3, lookups: 2, tokens: 300 });
});

test("the cited variant keeps only the sentences that appear word for word in what was read, cited to their records", async () => {
  const lead = (await runTool(wiki, { name: "read", arguments: { title: "Dead Sea" } })).evidence.text;
  const verbatim = lead.split(/(?<=\.)\s+/)[1];
  const answer = `${verbatim} It is shrinking because the Jordan River was diverted upstream.\n\nA second paragraph that was never read.`;
  const model = scripted([{ calls: [{ name: "read", arguments: { title: "Dead Sea" } }] }, { answer }]);
  const run = await runTools(seed.seed, { generate: model.generate, wiki, cited: true, budget: { calls: 2, tokens: 20000 } });
  assert.equal(run.mode, "tools-cited");
  assert.match(model.seen[0].messages[0].content, /word for word/);
  assert.equal(run.nodes[0].finding, verbatim);
  assert.deepEqual(run.nodes[0].evidence, ["e1"]);
  assert.equal(run.answer, answer, "the model's own answer is kept beside the cut");
  const nothing = await runTools(seed.seed, { generate: scripted([{ answer: "Something it made up entirely." }]).generate, wiki, cited: true, budget: { calls: 1, tokens: 20000 } });
  assert.equal(nothing.nodes[0].status, "blocked");
  assert.match(nothing.nodes[0].reason, /word for word/);
  assert.deepEqual(citedCut("Short. The Dead Sea is a salt lake.", [{ id: "e9", text: "The Dead Sea is a salt lake bordered by Jordan." }]), { finding: "The Dead Sea is a salt lake.", evidence: ["e9"] });
});

test("an answer given before anything was read is refused with the reason and costs its call; after a read, an early answer stands; a token budget forces the answer", async () => {
  const model = scripted([{ answer: "Because the Jordan River was diverted." }, { calls: [{ name: "read", arguments: { title: "Dead Sea" } }] }, { answer: "Because the Jordan River was diverted." }]);
  const early = await runTools(seed.seed, { generate: model.generate, wiki, budget: { calls: 8, tokens: 20000 } });
  assert.equal(early.refused, 1);
  assert.equal(early.modelCalls, 3, "the refused answer cost a call");
  assert.equal(early.stoppedBy, "answer");
  assert.equal(early.nodes[0].finding, "Because the Jordan River was diverted.");
  assert.deepEqual(model.seen[1].messages.slice(-2).map((message) => message.role), ["assistant", "user"], "the model sees its answer and the refusal");
  assert.match(model.seen[1].messages.at(-1).content, /Nothing has been read yet/);
  assert.equal(early.trace.filter((event) => event.event === "answer_refused").length, 1);
  const stubborn = await runTools(seed.seed, { generate: scripted([{ answer: "Made up." }]).generate, wiki, budget: { calls: 3, tokens: 20000 } });
  assert.equal(stubborn.refused, 2, "refused until the budget forces the answer");
  assert.equal(stubborn.stoppedBy, "calls");
  assert.equal(stubborn.nodes[0].finding, "Made up.", "and the forced answer stands, unread, for the row to show");
  const spent = scripted([{ calls: [{ name: "search", arguments: { term: "Dead Sea" } }] }, { calls: [{ name: "search", arguments: { term: "Jordan River" } }] }, { answer: "An answer." }]);
  const run = await runTools(seed.seed, { generate: spent.generate, wiki, budget: { calls: 8, tokens: 150 } });
  assert.equal(run.modelCalls, 3, "after two calls the tokens are spent, so the third is the answer");
  assert.equal(run.stoppedBy, "tokens");
  assert.ok(spent.seen[2].options.schema);
});

test("when the transcript outgrows the context window the oldest tool results are dropped and the run says how many", async () => {
  const model = scripted([{ calls: [{ name: "read", arguments: { title: "Dead Sea" } }] }, { calls: [{ name: "read", arguments: { title: "Jordan River" } }] }, { answer: "An answer." }]);
  const run = await runTools(seed.seed, { generate: model.generate, wiki, budget: { calls: 3, tokens: 20000 }, contextChars: 3500 });
  assert.equal(run.dropped, 1);
  assert.equal(run.evidence.length, 2, "what was dropped from the context was still read, and stays evidence");
  const shown = model.seen[2].messages.filter((message) => message.role === "tool").map((message) => message.content);
  assert.match(shown[0], /^\[dropped/);
  assert.match(shown[1], /^Jordan River/);
  assert.ok(CONTEXT_CHARS > 10000);
  const messages = [{ role: "tool", content: "x".repeat(50) }, { role: "tool", content: "y".repeat(50) }];
  assert.equal(trimToFit(messages, 90), 1, "the placeholder still counts");
  assert.equal(trimToFit(messages, 10), 1, "and it stops when nothing is left to drop");
});
