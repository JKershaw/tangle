// The one result shape every source answers in (src/source.js): both
// drivers build their answers through it, the walk builds evidence from it,
// and a third source would too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkResult, evidenceOf, failure, linksResult, readResult, searchResult } from "../src/source.js";
import { wikiDriver } from "../src/wiki.js";
import { fileDriver, corpusFrom } from "../src/files.js";
import { recordingFetch } from "../scripts/recording.mjs";
import { readCorpusEntries } from "../scripts/corpus.mjs";

const RECORDING = new URL("../evals/wiki-cache", import.meta.url).pathname;
const CORPUS = new URL("./fixtures/corpus", import.meta.url).pathname;

test("the constructors build the four kinds, a read's units and lines agree, and evidence is built from a read", () => {
  const search = searchResult({ source: "wiki", query: "x", hits: ["A", "B"], snippets: ["a", "b"] });
  assert.equal(checkResult(search), null);
  assert.deepEqual([search.title, search.alternatives, search.ranked], ["A", ["B"], false]);
  const read = readResult({ source: "files", query: "p", title: "p.ts", article: "p.ts", headings: ["f"], sizes: [1], summaries: ["f()"], text: "line 1\nline 2", units: "lines", url: "file:p.ts" });
  assert.equal(checkResult(read), null);
  assert.equal(read.lines, true);
  assert.throws(() => readResult({ source: "x", title: "t", article: "t", text: "", units: "words" }), /Unknown units/);
  assert.deepEqual(evidenceOf(read), { kind: "read", source: "files", title: "p.ts", article: "p.ts", section: 0, headings: ["f"], sizes: [1], summaries: ["f()"], text: "line 1\nline 2", units: "lines", lines: true, url: "file:p.ts", revision: null, exact: true });
  assert.deepEqual(evidenceOf({ ok: true, title: "T", text: "t" }).units, "sentences", "a minimal driver's read takes the contract's defaults");
  assert.throws(() => evidenceOf(search), /Only a read/);
  assert.equal(checkResult(linksResult({ source: "wiki", query: "A", title: "A", links: ["B", "B", "C"] })), null);
  assert.deepEqual(linksResult({ source: "wiki", query: "A", title: "A", links: ["B", "B", "C"] }).links, ["B", "C"]);
  const failed = failure({ source: "wiki", query: "q", kind: "no_match", message: "nothing" });
  assert.equal(checkResult(failed), null);
  assert.equal(failed.ok, false);
  assert.equal(checkResult({ ok: true, kind: "wiki", source: "wiki" }), "kind wiki");
  assert.equal(checkResult({ ok: true, kind: "read", source: "wiki", title: "t", article: "t", text: "x", units: "lines", lines: false }), "a read whose units and lines disagree");
});

test("both drivers answer every request in the one shape", async () => {
  const wiki = wikiDriver({ fetchImpl: recordingFetch(RECORDING, { fetchImpl: null }).fetch });
  const files = fileDriver(corpusFrom(readCorpusEntries(CORPUS), { name: "fixture", root: CORPUS }));
  const results = [
    await wiki("Dead Sea", { searchOnly: true }),
    await wiki("Dead Sea", {}),
    await wiki("Dead Sea", { readOn: { article: "Dead Sea", section: 1 } }),
    await wiki("Dead Sea", { readOn: { article: "Dead Sea", section: 0, about: "Jordan River" } }),
    await wiki("Dead Sea", { links: true }),
    await wiki("Dead Sea", { readOn: { article: "Dead Sea", section: "No such heading" } }),
    await files("store", { searchOnly: true }),
    await files("src/store.ts", {}),
    await files("src/store.ts", { readOn: { article: "src/store.ts", section: 1 } }),
    await files("src/store.ts", { links: true }),
    await files("nothing-here", { searchOnly: true }),
  ];
  for (const result of results) assert.equal(checkResult(result), null, JSON.stringify(result).slice(0, 200));
  assert.equal(results[1].units, "sentences");
  assert.equal(results[7].units, "lines");
  assert.equal(results[7].source, "files");
  assert.equal(results[0].source, "wiki");
  assert.equal(results[6].ranked, true);
  assert.equal(results[0].ranked, false);
});
