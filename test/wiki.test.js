import { test } from "node:test";
import assert from "node:assert/strict";
import { aboutWords, extractUrl, fetchWikipedia, fetchWikipediaLinks, linksUrl, lookupWikipedia, readWikipediaAbout, readWikipediaSection, searchUrl, splitSections, stripHtml, summaryUrl, wikiDriver } from "../src/wiki.js";

const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    for (const [match, respond] of routes) if (url.includes(match)) return respond(url, init);
    throw new Error("unexpected " + url);
  };
  return { fetchImpl, calls };
}

test("only HTTPS requests to en.wikipedia.org are ever sent", async () => {
  const { fetchImpl, calls } = fakeFetch([]);
  for (const url of ["http://en.wikipedia.org/x", "https://de.wikipedia.org/x", "https://example.com", "nope"]) {
    const result = await fetchWikipedia(url, { fetchImpl });
    assert.equal(result.ok, false);
  }
  assert.equal(calls.length, 0);
});

test("requests carry no credentials, follow no redirects, and are bounded by a byte cap", async () => {
  const { fetchImpl, calls } = fakeFetch([["api.php", () => new Response("x".repeat(100))]]);
  const result = await fetchWikipedia(searchUrl("Water cycle"), { fetchImpl, maxBytes: 40 });
  assert.equal(result.ok, true);
  assert.equal(result.truncated, true);
  assert.equal(result.body.length, 40);
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.referrerPolicy, "no-referrer");
});

test("a lookup searches, reads the top hit's lead and headings, and pins the evidence URL to the revision", async () => {
  const { fetchImpl, calls } = fakeFetch([
    ["list=search", () => jsonResponse({ query: { search: [{ title: "Water cycle", snippet: "The <b>water</b> cycle" }, { title: "Rain" }] } })],
    ["prop=extracts", () => jsonResponse({ query: { pages: { 1: { title: "Water cycle", extract: "The water cycle describes movement of water.\n\n== Processes ==\nEvaporation.\n\n== References ==\nx", revisions: [{ revid: 12345 }] } } } })],
  ]);
  const result = await lookupWikipedia("water cycle", { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.kind, "read");
  assert.equal(result.source, "wiki");
  assert.equal(result.units, "sentences");
  assert.equal(result.title, "Water cycle");
  assert.equal(result.exact, true);
  assert.equal(result.text, "The water cycle describes movement of water.");
  assert.equal(result.url, "https://en.wikipedia.org/w/index.php?oldid=12345");
  assert.deepEqual(result.alternatives, ["Rain"]);
  assert.equal(calls[1].url, extractUrl("Water cycle"));
  assert.deepEqual(result.headings, ["Processes"]);
  assert.deepEqual([result.article, result.section], ["Water cycle", 0]);
  assert.equal(result.requests.length, 2);
  assert.ok(!("body" in result.requests[0]), "request records omit bodies to keep exports small");
});

test("a missing article text falls back to the search snippet, and no hits is a no_match", async () => {
  const { fetchImpl } = fakeFetch([
    ["list=search", () => jsonResponse({ query: { search: [{ title: "Rain", snippet: "Rain is <span>liquid</span> water &amp; more" }] } })],
    ["prop=extracts", () => jsonResponse({ query: { pages: { "-1": { title: "Rain", missing: "" } } } })],
  ]);
  const fallback = await lookupWikipedia("rain", { fetchImpl });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.exact, false);
  assert.equal(fallback.text, "Rain is liquid water & more");
  assert.equal(fallback.url, "https://en.wikipedia.org/wiki/Rain");
  const empty = fakeFetch([["list=search", () => jsonResponse({ query: { search: [] } })]]);
  const none = await lookupWikipedia("zzzz", { fetchImpl: empty.fetchImpl });
  assert.equal(none.ok, false);
  assert.equal(none.error.kind, "no_match");
});

