import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, nextRunnable } from "../src/graph.js";
import { candidates, isBrief, isForeign, isRepeat, runWalk, searchTerm, splitSubjects, unreadSections, variantsFor } from "../src/walk.js";

// A scripted model: answers come off a queue, keyed by the field the schema
// asks for, so a test states exactly what the model says at each ask.
// The sequencing tests use the plain pick so each scripted answer is one ask;
// the default (pick, then one yes-or-no) has its own test below.
const PLAIN = { variants: { sentence: "list", article: "off" } };
const ONE = { maxSentences: 1 };
// Scenario fixtures return no alternative hits, so no article pick is asked.

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

test("the first lookup is the question minus its question words", () => {
  assert.equal(searchTerm("Why is the Dead Sea shrinking?"), "Dead Sea shrinking");
  assert.equal(searchTerm("Why does the water cycle keep going?"), "water cycle");
  assert.equal(searchTerm("Why did the Late Bronze Age collapse happen?"), "Late Bronze Age collapse");
  assert.equal(searchTerm("Why do honey bee colonies collapse?"), "honey bee colonies collapse");
  assert.equal(searchTerm("What is it?"), "What is it", "a question of only question words is sent as is");
});

test("the first lookup needs no model call; a picked sentence becomes the finding verbatim, cited", async () => {
  const run = createRun("What is the Dead Sea's main tributary?", "live", ONE);
  const { ask, seen } = scripted([["sentence", "2"]]);
  assert.equal(await runWalk(run, { ask, wiki: wikiFixture, ...PLAIN }), true);
  const root = run.nodes[0];
  assert.equal(root.status, "resolved");
  assert.equal(root.finding, "Its main tributary is the Jordan River.");
  assert.deepEqual(root.evidence, ["e1"]);
  assert.equal(run.lookups, 1);
  assert.equal(run.modelCalls, 1);
  assert.deepEqual(seen[0].options, ["1", "2", "3", "none"]);
  assert.match(seen[0].user, /2\. Its main tributary is the Jordan River\./);
  // The titled variant would label each sentence with its article.
  const titled = createRun("What is the Dead Sea's main tributary?", "live");
  const labelled = scripted([["sentence", "2"]]);
  await runWalk(titled, { ask: labelled.ask, wiki: wikiFixture, variants: { sentence: "titled" } });
  assert.match(labelled.seen[0].user, /2\. \[Dead Sea\] Its main tributary/);
  assert.match(run.promptVersion, /^walk-\d+\/asks-\d+\/sentence:list/);
  assert.ok(run.trace.some((event) => event.event === "sentence_picked" && event.pick === "2"));
  assert.equal(run.trace.find((event) => event.event === "tool_proposed").query, "Dead Sea's main tributary");
});

test("when the lead does not answer, the walk reads a chosen section and picks from it", async () => {
  const run = createRun("Why is the Dead Sea shrinking?", "live", ONE);
  const { ask, seen } = scripted([["sentence", "none"], ["section", "Receding shoreline"], ["sentence", "2"]]);
  assert.equal(await runWalk(run, { ask, wiki: wikiFixture, ...PLAIN }), true);
  const root = run.nodes[0];
  assert.equal(root.status, "resolved");
  assert.match(root.finding, /^It has been shrinking since the 1960s/);
  assert.deepEqual(root.evidence, ["e2"]);
  assert.deepEqual(seen[1].options, ["Geography", "Receding shoreline"]);
  assert.equal(run.lookups, 2);
  assert.deepEqual(unreadSections(run, root), [{ article: "Dead Sea", headings: ["Geography"] }]);
});

