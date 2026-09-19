// The runtime parity test (ROADMAP milestone 4): the same seed, the same
// Wikipedia recording and the same scripted picks must grow the same graph in
// the page and in Node. What differs between the runtimes is the plumbing —
// how the model is called and how Wikipedia is read — and this is the test
// that the plumbing changes nothing. The browser half skips without Chromium.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { SCRIPTED } from "../src/scripted.js";
import { readRecording } from "../scripts/recording.mjs";
import { openNodeLab } from "../scripts/node-lab.mjs";

const PAGE = new URL("../docs/index.html", import.meta.url);
const RECORDING = new URL("../evals/wiki-cache", import.meta.url).pathname;
// Three shapes: one node that reads and picks; a two-subject question split
// by code and gathered; a brief with sections, hops and hops' hops.
export const SEEDS = ["Why is the Dead Sea shrinking?", "Why did the Dead Sea and the Aral Sea both shrink?", "Tell me about Alan Turing and elaborate on the impact of his work."];

test("the scripted first-choice model takes the first real option of an enum, yes for a yes-or-no, and none for a string", () => {
  const call = (property) => ({ schema: { type: "object", properties: { answer: property } } });
  assert.deepEqual(SCRIPTED.first(call({ enum: ["1", "2", "none"] })), { text: '{"answer":"1"}', tokens: 0 });
  assert.deepEqual(SCRIPTED.first(call({ enum: ["none", "Dead Sea"] })), { text: '{"answer":"Dead Sea"}', tokens: 0 });
  assert.deepEqual(SCRIPTED.first(call({ enum: ["0", "1"] })), { text: '{"answer":"1"}', tokens: 0 });
  assert.deepEqual(SCRIPTED.first(call({ enum: ["yes", "no"] })), { text: '{"answer":"yes"}', tokens: 0 });
  assert.deepEqual(SCRIPTED.first(call({ type: "string", maxLength: 60 })), { text: '{"answer":"none"}', tokens: 0 });
});

// What a graph is, with nothing that a clock or a runtime stamps on it.
export function shape(run) {
  const strip = ({ capturedAt, requests, elapsedMs, ...rest }) => rest;
  return {
    seed: run.seed,
    limits: run.limits,
    promptVersion: run.promptVersion,
    counters: { visits: run.visits, modelCalls: run.modelCalls, tokens: run.tokens, lookups: run.lookups, stopReason: run.stopReason },
    nodes: run.nodes.map(({ id, parent, depth, question, status, visits, finding, evidence, observed, failedLookups, reason }) => ({ id, parent, depth, question, status, visits, finding, evidence, observed, failedLookups, reason })),
    evidence: run.evidence.map((record) => strip(record)),
    trace: run.trace.map(({ seq, time, latencyMs, result, ...event }) => ({ ...event, ...(result ? { result: typeof result === "object" ? strip(result) : result } : {}) })),
  };
}

export async function nodeRun(seed, limits = {}) {
  const lab = await openNodeLab({ ask: SCRIPTED.first, wikiCache: RECORDING, offline: true, note: () => {} });
  await lab.loadModel("scripted:first");
  lab.newLive(seed, limits);
  const { outcome } = await lab.runToEnd({ retries: 0, note: () => {} });
  return { outcome, run: lab.exportRun() };
}

test("in Node, the first-choice model reads the recording to a resolved root without the network, in three graph shapes", async () => {
  const shapes = [];
  for (const seed of SEEDS) {
    const { outcome, run } = await nodeRun(seed);
    assert.equal(outcome, "Root resolved", seed);
    assert.equal(run.model, "scripted:first");
    assert.ok(run.nodes[0].finding.length > 20);
    assert.ok(run.nodes[0].evidence.every((id) => run.evidence.some((record) => record.id === id)));
    assert.ok(run.trace.every((event) => event.event !== "lookup_failed" || !/Not in the recording/.test(event.error)), `every response the walk needs for "${seed}" is in the recording`);
    shapes.push(run.nodes.length);
  }
  assert.equal(shapes[0], 1, "one node reads and picks");
  assert.equal(shapes[1], 3, "a two-subject question is split into two children");
  assert.ok(shapes[2] >= 10, `a brief fans out into sections and hops (${shapes[2]} nodes)`);
});

async function launch() {
  const { chromium } = await import("playwright-core");
  const candidates = [process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium", chromium.executablePath()].filter((p) => p && existsSync(p));
  for (const executablePath of candidates) {
    try {
      return await chromium.launch({ executablePath, headless: true });
    } catch {}
  }
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    return null;
  }
}

test("the page grows the identical graph from the same seed, recording and scripted picks", { timeout: 180000 }, async (t) => {
  if (!existsSync(PAGE)) return t.skip("docs/index.html not built");
  const browser = await launch();
  if (!browser) return t.skip("no Chromium available");
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("dialog", (dialog) => dialog.accept());
    const requests = [];
    page.on("request", (request) => !request.url().startsWith("file:") && requests.push(request.url()));
    await page.goto(pathToFileURL(PAGE.pathname).href);
    const loaded = await page.evaluate((entries) => window.__tangle.wiki.load(entries), readRecording(RECORDING));
    assert.ok(loaded > 0);
    assert.equal(await page.evaluate(() => window.__tangle.script("first")), "scripted:first");
    // The page holds the model cache (src/replay.js) as it holds the wiki
    // recording: loaded and dumped by the driver, counted by exact context.
    assert.deepEqual(await page.evaluate(() => window.__tangle.model.stats()), { hits: 0, misses: 0, entries: 0 });
    assert.equal(await page.evaluate(() => window.__tangle.model.load([{ key: "k", text: "{}", tokens: 1 }])), 1);
    assert.deepEqual(await page.evaluate(() => window.__tangle.model.dump()), [{ key: "k", text: "{}", tokens: 1 }]);
    for (const seed of SEEDS) {
      await page.evaluate((seed) => window.__tangle.newLive(seed, {}), seed);
      // Visible only once a live run exists; every lookup is approved.
      await page.check("#autoWiki");
      await page.click("#run");
      await page.waitForFunction(() => !window.__tangle.busy() && window.__tangle.outcome() !== "Ready", null, { timeout: 120000, polling: 250 });
      assert.equal(await page.evaluate(() => window.__tangle.outcome()), "Root resolved", seed);
      const fromPage = await page.evaluate(() => JSON.parse(JSON.stringify(window.__tangle.current())));
      assert.deepEqual(requests, [], "the recording answered every request");
      assert.deepEqual(errors, []);
      const { run: fromNode } = await nodeRun(seed);
      assert.equal(fromPage.model, "scripted:first");
      assert.deepEqual(shape(fromPage), shape(fromNode), seed);
    }
  } finally {
    await browser.close();
  }
});
