import { test } from "node:test";
import assert from "node:assert/strict";
import { corpusFrom, fileDriver, fileLinks, lineUnits, lookupFiles, parseFile, readFileAbout, readFileSection, search, tokens, usesName } from "../src/files.js";
import { readCorpus, readCorpusEntries } from "../scripts/corpus.mjs";
import { createRun, nextRunnable, validateImport } from "../src/graph.js";
import { runWalk } from "../src/walk.js";
import { SCRIPTED } from "../src/scripted.js";

const ROOT = new URL("./fixtures/corpus", import.meta.url).pathname;
const corpus = () => readCorpus(ROOT, { name: "Tinystore" });

test("a code file's declarations are its sections, each with the comment above it, and its lead is the header and an outline", () => {
  const entries = readCorpusEntries(ROOT);
  assert.deepEqual(entries.map(([path]) => path).sort(), ["README.md", "docs/EDGE-CASES.md", "src/match.ts", "src/mutex.ts", "src/store.ts"]);
  const store = parseFile("src/store.ts", entries.find(([path]) => path === "src/store.ts")[1]);
  assert.deepEqual(store.sections.map((section) => section.heading), ["Store", "constructor", "readAll", "writeAll", "find", "path"]);
  const writeAll = store.sections.find((section) => section.heading === "writeAll");
  assert.equal(writeAll.classOf, "Store");
  assert.equal(writeAll.summary, "Writes the whole collection back: to a temp file, then a rename, so a", "a declaration's summary is the first line of its comment");
  assert.equal(store.sections.find((section) => section.heading === "find").summary, "async find(name: string, filter: object): Promise<object[]>", "else its signature");
  assert.ok(writeAll.text.startsWith("// Writes the whole collection back"), "the comment above belongs to the section");
  assert.ok(writeAll.text.includes("await rename(tmp, this.path(name));"));
  assert.ok(!writeAll.text.includes("async find("), "the section ends where the next declaration's comment begins");
  assert.equal(store.lead.split("\n")[1], " * A tiny document store: one JSON file per collection.", "the lead opens with the header comment");
  assert.ok(store.lead.includes("async writeAll(name: string, docs: object[]): Promise<void>"), "and continues with one signature per declaration");
  assert.deepEqual(store.outline.length, 6);
  const match = parseFile("src/match.ts", entries.find(([path]) => path === "src/match.ts")[1]);
  assert.deepEqual(match.sections.map((section) => section.heading), ["matchesFilter", "matchesKey"]);
});

test("a document's headings are its sections and the text before the first heading its lead", () => {
  const doc = parseFile("docs/EDGE-CASES.md", readCorpusEntries(ROOT).find(([path]) => path === "docs/EDGE-CASES.md")[1]);
  assert.deepEqual(doc.sections.map((section) => section.heading), ["Concurrency", "Atomic writes"]);
  assert.equal(doc.lead, "# Edge cases\n\nQuirks of the store.");
  assert.ok(doc.sections[1].text.includes("renames it"));
});

test("search ranks files by their names, declarations and matching lines, minus the corpus's own name; tokens match by stem prefix", () => {
  const c = corpus();
  assert.ok(tokens("writeDocuments persists").has("write"));
  const barrel = corpusFrom([...readCorpusEntries(ROOT), ["src/index.ts", "export * from './store.ts';\nexport * from './match.ts';\n"]], { name: "Tinystore" });
  assert.ok(!search(barrel, "store match").some((hit) => hit.path === "src/index.ts"), "a barrel of re-exports is not an article");
  const hits = search(c, "Tinystore persists writes to disk");
  assert.equal(hits[0].path, "src/store.ts", hits.map((hit) => `${hit.path}:${hit.score}`).join(" "));
  assert.ok(hits[0].snippet.length > 0);
  const found = lookupFiles(c, "persists writes to disk", { searchOnly: true });
  assert.equal(found.kind, "search");
  assert.equal(found.hits[0], "src/store.ts");
  assert.equal(found.snippets.length, found.hits.length);
});