test("with lookups exhausted the walk hands down one question; the parent later chooses among its children's findings", async () => {
  const run = createRun("Why is the Dead Sea shrinking?", "live", { maxLookups: 2, ...ONE });
  const { ask } = scripted([["sentence", "none"], ["section", "Geography"], ["sentence", "none"], ["question", "What diverts water from the Jordan River?"]]);
  assert.equal(await runWalk(run, { ask, wiki: wikiFixture, ...PLAIN }), true);
  assert.equal(run.nodes[0].status, "waiting");
  assert.equal(run.nodes.length, 2);
  assert.equal(run.nodes[1].question, "What diverts water from the Jordan River?");
  // The child's own question finds no article, so it is asked what to search
  // for, reads that, and picks.
  // ("Dead Sea" shares no content word with the child's question, so its pick is confirmed.)
  const child = scripted([["search", "Dead Sea"], ["sentence", "2"], ["answers", "yes"]]);
  assert.equal(nextRunnable(run).id, "n2");
  assert.equal(await runWalk(run, { ask: child.ask, wiki: wikiFixture, ...PLAIN }), true);
  assert.equal(run.nodes[1].status, "resolved");
  assert.equal(run.nodes[1].finding, "Its main tributary is the Jordan River.");
  assert.deepEqual(run.nodes[1].evidence, ["e3"], "the child reads its own copy of the lead");
  assert.equal(run.nodes[1].failedLookups[0].query, "diverts water from Jordan River");
  // The parent runs again and sees the child's finding first, then its own excerpt.
  assert.equal(nextRunnable(run).id, "n1");
  const pool = candidates(run, run.nodes[0]);
  assert.equal(pool[0].from, "child");
  assert.deepEqual(pool[0].evidence, ["e3"]);
  assert.equal(pool.length, 1 + 2 + 3, "the child's finding, then Geography's two sentences, then the lead's three");
  const parent = scripted([["sentence", "1"]]);
  assert.equal(await runWalk(run, { ask: parent.ask, wiki: wikiFixture, ...PLAIN }), true);
  assert.equal(run.nodes[0].status, "resolved");
  assert.equal(run.nodes[0].finding, run.nodes[1].finding);
  assert.deepEqual(run.nodes[0].evidence, ["e3"]);
});

test("a parent that finds none of its children's sentences answers alone still resolves with what they found", async () => {
  const run = createRun("Why is the Dead Sea shrinking?", "live", { maxLookups: 1, ...ONE });
  await runWalk(run, { ask: scripted([["sentence", "none"], ["question", "What feeds the Dead Sea?"]]).ask, wiki: wikiFixture, ...PLAIN });
  await runWalk(run, { ask: scripted([["sentence", "2"]]).ask, wiki: wikiFixture, ...PLAIN });
  assert.equal(run.nodes[1].finding, "Its main tributary is the Jordan River.");
  // The parent has judged its own lead already this visit? No: each visit
  // judges afresh. It sees the child's finding and its own three sentences.
  const parent = scripted([["sentence", "none"]]);
  assert.equal(await runWalk(run, { ask: parent.ask, wiki: wikiFixture, ...PLAIN }), true);
  assert.equal(run.nodes[0].status, "resolved");
  assert.equal(run.nodes[0].finding, "Its main tributary is the Jordan River.");
  assert.ok(run.trace.some((event) => event.event === "node_resolved" && event.node === "n1"));
});

test("a repeated question is refused by code and the node blocks", async () => {
  const run = createRun("Why is the Dead Sea shrinking?", "live", { maxLookups: 1, ...ONE });
  const { ask } = scripted([["sentence", "none"], ["question", "Why is the Dead Sea shrinking?"]]);
  assert.equal(await runWalk(run, { ask, wiki: wikiFixture, ...PLAIN }), true);
  assert.equal(run.nodes[0].status, "blocked");
  assert.equal(run.nodes.length, 1);
  assert.ok(run.trace.some((event) => event.event === "question_rejected"));
  assert.equal(isRepeat(run, run.nodes[0], "why is the dead sea SHRINKING"), true);
  assert.equal(isRepeat(run, run.nodes[0], "What causes the Dead Sea to shrink?"), true, "a paraphrase keeping every content word is a repeat");
  assert.equal(isRepeat(run, run.nodes[0], "What is the source of the water being removed from the Dead Sea?"), false, "a narrower question is not");
  assert.equal(isRepeat(run, run.nodes[0], "What feeds it?"), false);
});

