// The Wikipedia recording: one file per response, named by the URL's hash,
// so a diff shows which articles changed and the directory can be committed
// (evals/wiki-cache). The page loads it as a list and dumps what it fetched
// (lab.mjs); Node reads it as a fetch that serves recorded responses and
// writes new ones the moment they arrive. The same files either way, so a
// run in one runtime replays in the other.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Wikipedia asks that automated clients say who they are.
export const USER_AGENT = "Tangle/0.2.0 (https://github.com/JKershaw/tangle; a research harness) node";

export const entryPath = (dir, url) => join(dir, createHash("sha1").update(url).digest("hex").slice(0, 16) + ".json");

export function readRecording(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
}

// Writes one entry unless the URL is already recorded. Returns whether it wrote.
export function writeEntry(dir, entry) {
  mkdirSync(dir, { recursive: true });
  const path = entryPath(dir, entry.url);
  if (existsSync(path)) return false;
  writeFileSync(path, JSON.stringify(entry) + "\n");
  return true;
}

// A fetch over the recording. A hit is answered from the file; a miss goes
// to fetchImpl with the User-Agent and, when successful, is recorded. With
// fetchImpl null a miss is an error, which is how a test stays offline.
export function recordingFetch(dir, { fetchImpl = globalThis.fetch, userAgent = USER_AGENT, record = true } = {}) {
  const entries = new Map(readRecording(dir).map((entry) => [entry.url, entry]));
  const stats = { hits: 0, misses: 0, added: 0 };
  const fetch = async (url, init = {}) => {
    const hit = entries.get(url);
    if (hit) {
      stats.hits++;
      return new Response(hit.body, { status: hit.status, headers: { "content-type": "application/json; charset=utf-8" } });
    }
    if (!fetchImpl) throw new Error(`Not in the recording: ${url}`);
    const response = await fetchImpl(url, { ...init, headers: { ...(init.headers ?? {}), "user-agent": userAgent } });
    stats.misses++;
    if (response.ok) {
      const entry = { url, status: response.status, body: await response.clone().text(), fetchedAt: new Date().toISOString() };
      entries.set(url, entry);
      if (record && writeEntry(dir, entry)) stats.added++;
    }
    return response;
  };
  return { fetch, entries, stats: () => ({ ...stats, entries: entries.size }) };
}