test("reading a file gives its lead with headings and sizes; a section by name; the part about something; all as lines", () => {
  const c = corpus();
  const lead = lookupFiles(c, "src/store.ts");
  assert.equal(lead.kind, "read");
  assert.equal(lead.source, "files");
  assert.equal(lead.lines, true);
  assert.equal(lead.section, 0);
  assert.deepEqual(lead.headings, ["Store", "constructor", "readAll", "writeAll", "find", "path"]);
  assert.equal(lead.sizes.length, 6);
  assert.equal(lead.summaries.length, 6);
  assert.equal(lead.url, "file:src/store.ts#L1");
  assert.ok(lineUnits(lead.text).includes("* A tiny document store: one JSON file per collection."));
  assert.ok(lineUnits(lead.text).includes("export class Store"));
  const section = readFileSection(c, "src/store.ts", "writeAll");
  assert.equal(section.title, "src/store.ts § writeAll");
  assert.equal(section.section, 4);
  assert.match(section.url, /^file:src\/store\.ts#L\d+-L\d+$/);
  assert.equal(readFileSection(c, "src/store.ts", 99).error.kind, "no_match");
  const about = readFileAbout(c, "src/store.ts", "how writes are persisted to disk");
  assert.equal(about.title, "src/store.ts § writeAll", "the section naming most of the phrase's words");
  const declaration = readFileAbout(c, "runExclusive (src/mutex.ts)", "how writes are persisted to disk");
  assert.equal(declaration.title, "src/mutex.ts § runExclusive", "a declaration reached by a use is about the subject by construction");
  const none = readFileAbout(c, "src/mutex.ts", "how writes are persisted to disk");
  assert.equal(none.ok, false);
  assert.match(none.error.message, /never mentions/);
  const direct = lookupFiles(c, "writeAll (src/store.ts)");
  assert.equal(direct.title, "src/store.ts § writeAll", "a declaration title reads that declaration");
});

test("a file's links are the corpus's declarations it uses, as 'name (path)' titles, most used first", () => {
  const c = corpus();
  assert.equal(usesName("return this.mutex.runExclusive(async () => {", "runExclusive"), true);
  assert.equal(usesName("// to a temp file, then a rename, so a", "rename"), false, "a word in a comment is not a use");
  assert.equal(usesName("await rename(tmp, this.path(name));", "rename"), true);
  const links = fileLinks(c, "src/store.ts").links;
  assert.ok(links.includes("matchesFilter (src/match.ts)"), links.join(", "));
  assert.ok(links.includes("runExclusive (src/mutex.ts)"));
  assert.ok(!links.includes("chain (src/mutex.ts)"), "a name the file never uses is not a link");
  const inWriteAll = fileLinks(c, "writeAll (src/store.ts)").links;
  assert.ok(inWriteAll.includes("runExclusive (src/mutex.ts)"));
  assert.ok(!inWriteAll.includes("matchesFilter (src/match.ts)"), "a declaration's links are its own uses");
  assert.ok(!inWriteAll.includes("writeAll (src/store.ts)"), "not itself");
});

test("a brief's root whose lead gives it nothing to keep still fans out to the file's declarations", async () => {
  const c = corpus();
  const run = createRun("Tell me how Tinystore matches a filter", "live");
  // Every sentence pick says none; every other ask takes the first choice.
  const ask = async (call) => (call.schema?.properties?.sentence ? { text: JSON.stringify({ sentence: "none" }), tokens: 0 } : SCRIPTED.first(call));
  const first = await runWalk(run, { ask, wiki: fileDriver(c), source: "files", ignore: ["tinystore"], variants: { sentence: "list", article: "snippets" } });
  assert.equal(first, true, run.nodes[0].reason);
  assert.equal(run.nodes[0].status, "waiting", "the root handed its sections down");
  assert.ok(run.nodes.length > 1);
  assert.ok(run.trace.some((event) => event.event === "sections_chosen" && event.sections.length));
});

test("the walk over a file corpus: a brief reads a file's lead, fans out to its declarations, keeps lines, hops along the links, and the profile cites file lines", async () => {
  const c = corpus();
  const run = createRun("Tell me how Tinystore persists writes to disk", "live");
  const wiki = fileDriver(c);
  for (let guard = 0; nextRunnable(run) && guard < 80; guard++) {
    assert.equal(await runWalk(run, { ask: SCRIPTED.first, wiki, source: "files", ignore: ["tinystore"], variants: { sentence: "list", article: "snippets" } }), true, run.nodes.find((node) => node.status === "error")?.reason);
  }
  const root = run.nodes[0];
  assert.equal(root.status, "resolved");
  assert.ok(root.finding.includes("\n"), "a profile over code is lines");
  assert.ok(run.evidence.every((record) => record.kind === "read" && record.source === "files" && record.lines === true && record.url.startsWith("file:")));
  assert.equal(validateImport(JSON.stringify(run)).evidence.length, run.evidence.length, "a run over files opens in the page");
  assert.ok(run.trace.some((event) => event.event === "tool_proposed" && event.tool === "files"));
  assert.ok(run.nodes.some((node) => node.hopTo), "some child hopped along a link");
  assert.ok(run.nodes.some((node) => node.hopTo === "runExclusive (src/mutex.ts)"), "writeAll calls runExclusive, so its child hops there: " + run.nodes.map((node) => node.hopTo).filter(Boolean).join(", "));
  const hopped = run.nodes.filter((node) => node.hopTo && node.status === "resolved");
  assert.ok(hopped.length >= 1, "a hop child read the declaration it was named");
  assert.ok(hopped.every((node) => node.evidence.every((id) => run.evidence.find((record) => record.id === id).title.includes(" § "))));
  assert.ok(root.evidence.length >= 3);
  assert.ok(new Set(root.evidence.map((id) => run.evidence.find((record) => record.id === id).article)).size >= 2, "the profile rests on more than one file");
});
