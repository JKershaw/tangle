import { test } from "node:test";
import assert from "node:assert/strict";
import { applyResult, captureEvidence, createRun, nextRunnable } from "../src/graph.js";
import { briefSubject, candidates, isBrief, isForeign, isRepeat, namesIn, occurs, runWalk, searchTerm, splitSubjects, unreadSections, variantsFor } from "../src/walk.js";

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
    seen.push({ field, system: call.messages[0].content, user: call.messages[1].content, options: call.schema.properties[field].enum ?? null });
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

test("a brief's search term is its subject, and a hit that is the search term itself is read without asking", async () => {
  assert.equal(searchTerm("Tell me about the Hubble Space Telescope and what it has discovered."), "Hubble Space Telescope");
  assert.equal(searchTerm("Tell me about Alan Turing and elaborate on the impact of his work."), "Alan Turing");
  assert.equal(searchTerm("Describe the Great Barrier Reef and the threats it faces."), "Great Barrier Reef");
  assert.equal(briefSubject("Tell me about coral bleaching."), null, "no capitalised subject");
  assert.equal(searchTerm("Tell me about the Antikythera mechanism and how it was decoded."), "Antikythera mechanism", "lower-case words continue the subject up to a joining word: not Antikythera, the island");
  assert.equal(searchTerm("Tell me about the Rosetta mission and what it found at comet 67P."), "Rosetta mission");
  assert.equal(briefSubject("Describe Marie Curie, her discoveries and their influence."), "Marie Curie", "a mark ends the subject");
  assert.equal(briefSubject("Tell me about the Aral Sea and the efforts to restore it."), "Aral Sea");
  assert.equal(searchTerm("Tell me about coral bleaching."), "coral bleaching", "the brief's framing words are not search terms");
  const hits = { "Hubble Space Telescope": ["Nancy Grace Roman Space Telescope", "Hubble Space Telescope", "Edwin Hubble"], "Tell me about the Hubble Space Telescope and what it has discovered.": ["Edwin Hubble", "Nancy Grace Roman Space Telescope"] };
  const wiki = async (query, options = {}) => {
    if (options.searchOnly) return { ok: true, kind: "search", hits: hits[query] ?? [], snippets: [] };
    return { ok: true, kind: "wiki", title: query, article: query, section: 0, headings: [], text: `${query} is an orbiting observatory that has discovered much.`, url: "u" };
  };
  const run = createRun("Tell me about the Hubble Space Telescope and what it has discovered.", "live", { maxSentences: 1, maxDepth: 0 });
  const { ask, seen } = scripted([["sentence", "1"]]);
  assert.equal(await runWalk(run, { ask, wiki, variants: { sentence: "list" } }), true);
  assert.equal(seen.length, 1, "no article ask: the exact title was read by code");
  assert.equal(run.evidence[0].title, "Hubble Space Telescope");
  assert.ok(run.trace.some((event) => event.event === "article_chosen" && event.byCode === true && event.article === "Hubble Space Telescope"));
});

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

test("with lookups exhausted the walk hands down one question; when it answers, the parent's answer is what it found, with no pick", async () => {
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
  // The parent runs again. Its child's finding is not a sentence it can pick
  // (a finding is not evidence), and it is not asked anything: the answer to
  // the question it handed down is the answer to its own.
  assert.equal(nextRunnable(run).id, "n1");
  assert.ok(candidates(run, run.nodes[0]).every((candidate) => candidate.from !== "child"));
  const parent = scripted([]);
  const before = run.trace.length;
  assert.equal(await runWalk(run, { ask: parent.ask, wiki: wikiFixture, ...PLAIN }), true);
  assert.deepEqual(parent.seen, []);
  assert.ok(!run.trace.slice(before).some((event) => event.event === "model_input"));
  assert.equal(run.nodes[0].status, "resolved");
  assert.equal(run.nodes[0].finding, run.nodes[1].finding);
  assert.deepEqual(run.nodes[0].evidence, ["e3"]);
});