test("flat limits: no children, the walk searches for what is missing and reads on", async () => {
  const run = createRun("Why is the Dead Sea shrinking?", "live", { maxDepth: 0, maxLookups: 6, maxPasses: 8, ...ONE });
  // The lead answers nothing; both sections get read; a search finds nothing;
  // the same search again is refused by code and the node blocks.
  const { ask, seen } = scripted([["sentence", "none"], ["section", "Receding shoreline"], ["sentence", "none"], ["section", "Geography"], ["sentence", "none"], ["search", "Jordan River"], ["search", "jordan river"]]);
  assert.equal(await runWalk(run, { ask, wiki: wikiFixture, ...PLAIN }), true);
  assert.equal(run.nodes[0].status, "blocked");
  assert.equal(run.nodes.length, 1, "no question ask at depth 0");
  assert.equal(run.lookups, 4);
  assert.deepEqual(run.nodes[0].failedLookups.map((entry) => entry.query), ["Jordan River", "jordan river"]);
  assert.equal(run.nodes[0].failedLookups.at(-1).error, "Already tried.");
  assert.ok(!seen.some((call) => call.field === "question"));
});

test("a bad pick pauses the visit as an error and a cancellation leaves the node open", async () => {
  const run = createRun("What is the Dead Sea's main tributary?", "live", ONE);
  assert.equal(await runWalk(run, { ask: scripted([["sentence", "9"]]).ask, wiki: wikiFixture, ...PLAIN }), false);
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

test("by default a pick is checked with one yes-or-no on that sentence; a no is treated as none", async () => {
  const run = createRun("What is the Dead Sea's main tributary?", "live", ONE);
  const { ask, seen } = scripted([["sentence", "2"], ["answers", "yes"]]);
  assert.equal(await runWalk(run, { ask, wiki: wikiFixture, variants: { sentence: "check", article: "off" } }), true);
  assert.equal(run.nodes[0].finding, "Its main tributary is the Jordan River.");
  assert.match(seen[1].user, /^Question: What is the Dead Sea's main tributary\?\nSentence: Its main tributary is the Jordan River\.$/);
  assert.match(run.promptVersion, /sentence:check/);
  assert.equal(run.modelCalls, 2);

  // The wrong lake: the check says no, so the walk reads on instead of resolving.
  const wrong = createRun("What is the Dead Sea's main tributary?", "live", { maxLookups: 1, maxDepth: 0, ...ONE });
  const doubted = scripted([["sentence", "2"], ["answers", "no"], ["section", "Geography"]]);
  assert.equal(await runWalk(wrong, { ask: doubted.ask, wiki: wikiFixture, variants: { sentence: "check", article: "off" } }), true);
  assert.notEqual(wrong.nodes[0].status, "resolved");
  assert.ok(wrong.trace.some((event) => event.event === "sentence_picked" && event.pick === "none"));

  // An out-of-range pick is rejected before any check.
  const bad = createRun("What is the Dead Sea's main tributary?", "live", ONE);
  assert.equal(await runWalk(bad, { ask: scripted([["sentence", "9"]]).ask, wiki: wikiFixture, variants: { sentence: "check", article: "off" } }), false);
  assert.match(bad.nodes[0].reason, /picked sentence 9/);
});

test("a finding can gather several sentences: after a pick the walk asks again over what remains, up to maxSentences", async () => {
  const run = createRun("What is the Dead Sea like?", "live", { maxLookups: 1 });
  const { ask, seen } = scripted([["sentence", "1"], ["sentence", "2"], ["sentence", "none"]]);
  assert.equal(await runWalk(run, { ask, wiki: wikiFixture, ...PLAIN }), true);
  assert.equal(run.nodes[0].finding, "The Dead Sea is a salt lake bordered by Jordan and Israel. The Dead Sea is receding at a swift rate today.");
  assert.deepEqual(run.nodes[0].evidence, ["e1"]);
  assert.deepEqual(seen[1].options, ["1", "2", "none"], "the second pick no longer shows the chosen sentence");
  assert.match(seen[1].user, /1\. Its main tributary/);
  const capped = createRun("What is the Dead Sea like?", "live", { maxSentences: 2, maxLookups: 1 });
  await runWalk(capped, { ask: scripted([["sentence", "1"], ["sentence", "1"]]).ask, wiki: wikiFixture, ...PLAIN });
  assert.equal(capped.nodes[0].status, "resolved");
  assert.equal(capped.nodes[0].finding.split(". ").length, 2);
});

test("after a first answer the walk reads on into a chosen section while lookups remain, and gathers from it", async () => {
  // The lead's "receding at a swift rate" is an answer to the shape of the
  // question, not to why; with a lookup left the walk reads the section the
  // model picks and asks again over it, and the finding has both.
  const run = createRun("Why is the Dead Sea shrinking?", "live");
  const { ask, seen } = scripted([["sentence", "3"], ["sentence", "none"], ["section", "Receding shoreline"], ["sentence", "2"], ["sentence", "none"]]);
  assert.equal(await runWalk(run, { ask, wiki: wikiFixture, ...PLAIN }), true);
  const root = run.nodes[0];
  assert.equal(root.status, "resolved");
  assert.equal(root.finding, "The Dead Sea is receding at a swift rate today. It has been shrinking since the 1960s because of diversion of the Jordan River by the National Water Carrier.");
  assert.deepEqual(root.evidence, ["e1", "e2"]);
  assert.equal(run.lookups, 2, "lead, then the section");
  assert.equal(seen[2].field, "section");
  assert.ok(run.trace.some((event) => event.event === "section_chosen" && event.readOn === true));
  // With one sentence wanted, or no lookups left, or no unread section, it resolves at once.
  const one = createRun("Why is the Dead Sea shrinking?", "live", ONE);
  await runWalk(one, { ask: scripted([["sentence", "3"]]).ask, wiki: wikiFixture, ...PLAIN });
  assert.equal(one.nodes[0].finding, "The Dead Sea is receding at a swift rate today.");
  assert.equal(one.lookups, 1);
});

test("a question about two named subjects is split by code, one child per subject, and the parent's answer is their findings", async () => {
  const ARAL = "The Aral Sea was an endorheic lake between Kazakhstan and Uzbekistan. It began shrinking in the 1960s after the rivers that fed it were diverted by Soviet irrigation projects.";
  const wiki = async (query, options = {}) => (/aral/i.test(query) ? { ok: true, kind: "wiki", title: "Aral Sea", article: "Aral Sea", section: 0, headings: [], text: ARAL, url: "u" } : wikiFixture(query, options));
  const run = createRun("Why did the Dead Sea and the Aral Sea both shrink?", "live", { maxLookups: 1, ...ONE });
  assert.equal(splitSubjects(run.nodes[0].question).length, 2);
  assert.deepEqual(splitSubjects("Why is the Dead Sea shrinking?"), []);
  assert.deepEqual(splitSubjects("What do the shrinking of Lake Chad and the Dead Sea have in common?"), ["Lake Chad", "the Dead Sea"]);
  assert.equal(searchTerm("Why did the Dead Sea and the Aral Sea both shrink? — about the Aral Sea"), "Aral Sea shrink", "a child's search term drops the other subject and the joining words");
  const { ask, seen } = scripted([["sentence", "3"], ["sentence", "2"]]);
  // Visit 1: the root splits without a model call.
  assert.equal(await runWalk(run, { ask, wiki, ...PLAIN }), true);
  assert.equal(run.nodes[0].status, "waiting");
  assert.deepEqual(run.nodes.slice(1).map((node) => node.question), ["Why did the Dead Sea and the Aral Sea both shrink? — about the Dead Sea", "Why did the Dead Sea and the Aral Sea both shrink? — about the Aral Sea"]);
  assert.equal(run.modelCalls, 0);
  assert.ok(run.trace.some((event) => event.event === "question_split"));
  // Visits 2 and 3: each child reads its own article and picks.
  assert.equal(await runWalk(run, { ask, wiki, ...PLAIN }), true);
  assert.equal(await runWalk(run, { ask, wiki, ...PLAIN }), true);
  assert.equal(run.nodes[1].finding, "The Dead Sea is receding at a swift rate today.");
  assert.match(run.nodes[2].finding, /^It began shrinking in the 1960s/);
  assert.equal(run.trace.filter((event) => event.event === "tool_proposed").map((event) => event.query).join(" | "), "Dead Sea shrink | Aral Sea shrink");
  // Visit 4: the parent gathers both, no pick.
  assert.equal(await runWalk(run, { ask, wiki, ...PLAIN }), true);
  assert.equal(run.nodes[0].status, "resolved");
  assert.equal(run.nodes[0].finding, `${run.nodes[1].finding} ${run.nodes[2].finding}`);
  assert.deepEqual(run.nodes[0].evidence, ["e1", "e2"]);
  assert.equal(run.modelCalls, 2);
  assert.equal(seen.length, 2);
  // A one-node run (the flat control) never splits.
  const flat = createRun("Why did the Dead Sea and the Aral Sea both shrink?", "live", { maxDepth: 0, maxNodes: 1, ...ONE });
  await runWalk(flat, { ask: scripted([["sentence", "2"]]).ask, wiki, ...PLAIN });
  assert.equal(flat.nodes.length, 1);
  assert.equal(flat.nodes[0].status, "resolved");
  assert.match(flat.nodes[0].finding, /^It began shrinking/, "one article, half the answer");
});

test("a brief reads the lead, hands one child per chosen section, each child may hop once, and the root's finding is the profile in order", async () => {
  const TURING = "Alan Turing was an English mathematician and computer scientist. He was highly influential in the development of theoretical computer science. Turing is widely considered to be the father of theoretical computer science.";
  const WAR = "During the Second World War, Turing worked for the Government Code and Cypher School at Bletchley Park. He devised techniques for speeding the breaking of German ciphers, including improvements to the bombe.";
  const LEGACY = "Turing has been honoured in various ways in Manchester, the city where he worked. The Turing Award is given annually for contributions to computer science.";
  const BOMBE = "The bombe was an electro-mechanical device used by British cryptologists to help decipher Enigma. The initial design was produced by Turing at Bletchley Park.";
  const wiki = async (query, { readOn } = {}) => {
    if (readOn) return { ok: true, kind: "wiki", title: `Alan Turing § ${readOn.section}`, article: "Alan Turing", section: readOn.section === "War" ? 1 : 2, text: readOn.section === "War" ? WAR : LEGACY, url: "u" };
    if (/bombe/i.test(query)) return { ok: true, kind: "wiki", title: "Bombe", article: "Bombe", section: 0, headings: [], text: BOMBE, url: "u" };
    if (/turing/i.test(query)) return { ok: true, kind: "wiki", title: "Alan Turing", article: "Alan Turing", section: 0, headings: ["War", "Legacy"], text: TURING, url: "u" };
    return { ok: false, error: { kind: "no_match", message: `nothing for ${query}` } };
  };
  assert.equal(isBrief("Tell me about Alan Turing and elaborate on the impact of his work."), true);
  assert.equal(isBrief("Why is the Dead Sea shrinking?"), false);
  assert.equal(isBrief("Explain why the Dead Sea is shrinking?"), true);
  const run = createRun("Tell me about Alan Turing and elaborate on the impact of his work.", "live", { maxSentences: 2, maxLookups: 2 });
  // Root: two lead picks, then the sections: War, Legacy, none.
  const { ask, seen } = scripted([["sentence", "1"], ["sentence", "1"], ["section", "War"], ["section", "Legacy"], ["section", "none"]]);
  assert.equal(await runWalk(run, { ask, wiki, ...PLAIN }), true);
  const root = run.nodes[0];
  assert.equal(root.status, "waiting");
  assert.equal(seen[0].user.split("\n")[0], "Brief: Tell me about Alan Turing and elaborate on the impact of his work.", "the brief wording");
  assert.deepEqual(seen[2].options, ["War", "Legacy", "none"]);
  assert.deepEqual(seen[3].options, ["Legacy", "none"], "a chosen section is not offered again");
  assert.match(seen[3].user, /Already chosen: War/);
  assert.deepEqual(run.nodes.slice(1).map((node) => [node.question, node.readFirst]), [
    ["Tell me about Alan Turing and elaborate on the impact of his work. — about War", { article: "Alan Turing", section: "War" }],
    ["Tell me about Alan Turing and elaborate on the impact of his work. — about Legacy", { article: "Alan Turing", section: "Legacy" }],
  ]);
  assert.equal(root.kept.length, 2);
  // Child 1 reads its section first, keeps one sentence, hops to the bombe and keeps one more.
  // After the hop the child may keep as many sentences again, so it is asked once more and says none.
  const child = scripted([["sentence", "2"], ["sentence", "none"], ["search", "Bombe"], ["sentence", "2"], ["sentence", "none"]]);
  assert.equal(await runWalk(run, { ask: child.ask, wiki, ...PLAIN }), true);
  assert.equal(run.nodes[1].status, "resolved");
  assert.equal(run.nodes[1].finding, "He devised techniques for speeding the breaking of German ciphers, including improvements to the bombe. The initial design was produced by Turing at Bletchley Park.");
  assert.equal(run.trace.filter((event) => event.event === "tool_proposed" && event.node === "n2")[0].query, "Alan Turing / War", "the section is read first, no search");
  assert.ok(run.trace.some((event) => event.event === "hop_chosen" && event.search === "Bombe"));
  assert.equal(child.seen[2].field, "search");
  assert.match(child.seen[2].user, /^Brief: /);
  // Child 2 keeps one sentence and its hop names its own article, so nothing is read.
  const second = scripted([["sentence", "2"], ["sentence", "none"], ["search", "Alan Turing"]]);
  assert.equal(await runWalk(run, { ask: second.ask, wiki, ...PLAIN }), true);
  assert.equal(run.nodes[2].finding, "The Turing Award is given annually for contributions to computer science.");
  // Root: the profile, no pick.
  const last = scripted([]);
  assert.equal(await runWalk(run, { ask: last.ask, wiki, ...PLAIN }), true);
  assert.equal(root.status, "resolved");
  assert.equal(root.finding, `${TURING.split(". ").slice(0, 2).join(". ")}.\n\n${run.nodes[1].finding}\n\n${run.nodes[2].finding}`);
  assert.deepEqual(root.evidence, ["e1", "e2", "e3", "e4"]);
  assert.equal(last.seen.length, 0);
});

test("the asks that name something see at most one window of sentences", async () => {
  const long = Array.from({ length: 40 }, (_, index) => `Sentence number ${index + 1} says nothing useful about anything at all.`).join(" ");
  const wiki = async (query, options = {}) => (options.readOn ? wikiFixture(query, options) : { ok: true, kind: "wiki", title: "Dead Sea", article: "Dead Sea", section: 0, headings: [], text: long, url: "u" });
  const run = createRun("Why is the Dead Sea shrinking?", "live", { maxLookups: 1, maxPasses: 6, ...ONE });
  const { ask, seen } = scripted([["sentence", "none"], ["sentence", "none"], ["sentence", "none"], ["sentence", "none"], ["question", "What feeds the Dead Sea?"]]);
  assert.equal(await runWalk(run, { ask, wiki, ...PLAIN }), true);
  const question = seen.find((call) => call.field === "question");
  assert.equal((question.user.match(/^\d+\. /gm) || []).length, 12, "one window, not all forty");
});

test("a child question about the text it was shown is refused", async () => {
  const run = createRun("Why did the Aral Sea shrink?", "live", { maxLookups: 1, ...ONE });
  const { ask } = scripted([["sentence", "none"], ["question", "What is the name of the weapon described in the text?"]]);
  const noSea = async (query, options) => (/aral/i.test(query) ? wikiFixture("Dead Sea", options) : wikiFixture(query, options));
  assert.equal(await runWalk(run, { ask, wiki: noSea, ...PLAIN }), true);
  assert.equal(run.nodes.length, 1);
  assert.equal(run.nodes[0].status, "blocked");
  assert.equal(run.trace.find((event) => event.event === "question_rejected").reason, "about the text");
});

test("when a search returns several hits the model picks the article; none is a failed lookup; the pick is remembered", async () => {
  const hits = async (query, options) => {
    if (options?.readOn) return wikiFixture(query, options);
    if (/aral/i.test(query)) return { ok: true, kind: "wiki", title: "North Aral Sea", article: "North Aral Sea", section: 0, headings: [], text: "The North Aral Sea is the northern part of the former Aral Sea, fed by the Syr Darya.", url: "u", alternatives: ["South Aral Sea", "Aral Sea"] };
    return wikiFixture(query, options);
  };
  const seaFixture = async (query, options) => (query === "Aral Sea" ? { ok: true, kind: "wiki", title: "Aral Sea", article: "Aral Sea", section: 0, headings: [], text: "The Aral Sea was a lake between Kazakhstan and Uzbekistan. It began shrinking in the 1960s after the rivers that fed it were diverted for irrigation.", url: "u" } : hits(query, options));
  const run = createRun("Why did the Aral Sea shrink?", "live", ONE);
  const { ask, seen } = scripted([["article", "Aral Sea"], ["sentence", "2"]]);
  assert.equal(await runWalk(run, { ask, wiki: seaFixture, variants: { sentence: "list" } }), true);
  assert.deepEqual(seen[0].options, ["North Aral Sea", "South Aral Sea", "Aral Sea", "none"]);
  assert.equal(run.nodes[0].finding, "It began shrinking in the 1960s after the rivers that fed it were diverted for irrigation.");
  assert.equal(run.evidence.length, 1, "only the chosen article is captured");
  assert.equal(run.evidence[0].title, "Aral Sea");
  assert.equal(run.lookups, 1, "the re-read is part of the same lookup");

  // none is honoured when no title is about the question's subject.
  const foreignHits = async (query, options = {}) => (options.searchOnly ? { ok: true, kind: "search", hits: ["Weapons of Norse mythology", "Kontos (weapon)"] } : { ok: true, kind: "wiki", title: "Weapons of Norse mythology", article: "Weapons of Norse mythology", section: 0, headings: [], text: "Norse myths name many weapons. Mjölnir is Thor's hammer.", url: "u", alternatives: ["Kontos (weapon)"] });
  const refused = createRun("Why did the Aral Sea shrink?", "live", { maxLookups: 1, maxDepth: 0, ...ONE });
  await runWalk(refused, { ask: scripted([["article", "none"]]).ask, wiki: foreignHits, variants: { sentence: "list" } });
  assert.equal(refused.nodes[0].status, "blocked");
  assert.match(refused.nodes[0].failedLookups[0].error, /None of the articles/);
  assert.equal(refused.evidence.length, 0);
});

test("sentences judged as not answering are remembered across visits, so a revisit reads on", async () => {
  const run = createRun("Why is the Dead Sea shrinking?", "live", { maxLookups: 1, maxPasses: 1, ...ONE });
  // Visit 1: the lead's three sentences are shown, none; no lookups left; a child is asked.
  await runWalk(run, { ask: scripted([["sentence", "none"], ["question", "What feeds the Dead Sea?"]]).ask, wiki: wikiFixture, ...PLAIN });
  assert.equal(run.nodes.length, 2);
  // The child blocks (its search finds the same lead, already judged? no — its own copy), keep it simple: block it by hand.
  run.nodes[1].status = "blocked";
  run.nodes[1].reason = "test";
  // Visit 2 of the root: the lead was judged already, so no sentence ask is
  // made over it; the walk goes straight to reading a section.
  const revisit = scripted([["section", "Geography"], ["sentence", "none"], ["question", "What drains the Dead Sea?"]]);
  assert.equal(nextRunnable(run).id, "n1");
  assert.equal(await runWalk(run, { ask: revisit.ask, wiki: wikiFixture, ...PLAIN }), true);
  assert.equal(revisit.seen[0].field, "section", "no re-showing of judged sentences");
  assert.match(revisit.seen[1].user, /1\. The Dead Sea lies in the Jordan Rift Valley/);
  assert.equal(run.nodes.length, 3);
});

test("the first lookup searches both terms and picks from every title found; a foreign source gets its pick confirmed", async () => {
  const searches = [];
  const wiki = async (query, options = {}) => {
    if (options.searchOnly) {
      searches.push(query);
      return query === "Dead Sea shrinking" ? { ok: true, kind: "search", hits: ["Dead Sea", "Aral Sea"], snippets: ["is a salt lake", "was a lake"] } : { ok: true, kind: "search", hits: ["Aral Sea", "List of drying lakes"], snippets: ["was a lake", "lakes that are drying"] };
    }
    if (query === "Aral Sea") return { ok: true, kind: "wiki", title: "Aral Sea", article: "Aral Sea", section: 0, headings: [], text: "The Aral Sea was a lake in Central Asia. It began shrinking in the 1960s after its rivers were diverted for irrigation.", url: "u" };
    return wikiFixture(query, options);
  };
  const run = createRun("Why is the Dead Sea shrinking?", "live", { maxLookups: 1, maxDepth: 0, ...ONE });
  const { ask, seen } = scripted([["article", "Aral Sea"], ["sentence", "2"], ["answers", "no"], ["sentence", "none"]]);
  assert.equal(await runWalk(run, { ask, wiki }), true);
  assert.deepEqual(searches, ["Dead Sea shrinking", "Why is the Dead Sea shrinking?"]);
  assert.deepEqual(seen[0].options, ["Dead Sea", "Aral Sea", "List of drying lakes", "none"], "the union of both searches, in order");
  assert.match(seen[0].user, /- Aral Sea — was a lake/, "each title carries its search snippet");
  assert.equal(seen[2].field, "answers", "a pick from an article foreign to the question is confirmed");
  assert.match(seen[2].user, /Sentence: It began shrinking/);
  assert.notEqual(run.nodes[0].status, "resolved", "the confirmation said no");
  assert.equal(run.lookups, 1);
  assert.equal(isForeign("Aral Sea", "Why is the Dead Sea shrinking?"), true);
  assert.equal(isForeign("Dead Sea § Receding shoreline", "Why is the Dead Sea shrinking?"), false);
  assert.equal(isForeign("Rayleigh scattering", "Why is the sky blue?"), true, "a foreign-looking right article still gets checked; that costs one call, not the answer");

  // The same pick from the question's own subject is taken without a check.
  const own = createRun("Why is the Dead Sea shrinking?", "live", ONE);
  const direct = scripted([["article", "Dead Sea"], ["sentence", "3"]]);
  assert.equal(await runWalk(own, { ask: direct.ask, wiki }), true);
  assert.equal(own.nodes[0].status, "resolved");
  assert.equal(own.modelCalls, 2);
});

test("an article pick of none is honoured only when no title shares a content word with the question", async () => {
  const wiki = async (query, options = {}) => {
    if (options.searchOnly) return { ok: true, kind: "search", hits: ["Dead Sea", "Aral Sea"] };
    return wikiFixture(query, options);
  };
  // 0.6B answered none to every article pick in the walk-4 benchmark and read nothing.
  const run = createRun("Why is the Dead Sea shrinking?", "live", ONE);
  const { ask } = scripted([["article", "none"], ["sentence", "3"]]);
  assert.equal(await runWalk(run, { ask, wiki }), true);
  assert.equal(run.nodes[0].status, "resolved");
  assert.equal(run.evidence[0].title, "Dead Sea");
  assert.ok(run.trace.some((event) => event.event === "article_chosen" && event.article === "none" && event.readInstead === "Dead Sea"));
  const foreign = async (query, options = {}) => (options.searchOnly ? { ok: true, kind: "search", hits: ["Aral Sea", "Caspian Sea"] } : wikiFixture(query, options));
  const none = createRun("Why is the Dead Sea shrinking?", "live", { maxLookups: 1, maxDepth: 0, ...ONE });
  await runWalk(none, { ask: scripted([["article", "none"]]).ask, wiki: foreign });
  assert.equal(none.evidence.length, 0, "none stands when every title is foreign");
});

test("variants by model size: the sentence pick is checked at 8B and above, plain below", () => {
  assert.equal(variantsFor("Qwen3-8B-q4f16_1-MLC").sentence, "check");
  assert.equal(variantsFor("Qwen3-4B-q4f16_1-MLC").sentence, "list");
  assert.equal(variantsFor("Qwen3-1.7B-q4f16_1-MLC").sentence, "list");
  assert.equal(variantsFor("Qwen3-0.6B-q4f16_1-MLC").sentence, "list");
  assert.equal(variantsFor("Qwen3-1.7B-q4f16_1-MLC").article, "snippets");
});
