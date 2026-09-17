import { test } from "node:test";
import assert from "node:assert/strict";
import { extractUrl, fetchWikipedia, lookupWikipedia, readWikipediaSection, searchUrl, splitSections, stripHtml, summaryUrl } from "../src/wiki.js";

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

test("a lookup searches, summarises the top hit, and pins the evidence URL to the revision", async () => {
  const { fetchImpl, calls } = fakeFetch([
    ["list=search", () => jsonResponse({ query: { search: [{ title: "Water cycle", snippet: "The <b>water</b> cycle" }, { title: "Rain" }] } })],
    ["page/summary", () => jsonResponse({ extract: "The water cycle describes movement of water.", revision: "12345" })],
  ]);
  const result = await lookupWikipedia("water cycle", { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.kind, "wiki");
  assert.equal(result.title, "Water cycle");
  assert.equal(result.exact, true);
  assert.equal(result.text, "The water cycle describes movement of water.");
  assert.equal(result.url, "https://en.wikipedia.org/w/index.php?oldid=12345");
  assert.deepEqual(result.alternatives, ["Rain"]);
  assert.equal(calls[1].url, summaryUrl("Water cycle"));
  assert.equal(result.requests.length, 2);
  assert.ok(!("body" in result.requests[0]), "request records omit bodies to keep exports small");
});

test("a missing summary falls back to the search snippet, and no hits is a no_match", async () => {
  const { fetchImpl } = fakeFetch([
    ["list=search", () => jsonResponse({ query: { search: [{ title: "Rain", snippet: "Rain is <span>liquid</span> water &amp; more" }] } })],
    ["page/summary", () => jsonResponse({ type: "not_found" }, 404)],
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