test("network failures and timeouts are reported, never thrown", async () => {
  const down = await lookupWikipedia("x", { fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  assert.equal(down.ok, false);
  assert.equal(down.error.kind, "unreachable");
  const slow = await fetchWikipedia(searchUrl("x"), {
    timeoutMs: 5,
    fetchImpl: (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
  });
  assert.equal(slow.error.kind, "timeout");
});

test("stripHtml flattens search snippets", () => {
  assert.equal(stripHtml('<span class="searchmatch">Water</span> &quot;cycle&quot;  &#39;x&#39;'), 'Water "cycle" \'x\'');
});

test("reading on returns one section of the plain-text extract, skipping reference-like sections", async () => {
  const extract = "The Dead Sea is a salt lake.\n\n== Geography ==\nIt lies in a rift valley.\n\n== Recession ==\nIt is receding fast.\n\n=== Causes ===\nDiversion of the Jordan.\n\n== See also ==\nAral Sea";
  assert.deepEqual(splitSections(extract).map((section) => section.heading), ["", "Geography", "Recession", "Causes"]);
  const { fetchImpl, calls } = fakeFetch([["prop=extracts", () => jsonResponse({ query: { pages: { 1: { title: "Dead Sea", extract } } } })]]);
  const recession = await readWikipediaSection("Dead Sea", 2, { fetchImpl });
  assert.equal(calls[0].url, extractUrl("Dead Sea"));
  assert.equal(recession.ok, true);
  assert.equal(recession.title, "Dead Sea § Recession");
  assert.equal(recession.text, "It is receding fast.");
  assert.deepEqual([recession.article, recession.section, recession.sections], ["Dead Sea", 2, 4]);
  assert.match(recession.url, /^https:\/\/en\.wikipedia\.org\/wiki\/Dead_Sea#Recession$/);
  const beyond = await readWikipediaSection("Dead Sea", 4, { fetchImpl });
  assert.equal(beyond.ok, false);
  assert.match(beyond.error.message, /All 4 sections of "Dead Sea" have been read/);
});

test("a section can be read by heading, case-insensitively, and an unknown heading lists the sections", async () => {
  const extract = "Lead.\n\n== Geography ==\nRift valley.\n\n== Receding shoreline ==\nDiversion of the Jordan.";
  const { fetchImpl } = fakeFetch([["prop=extracts", () => jsonResponse({ query: { pages: { 1: { title: "Dead Sea", extract, revisions: [{ revid: 99 }] } } } })]]);
  const byName = await readWikipediaSection("Dead Sea", "receding shoreline", { fetchImpl });
  assert.equal(byName.title, "Dead Sea § Receding shoreline");
  assert.equal(byName.text, "Diversion of the Jordan.");
  assert.equal(byName.url, "https://en.wikipedia.org/w/index.php?oldid=99#Receding_shoreline");
  const partial = await readWikipediaSection("Dead Sea", "shoreline", { fetchImpl });
  assert.equal(partial.section, 2);
  const unknown = await readWikipediaSection("Dead Sea", "Economy", { fetchImpl });
  assert.equal(unknown.ok, false);
  assert.match(unknown.error.message, /has no section "Economy"\. Its sections: Geography, Receding shoreline\./);
});

test("reading an article for what it says about something returns the lead if it names the phrase, else the first section that does, else nothing", async () => {
  const extract = "The bombe was an electro-mechanical device used to help decipher Enigma.\n\n== Design ==\nThe initial design was produced by Alan Turing at Bletchley Park.\n\n== Use ==\nBombes were run around the clock.";
  const { fetchImpl } = fakeFetch([["prop=extracts", () => jsonResponse({ query: { pages: { 1: { title: "Bombe", extract, revisions: [{ revid: 7 }] } } } })]]);
  const design = await readWikipediaAbout("Bombe", "Alan Turing", { fetchImpl });
  assert.equal(design.ok, true);
  assert.deepEqual([design.title, design.section, design.about, design.text], ["Bombe § Design", 1, "Alan Turing", "The initial design was produced by Alan Turing at Bletchley Park."]);
  const enigma = await readWikipediaAbout("Bombe", "Enigma machine", { fetchImpl });
  assert.deepEqual([enigma.section, enigma.title], [0, "Bombe"], "the lead names Enigma, one of the phrase's words");
  const never = await readWikipediaAbout("Bombe", "Hubble Space Telescope", { fetchImpl });
  assert.equal(never.ok, false);
  assert.match(never.error.message, /"Bombe" never mentions Hubble Space Telescope/);
  assert.deepEqual(aboutWords("Hubble Space Telescope"), ["Hubble", "Telescope"], "generic words such as Space do not count");
  assert.deepEqual(aboutWords("Great Barrier Reef"), ["Barrier", "Reef"]);
  assert.deepEqual(aboutWords("Sea"), ["Sea"], "a phrase of only short or generic words is used as it is");
});

test("an article's links come from the parse API, main namespace, existing pages only", async () => {
  const { fetchImpl, calls } = fakeFetch([["action=parse", () => jsonResponse({ parse: { title: "Alan Turing", links: [{ ns: 0, exists: "", "*": "Bombe" }, { ns: 0, "*": "Nowhere" }, { ns: 14, exists: "", "*": "Category:People" }, { ns: 0, exists: "", "*": "Bombe" }] } })]]);
  const result = await fetchWikipediaLinks("Alan Turing", { fetchImpl });
  assert.equal(calls[0].url, linksUrl("Alan Turing"));
  assert.deepEqual([result.ok, result.kind, result.title, result.links], [true, "links", "Alan Turing", ["Bombe"]]);
  const bad = await fetchWikipediaLinks("Alan Turing", { fetchImpl: async () => new Response("{}", { status: 200 }) });
  assert.equal(bad.ok, false);
  assert.match(bad.error.message, /no links/);
});

test("the wiki driver routes one call to a search and read, a section, the part about something, or the links", async () => {
  const article = { query: { pages: { 1: { title: "Dead Sea", extract: "The Dead Sea is a salt lake.\n\n== Shoreline ==\nThe Jordan River feeds it and it is receding.", revisions: [{ revid: 5 }] } } } };
  const { fetchImpl, calls } = fakeFetch([
    ["list=search", () => jsonResponse({ query: { search: [{ title: "Dead Sea", snippet: "salt" }, { title: "Jordan River" }] } })],
    ["prop=extracts", () => jsonResponse(article)],
    ["prop=links", () => jsonResponse({ parse: { title: "Dead Sea", links: [{ ns: 0, exists: "", "*": "Jordan River" }] } })],
  ]);
  const wiki = wikiDriver({ fetchImpl });
  assert.equal(wiki.length, 2, "the walk checks the driver takes options");
  const search = await wiki("Dead Sea", { searchOnly: true });
  assert.deepEqual(search.hits, ["Dead Sea", "Jordan River"]);
  const read = await wiki("Dead Sea", {});
  assert.equal(read.title, "Dead Sea");
  assert.deepEqual(read.headings, ["Shoreline"]);
  const section = await wiki("Dead Sea", { readOn: { article: "Dead Sea", section: "Shoreline" } });
  assert.equal(section.title, "Dead Sea § Shoreline");
  const about = await wiki("Dead Sea", { readOn: { article: "Dead Sea", section: 0, about: "Jordan River" } });
  assert.equal(about.section, 1);
  const links = await wiki("Dead Sea", { links: true });
  assert.deepEqual(links.links, ["Jordan River"]);
  assert.equal(calls.length, 6);
});
