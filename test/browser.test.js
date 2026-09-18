// End-to-end check of the built page in headless Chromium: the simulation must
// grow the same graph the unit tests expect, and an export must re-validate.
// Skips when no Chromium is available; run `npm run build` first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateImport } from "../src/graph.js";
import { extractUrl, searchUrl } from "../src/wiki.js";

const PAGE = new URL("../docs/index.html", import.meta.url);

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

test("the built page runs the revisit simulation to a resolved root and exports a valid run", { timeout: 120000 }, async (t) => {
  if (!existsSync(PAGE)) return t.skip("docs/index.html not built");
  const browser = await launch();
  if (!browser) return t.skip("no Chromium available");
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("dialog", (dialog) => dialog.accept());
    const requests = [];
    page.on("request", (request) => !request.url().startsWith("file:") && requests.push(request.url()));
    await page.goto(pathToFileURL(PAGE.pathname).href);
    assert.equal(await page.title(), "Tangle · Pocket Lab");
    assert.equal(await page.locator(".graph-node").count(), 1);

    await page.click("#run");
    await page.waitForFunction(() => document.getElementById("status").textContent === "Root resolved", null, { timeout: 60000 });
    assert.equal(await page.locator(".graph-node").count(), 9);
    assert.equal((await page.locator("#metrics").innerText()).replace(/\s+/g, " "), "9 nodes 13 visits 19 scripted calls 9 resolved");
    const summary = await page.evaluate(() => {
      const run = window.__tangle.current();
      return { statuses: run.nodes.map((n) => n.status), visits: run.visits, evidence: run.evidence.length, trace: run.trace.length };
    });
    assert.deepEqual(summary, { statuses: Array(9).fill("resolved"), visits: 13, evidence: 6, trace: 82 });

    // The inspector shows the selected node's finding and fixture evidence.
    await page.click("#fit");
    await page.click('.graph-node[data-id="n5"]');
    assert.equal(await page.locator("#nodeQuestion").innerText(), "What drives evaporation?");
    assert.match(await page.locator("#evidence").innerText(), /Illustrative fixture/);

    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#export")]);
    const exported = await readFile(await download.path(), "utf8");
    const imported = validateImport(exported);
    assert.equal(imported.nodes.length, 9);
    assert.equal(imported.readOnly, true);

    // Switching scenario starts a fresh graph (the confirm dialog is accepted above).
    await page.selectOption("#scenario", "blocked");
    await page.click("#run");
    // One leaf blocks; its parent runs again with what it has and the root still resolves.
    await page.waitForFunction(() => document.getElementById("status").textContent === "Root resolved", null, { timeout: 60000 });
    assert.equal(await page.locator(".graph-node").count(), 8);
    assert.equal(await page.locator('.graph-node[data-status="blocked"]').count(), 1);
    assert.equal(await page.locator('.graph-node[data-status="resolved"]').count(), 7);

    assert.deepEqual(requests, [], "the simulation must make no network requests");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("the driver hooks: a live run with custom limits, and Wikipedia served from a loaded recording without the network", { timeout: 120000 }, async (t) => {
  if (!existsSync(PAGE)) return t.skip("docs/index.html not built");
  const browser = await launch();
  if (!browser) return t.skip("no Chromium available");
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("dialog", (dialog) => dialog.accept());
    const requests = [];
    page.on("request", (request) => !request.url().startsWith("file:") && requests.push(request.url()));
    await page.goto(pathToFileURL(PAGE.pathname).href);

    // The flat baseline is a limits preset on a live run.
    const limits = await page.evaluate(() => window.__tangle.newLive("Why is the Dead Sea shrinking?", { maxDepth: 0, maxLookups: 6, maxPasses: 8 }));
    assert.deepEqual(limits, { maxNodes: 40, maxVisits: 60, maxDepth: 0, maxLookups: 6, maxPasses: 8, revisitSettled: true, walk: true });
    assert.deepEqual(await page.evaluate(() => [window.__tangle.current().mode, window.__tangle.current().seed]), ["live", "Why is the Dead Sea shrinking?"]);
    assert.equal(await page.locator("#liveMode").getAttribute("aria-pressed"), "true");

    // A recording loaded through the hook answers the wiki test without touching the network.
    const search = JSON.stringify({ query: { search: [{ title: "Water cycle", snippet: "The <span>water cycle</span>" }] } });
    const extract = JSON.stringify({ query: { pages: { 1: { title: "Water cycle", extract: "The water cycle is driven by the sun.\n\n== Processes ==\nEvaporation and precipitation.", revisions: [{ revid: 123 }] } } } });
    const loaded = await page.evaluate(
      ([search, extract, searchUrl, extractUrl]) => window.__tangle.wiki.load([{ url: searchUrl, status: 200, body: search }, { url: extractUrl, status: 200, body: extract }]),
      [search, extract, searchUrl("Water cycle"), extractUrl("Water cycle")],
    );
    assert.equal(loaded, 2);
    await page.click("#testWiki");
    await page.waitForFunction(() => /Water cycle|failed|not complete/.test(document.getElementById("wikiTestStatus").textContent), null, { timeout: 20000 });
    assert.match(await page.locator("#wikiTestStatus").innerText(), /Water cycle/);
    assert.deepEqual(await page.evaluate(() => window.__tangle.wiki.stats()), { hits: 2, misses: 0, entries: 2 });
    assert.equal((await page.evaluate(() => window.__tangle.wiki.dump())).length, 2);
    assert.deepEqual(requests.filter((url) => url.includes("wikipedia")), [], "the recording must answer every Wikipedia request");

    // Model calls need a loaded model; the hook says so rather than hanging.
    await assert.rejects(page.evaluate(() => window.__tangle.visit({ question: "Q?", children: [], evidence: [] })), /Load a model first/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