test("a parent is never asked to judge its child's finding, so no none over it can be overridden (the observer's case)", async () => {
  // Before walk-14 the parent was shown the finding as "a finding below",
  // said none, and resolved with it anyway. The model is not asked; the
  // resolution is code's and traced as the harness's.
  const run = createRun("Why is the Dead Sea shrinking?", "live");
  applyResult(run, "n1", { action: "decompose", questions: ["What colour is the sky?"] }, []);
  const finding = "The sky often appears blue during the daytime.";
  captureEvidence(run, "n2", { ok: true, kind: "wiki", title: "Sky", text: finding, url: "https://en.wikipedia.org/wiki/Sky" });
  const evidence = [run.evidence[0].id];
  applyResult(run, "n2", { action: "resolved", finding, evidence }, evidence);
  assert.equal(await runWalk(run, { ask: async () => { throw new Error("The model was asked."); }, wiki: async () => { throw new Error("Unexpected lookup"); }, ...PLAIN }), true);
  assert.ok(!run.trace.some((event) => event.event === "sentence_picked"));
  assert.equal(run.nodes[0].status, "resolved");
  assert.equal(run.nodes[0].finding, finding);
  assert.deepEqual(run.nodes[0].evidence, evidence);
  assert.ok(run.trace.some((event) => event.event === "node_resolved" && event.node === "n1" && event.result?.harness === true));
});

