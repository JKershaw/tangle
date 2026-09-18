import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { USER_AGENT, entryPath, readRecording, recordingFetch, writeEntry } from "../scripts/recording.mjs";
import { fetchWikipedia, searchUrl } from "../src/wiki.js";

test("the recording serves a recorded response without the network, records a miss in the page's file format, and stays offline when told to", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tangle-recording-"));
  const url = searchUrl("Dead Sea");
  writeEntry(dir, { url, status: 200, body: '{"query":{"search":[]}}', fetchedAt: "2026-09-18T00:00:00.000Z" });
  assert.equal(writeEntry(dir, { url, status: 200, body: "changed" }), false, "an entry is never overwritten");
  const sent = [];
  const network = async (target, init) => {
    sent.push({ target, init });
    return new Response('{"query":{"search":[{"title":"Aral Sea"}]}}', { status: 200 });
  };
  const recording = recordingFetch(dir, { fetchImpl: network });
  const hit = await fetchWikipedia(url, { fetchImpl: recording.fetch });
  assert.equal(hit.ok, true);
  assert.equal(hit.body, '{"query":{"search":[]}}');
  assert.deepEqual(sent, []);

  const other = searchUrl("Aral Sea");
  const miss = await fetchWikipedia(other, { fetchImpl: recording.fetch });
  assert.equal(miss.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].init.headers["user-agent"], USER_AGENT);
  assert.equal(sent[0].init.redirect, "error");
  assert.deepEqual(recording.stats(), { hits: 1, misses: 1, added: 1, entries: 2 });
  const files = readdirSync(dir).sort();
  assert.deepEqual(files, [entryPath(dir, url), entryPath(dir, other)].map((path) => path.slice(dir.length + 1)).sort());
  const written = JSON.parse(readFileSync(entryPath(dir, other), "utf8"));
  assert.equal(written.url, other);
  assert.equal(written.status, 200);
  assert.equal(written.body, '{"query":{"search":[{"title":"Aral Sea"}]}}');
  assert.match(written.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(readRecording(dir).length, 2);

  const offline = recordingFetch(dir, { fetchImpl: null });
  const replayed = await fetchWikipedia(other, { fetchImpl: offline.fetch });
  assert.equal(replayed.ok, true, "the miss was recorded and replays");
  const blocked = await fetchWikipedia(searchUrl("Lake Chad"), { fetchImpl: offline.fetch });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error.message, /Not in the recording/);
});