test("a question whose handed-down question blocked judges its own excerpts again and blocks honestly when nothing answers", async () => {
  const run = createRun("Why is the Dead Sea shrinking?", "live", { maxLookups: 1, maxNodes: 2, ...ONE });
  await runWalk(run, { ask: scripted([["sentence", "none"], ["question", "What feeds the Dead Sea?"]]).ask, wiki: wikiFixture, ...PLAIN });
  applyResult(run, "n2", { action: "blocked", reason: "Nothing could be read for this question." }, []);
  // Its lead was judged on the first visit and is remembered; it is asked
  // for a heading (none) and a search term (the article it has read, so
  // nothing new), and with no room for another question it blocks.
  const parent = scripted([["section", "none"], ["search", "Dead Sea"]]);
  assert.equal(await runWalk(run, { ask: parent.ask, wiki: wikiFixture, ...PLAIN }), true);
  assert.deepEqual(parent.seen.map((entry) => entry.field), ["section", "search"]);
  assert.equal(run.nodes[0].status, "blocked");
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

test("a brief reads the lead, hands one child per chosen section; a child hands the things it kept name to children of its own; the root's finding is the profile in order", async () => {
  const TURING = "Alan Turing was an English mathematician and computer scientist. He was highly influential in the development of theoretical computer science. Turing is widely considered to be the father of theoretical computer science.";
  const WAR = "During the Second World War, Turing worked for the Government Code and Cypher School at Bletchley Park. He devised techniques for speeding the breaking of German ciphers, including improvements to the bombe.";
  const LEGACY = "Turing has been honoured in various ways in Manchester, the city where he worked. The Turing Award is given annually for contributions to computer science, and a bombe is displayed at Bletchley Park.";
  const BOMBE = "The bombe was an electro-mechanical device used by British cryptologists to help decipher Enigma. The initial design was produced by Turing at Bletchley Park. Each bombe weighed about a ton and stood over six feet tall.";
  const LINKS = { "Alan Turing": ["Bombe", "Bletchley Park", "Enigma machine", "Government Code and Cypher School", "Manchester", "Turing Award"], Bombe: ["Enigma machine", "Alan Turing", "Bletchley Park"], "Bletchley Park": ["Milton Keynes", "Government Code and Cypher School"] };
  const PARK = "Bletchley Park is an English country house and estate in Milton Keynes. During the Second World War it housed the Government Code and Cypher School, where Turing worked. It is now a museum open to the public every day.";
  const ABOUT = { Bombe: BOMBE, "Bletchley Park": PARK, "Turing Award": "The Turing Award is an annual prize given by the ACM, named after Alan Turing." };
  const reads = [];
  const wiki = async (query, { readOn, links } = {}) => {
    if (links) return { ok: true, kind: "links", title: query, links: LINKS[query] ?? [] };
    if (readOn) reads.push(`${readOn.article} / ${readOn.section}${readOn.about ? ` about ${readOn.about}` : ""}`);
    if (readOn?.about) return ABOUT[readOn.article] ? { ok: true, kind: "wiki", title: readOn.article, article: readOn.article, section: 0, about: readOn.about, text: ABOUT[readOn.article], url: "u" } : { ok: false, error: { kind: "no_match", message: `"${readOn.article}" never mentions ${readOn.about}.` } };
    if (readOn) return { ok: true, kind: "wiki", title: `Alan Turing § ${readOn.section}`, article: "Alan Turing", section: readOn.section === "War" ? 1 : 2, text: readOn.section === "War" ? WAR : LEGACY, url: "u" };
    if (/bombe/i.test(query)) return { ok: true, kind: "wiki", title: "Bombe", article: "Bombe", section: 0, headings: ["Design", "Use"], text: BOMBE, url: "u" };
    if (/turing/i.test(query)) return { ok: true, kind: "wiki", title: "Alan Turing", article: "Alan Turing", section: 0, headings: ["War", "Legacy"], text: TURING, url: "u" };
    return { ok: false, error: { kind: "no_match", message: `nothing for ${query}` } };
  };
  assert.equal(isBrief("Tell me about Alan Turing and elaborate on the impact of his work."), true);
  assert.equal(isBrief("Why is the Dead Sea shrinking?"), false);
  assert.equal(isBrief("Explain why the Dead Sea is shrinking?"), true);
  const run = createRun("Tell me about Alan Turing and elaborate on the impact of his work.", "live", { maxSentences: 2, maxLookups: 2 });
  // Root: two lead picks and a none (a brief's root may keep twice maxSentences), then the sections: Legacy, War, none.
  const { ask, seen } = scripted([["sentence", "1"], ["sentence", "1"], ["sentence", "none"], ["section", "Legacy"], ["section", "War"], ["section", "none"]]);
  assert.equal(await runWalk(run, { ask, wiki, ...PLAIN }), true);
  const root = run.nodes[0];
  assert.equal(root.status, "waiting");
  assert.equal(seen[0].user.split("\n")[0], "Brief: Tell me about Alan Turing and elaborate on the impact of his work.", "the brief wording");
  assert.deepEqual(seen[3].options, ["War", "Legacy", "none"]);
  assert.deepEqual(seen[4].options, ["War", "none"], "a chosen section is not offered again");
  assert.match(seen[4].user, /Already chosen: Legacy/);
  // Chosen Legacy then War; the children follow the article's order.
  assert.deepEqual(run.nodes.slice(1).map((node) => [node.question, node.readFirst]), [
    ["Tell me about Alan Turing and elaborate on the impact of his work. — about War", { article: "Alan Turing", section: "War" }],
    ["Tell me about Alan Turing and elaborate on the impact of his work. — about Legacy", { article: "Alan Turing", section: "Legacy" }],
  ]);
  assert.equal(root.kept.length, 2);
  // Child 1 reads its section first and keeps one sentence. The article's
  // links that occur in that sentence — "Bombe", as "bombe" — are offered
  // (with links to hand, no capitalised phrase such as "German" is); it
  // picks the Bombe and there is nothing left to offer.
  const child = scripted([["sentence", "2"], ["sentence", "none"], ["search", "Bombe"]]);
  assert.equal(await runWalk(run, { ask: child.ask, wiki, ...PLAIN }), true);
  assert.equal(run.nodes[1].status, "waiting");
  assert.equal(run.trace.filter((event) => event.event === "tool_proposed" && event.node === "n2")[0].query, "Alan Turing / War", "the section is read first, no search");
  assert.deepEqual(child.seen[2].options, ["Bombe", "none"]);
  assert.match(child.seen[2].user, /^Brief: /);
  assert.match(child.seen[2].user, /Kept:\n1\. He devised techniques/);
  assert.equal(child.seen.length, 3, "nothing left to offer, so no second ask");
  assert.ok(run.trace.some((event) => event.event === "hop_checked" && event.name === "Bombe" && event.says === true), "code read the Bombe for what it says about Turing before offering it");
  assert.deepEqual(run.trace.find((event) => event.event === "hops_chosen" && event.node === "n2"), { ...run.trace.find((event) => event.event === "hops_chosen" && event.node === "n2"), offered: ["Bombe"], chosen: ["Bombe"] });
  assert.deepEqual([run.nodes[3].question, run.nodes[3].hopTo, run.nodes[3].depth], ["Tell me about Alan Turing and elaborate on the impact of his work. — about Bombe", "Bombe", 2], "the brief with a new focus, not the section's");
  // The Bombe child reads that article for what it says about Turing; only such sentences are offered; it keeps one, and is offered Bletchley Park (named in it, and its article names Turing) as a hop of its own.
  const hop = scripted([["sentence", "1"], ["search", "Bletchley Park"]]);
  assert.equal(await runWalk(run, { ask: hop.ask, wiki, ...PLAIN }), true, run.nodes[3].reason);
  assert.ok(reads.includes("Bombe / 0 about Alan Turing"), "a linked name is an article title: read directly for what it says about the subject, no search");
  assert.deepEqual(hop.seen[0].options, ["1", "none"], "of the Bombe's three sentences only the one naming Turing is offered");
  assert.match(hop.seen[0].user, /1\. The initial design was produced by Turing/);
  assert.deepEqual(hop.seen[1].options, ["Bletchley Park", "none"], "one sentence on subject, so no second pick; then the names");
  assert.equal(run.nodes[3].status, "waiting");
  assert.deepEqual([run.nodes[4].hopTo, run.nodes[4].depth], ["Bletchley Park", 3]);
  // A hop's hop is a leaf: it keeps what names Turing and is offered nothing.
  const leaf = scripted([["sentence", "1"]]);
  assert.equal(await runWalk(run, { ask: leaf.ask, wiki, ...PLAIN }), true, run.nodes[4].reason);
  assert.equal(leaf.seen.length, 1, "no names asked of a hop's hop");
  assert.equal(run.nodes[4].finding, "During the Second World War it housed the Government Code and Cypher School, where Turing worked.");
  assert.equal(run.nodes.length, 5);
  // The Bombe child gathers its sentence and its child's; child 1 gathers its sentence and the Bombe's paragraphs.
  assert.equal(await runWalk(run, { ask: scripted([]).ask, wiki, ...PLAIN }), true);
  assert.equal(run.nodes[3].finding, "The initial design was produced by Turing at Bletchley Park.\n\nDuring the Second World War it housed the Government Code and Cypher School, where Turing worked.");
  assert.equal(await runWalk(run, { ask: scripted([]).ask, wiki, ...PLAIN }), true);
  assert.equal(run.nodes[1].status, "resolved");
  assert.equal(run.nodes[1].finding, "He devised techniques for speeding the breaking of German ciphers, including improvements to the bombe.\n\nThe initial design was produced by Turing at Bletchley Park.\n\nDuring the Second World War it housed the Government Code and Cypher School, where Turing worked.");
  // Child 2 keeps one sentence naming the Bombe and Bletchley Park (both opened already, so not offered) and the Turing Award, whose article names Turing.
  const second = scripted([["sentence", "2"], ["sentence", "none"], ["search", "none"]]);
  assert.equal(await runWalk(run, { ask: second.ask, wiki, ...PLAIN }), true);
  assert.deepEqual(second.seen[2].options, ["Turing Award", "none"]);
  assert.equal(run.nodes[2].finding, "The Turing Award is given annually for contributions to computer science, and a bombe is displayed at Bletchley Park.");
  assert.equal(run.lookups, 5, "lead, War, Bombe, Bletchley Park, Legacy — neither the links nor code's checks are lookups");
  // Root: the profile, no pick.
  const last = scripted([]);
  assert.equal(await runWalk(run, { ask: last.ask, wiki, ...PLAIN }), true);
  assert.equal(root.status, "resolved");
  assert.equal(root.finding, `${TURING.split(". ").slice(0, 2).join(". ")}.\n\n${run.nodes[1].finding}\n\n${run.nodes[2].finding}`);
  assert.deepEqual(root.evidence, ["e1", "e2", "e3", "e4", "e5"]);
  assert.equal(last.seen.length, 0);
  // With no room left for every open node's hops, none are offered.
  const tight = createRun("Tell me about Alan Turing and elaborate on the impact of his work.", "live", { maxSentences: 2, maxLookups: 2, maxNodes: 5 });
  await runWalk(tight, { ask: scripted([["sentence", "1"], ["sentence", "1"], ["sentence", "none"], ["section", "Legacy"], ["section", "War"], ["section", "none"]]).ask, wiki, ...PLAIN });
  const starved = scripted([["sentence", "2"], ["sentence", "none"]]);
  assert.equal(await runWalk(tight, { ask: starved.ask, wiki, ...PLAIN }), true);
  assert.equal(starved.seen.length, 2, "three nodes of five, one sibling still open and owed two hops: no room, no names asked");
  assert.equal(tight.nodes[1].status, "resolved");
});

test("without an article's links the names are capitalised phrases, still checked against the subject; a sentence kept anywhere is never offered again", async () => {
  const TURING = "Alan Turing was an English mathematician. He worked at Bletchley Park during the war.";
  const GCCS = "The Government Code and Cypher School was a British signals intelligence agency. Alan Turing joined the school there in September 1939.";
  const wiki = async (query, { readOn, links } = {}) => {
    if (links) return { ok: false, error: { kind: "unreachable", message: "no links here" } };
    if (readOn?.about) return readOn.article === "Government Code" ? { ok: true, kind: "wiki", title: "Government Code and Cypher School", article: "Government Code and Cypher School", section: 0, about: readOn.about, text: GCCS, url: "u" } : { ok: false, error: { kind: "no_match", message: `"${readOn.article}" never mentions ${readOn.about}.` } };
    if (readOn && readOn.article !== "Alan Turing") return { ok: false, error: { kind: "no_match", message: `no article ${readOn.article}` } };
    if (readOn) return { ok: true, kind: "wiki", title: `Alan Turing § ${readOn.section}`, article: "Alan Turing", section: 1, text: "He worked at Bletchley Park during the war. The Government Code and Cypher School was based there.", url: "u" };
    if (/turing/i.test(query)) return { ok: true, kind: "wiki", title: "Alan Turing", article: "Alan Turing", section: 0, headings: ["War"], text: TURING, url: "u" };
    return { ok: false, error: { kind: "no_match", message: `nothing for ${query}` } };
  };
  assert.deepEqual(namesIn(["During the Second World War, Turing worked for the Government Code and Cypher School at Bletchley Park."], "Tell me about Alan Turing"), ["Second World War", "Government Code", "Cypher School", "Bletchley Park"]);
  assert.deepEqual(namesIn(["Turing is widely considered the father of computer science."], "Tell me about Alan Turing"), [], "the subject alone names nothing new");
  assert.equal(occurs("Bombe", "improvements to the bombe."), true);
  assert.equal(occurs("Mercury (planet)", "Mercury is the smallest planet."), true);
  assert.equal(occurs("Bomb", "the bombe"), false, "whole words only");
  assert.equal(occurs("Émile Zola", "a letter from ÉMILE ZOLA, printed"), true, "case folds beyond ASCII");
  assert.equal(occurs("Zola", "Zola's letter; then Émile Zola again"), true, "the same text tested twice keeps the same answer");
  assert.equal(occurs("Bombe", "improvements to the bombe."), true, "and a title seen before still matches a new text");
  const run = createRun("Tell me about Alan Turing.", "live", { maxSentences: 1, maxLookups: 2 });
  // Root keeps the Bletchley Park sentence and hands down War; the child reads the section, where that sentence is repeated: it is not offered again.
  assert.equal(await runWalk(run, { ask: scripted([["sentence", "2"], ["sentence", "none"], ["section", "War"], ["section", "none"]]).ask, wiki, ...PLAIN }), true);
  const child = scripted([["sentence", "1"], ["search", "Government Code"]]);
  assert.equal(await runWalk(run, { ask: child.ask, wiki, ...PLAIN }), true, run.nodes.at(-1)?.reason);
  assert.deepEqual(child.seen[0].options, ["1", "none"], "the sentence the root kept is not offered to the child");
  assert.match(child.seen[0].user, /1\. The Government Code and Cypher School was based there/);
  assert.deepEqual(child.seen[1].options, ["Government Code", "none"], "capitalised phrases when the links are unavailable, and only those whose article names the subject: Cypher School's does not, Bletchley Park was not in the kept sentence");
  assert.deepEqual(run.trace.filter((event) => event.event === "hop_checked").map((event) => [event.name, event.says]), [["Government Code", true], ["Cypher School", false]]);
  assert.equal(run.nodes[2].hopTo, "Government Code");
  // The hop child reads what its article says about Turing and keeps it; the parent's paragraph is its sentence and its child's.
  const grand = scripted([["sentence", "1"]]);
  assert.equal(await runWalk(run, { ask: grand.ask, wiki, ...PLAIN }), true, run.nodes[2].reason);
  assert.equal(run.nodes[2].finding, "Alan Turing joined the school there in September 1939.");
  assert.equal(run.lookups, 3, "lead, War, Government Code — code's checks are not lookups");
  assert.equal(await runWalk(run, { ask: scripted([]).ask, wiki, ...PLAIN }), true);
  assert.equal(run.nodes[1].finding, "The Government Code and Cypher School was based there.\n\nAlan Turing joined the school there in September 1939.");
  // At the depth limit, or under flat limits, no hops are offered.
  const shallow = createRun("Tell me about Alan Turing.", "live", { maxSentences: 1, maxLookups: 2, maxDepth: 1 });
  await runWalk(shallow, { ask: scripted([["sentence", "2"], ["sentence", "none"], ["section", "War"], ["section", "none"]]).ask, wiki, ...PLAIN });
  const leaf = scripted([["sentence", "1"]]);
  await runWalk(shallow, { ask: leaf.ask, wiki, ...PLAIN });
  assert.equal(shallow.nodes[1].status, "resolved");
  assert.equal(leaf.seen.length, 1, "no names asked at the depth limit");
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

test("a search hit whose title is the query itself is read by code, and a hop child whose article never names the subject blocks without reading on", async () => {
  const wiki = async (query, options = {}) => {
    if (options.searchOnly) return { ok: true, hits: ["Alan Turing"], snippets: [""] };
    if (options.readOn) return { ok: false, error: { kind: "no_match", message: "no direct read here" } };
    if (/^bombe$/i.test(query)) return { ok: true, kind: "wiki", title: "Bombe", article: "Bombe", section: 0, headings: [], text: "The bombe was an electro-mechanical device used by British cryptologists to help decipher Enigma. The initial design was produced by Turing at Bletchley Park.", url: "u", alternatives: ["Baked Alaska", "Bombe glacée"] };
    if (/turing/i.test(query)) return { ok: true, kind: "wiki", title: "Alan Turing", article: "Alan Turing", section: 0, headings: [], text: "Alan Turing was an English mathematician and computer scientist.", url: "u" };
    return wikiFixture(query, options);
  };
  // A one-node question: the lead does not answer, the model names the Bombe to look up; Bombe, Baked Alaska and Bombe glacée are found and the first is the query itself, so it is read without asking (8B once said none to that list).
  const run = createRun("Who designed the bombe used at Bletchley Park?", "live", { maxLookups: 2, maxSentences: 1, maxDepth: 0 });
  const { ask } = scripted([["article", "Alan Turing"], ["sentence", "none"], ["search", "Bombe"], ["sentence", "2"]]);
  assert.equal(await runWalk(run, { ask, wiki, variants: { sentence: "list" } }), true);
  assert.ok(run.trace.some((event) => event.event === "article_chosen" && event.article === "Bombe" && event.byCode === true), JSON.stringify(run.trace.filter((event) => event.event === "article_chosen")));
  assert.equal(run.nodes[0].finding, "The initial design was produced by Turing at Bletchley Park.");
  // A hop child under a brief whose article has no sentence naming the subject blocks at once: no section ask, no search.
  const brief = createRun("Tell me about Alan Turing.", "live", { maxSentences: 1, maxLookups: 2 });
  brief.nodes.push({ id: "n2", parent: "n1", depth: 1, question: "Tell me about Alan Turing. — about Gordon Brown", status: "open", visits: 0, observed: [], evidence: [], children: [], hopTo: "Gordon Brown" });
  brief.nodes[0].status = "waiting";
  const gordon = async (query, options = {}) => (options.readOn ? { ok: true, kind: "wiki", title: "Gordon Brown", article: "Gordon Brown", section: 0, headings: ["Early life", "Premiership"], text: "James Gordon Brown is a British politician who served as Prime Minister of the United Kingdom from 2007 to 2010. He was Chancellor of the Exchequer before that.", url: "u" } : { ok: false, error: { kind: "no_match", message: "no" } });
  const leaf = scripted([]);
  assert.equal(await runWalk(brief, { ask: leaf.ask, wiki: gordon, ...PLAIN }), true);
  assert.equal(brief.nodes[1].status, "blocked");
  assert.match(brief.nodes[1].reason, /Nothing read about Gordon Brown names the subject/);
  assert.equal(leaf.seen.length, 0, "no sentence naming Turing to offer, no section asked");
  assert.equal(brief.lookups, 1);
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
  assert.equal(variantsFor("qwen3:8b").sentence, "check", "an endpoint's model id");
  assert.equal(variantsFor("qwen3:14b-q4_K_M").sentence, "check");
  assert.equal(variantsFor("qwen3:32b").sentence, "check");
  assert.equal(variantsFor("qwen3:1.7b").sentence, "list");
  assert.equal(variantsFor("Qwen3-30B-A3B").sentence, "list");
  assert.equal(variantsFor("scripted:first").sentence, "list");
  assert.equal(variantsFor("Qwen3-1.7B-q4f16_1-MLC").article, "snippets");
});

test("under a brief a short section is not handed to a child, and an over-long profile loses hop paragraphs before it loses sections", async () => {
  const wiki = async (query, { readOn, links } = {}) => {
    if (links) return { ok: true, kind: "links", title: query, links: [] };
    if (readOn) return { ok: true, kind: "wiki", title: `Alan Turing § ${readOn.section}`, article: "Alan Turing", section: 1, text: `In the ${readOn.section} years Turing did a great deal that mattered to everyone.`, url: "u" };
    return { ok: true, kind: "wiki", title: "Alan Turing", article: "Alan Turing", section: 0, headings: ["Career and research", "Cryptanalysis", "Legacy"], sizes: [450, 4000, 3000], text: "Alan Turing was an English mathematician and computer scientist.", url: "u" };
  };
  const run = createRun("Tell me about Alan Turing.", "live", { maxSentences: 1, maxLookups: 2 });
  const root = scripted([["sentence", "1"], ["section", "Legacy"], ["section", "none"]]);
  assert.equal(await runWalk(run, { ask: root.ask, wiki, ...PLAIN }), true, run.nodes[0].reason);
  assert.deepEqual(root.seen[1].options, ["Cryptanalysis", "Legacy", "none"], "the 450-character heading is not offered");
  // The cap: a parent with three children whose findings carry hop paragraphs.
  const capped = createRun("Tell me about Alan Turing.", "live", { maxFindingChars: 200 });
  const parent = capped.nodes[0];
  parent.status = "waiting";
  parent.fanned = true;
  parent.kept = [{ text: "Alan Turing was an English mathematician and computer scientist.", evidence: ["e1"] }];
  capped.evidence.push({ id: "e1", node: "n1", article: "Alan Turing", title: "Alan Turing", text: "…" });
  const child = (id, finding) => ({ id, parent: "n1", depth: 1, question: `Tell me about Alan Turing. — about ${id}`, status: "resolved", visits: 1, observed: [], evidence: ["e1"], children: [], finding });
  capped.nodes.push(child("n2", "First section sentence about Turing here.\n\nA hop paragraph under the first section that is long enough to matter."), child("n3", "Second section sentence about Turing here.\n\nA hop paragraph under the second one."), child("n4", "Third section sentence about Turing here."));
  assert.equal(await runWalk(capped, { ask: scripted([]).ask, wiki, ...PLAIN }), true, parent.reason);
  assert.equal(parent.finding, "Alan Turing was an English mathematician and computer scientist.\n\nFirst section sentence about Turing here.\n\nSecond section sentence about Turing here.\n\nThird section sentence about Turing here.", "both hop paragraphs went, no section did");
  assert.ok(parent.finding.length <= 200);
});

test("the first search asks for approval before anything is sent, and a refusal blocks the node with nothing fetched", async () => {
  const sent = [];
  const wiki = async (query, options = {}) => {
    sent.push(query);
    if (options.searchOnly) return { ok: true, kind: "search", hits: ["Dead Sea", "Aral Sea"], snippets: ["", ""] };
    return wikiFixture(query, options);
  };
  const asked = [];
  const run = createRun("Why is the Dead Sea shrinking?", "live", ONE);
  const { ask } = scripted([]);
  assert.equal(await runWalk(run, { ask, wiki, approve: async (query) => (asked.push(query), false) }), true);
  assert.deepEqual(sent, [], "nothing was sent to Wikipedia");
  assert.deepEqual(asked, ["Dead Sea shrinking | Why is the Dead Sea shrinking?"]);
  assert.equal(run.nodes[0].status, "blocked");
  assert.match(run.nodes[0].reason, /declined/);
});
