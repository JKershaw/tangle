// The shared browser driver: opens the built page in a persistent Chrome
// profile (model weights stay cached), loads a model with progress notes, runs
// a graph to its end, exports it, and loads or saves the Wikipedia recording.
// scripts/live-run.mjs and scripts/eval.mjs are thin wrappers over this.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import os from "node:os";

export const DEFAULT_URL = "http://127.0.0.1:8765/";
export const DEFAULT_MODEL = "Qwen3-0.6B-q4f16_1-MLC";
export const DEFAULT_PROFILE = join(os.homedir(), ".cache", "tangle", "chrome-profile");

// "--flag value" pairs and bare "--flag" switches; positional words are returned under `_`.
export function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) args[token.slice(2)] = true;
    else {
      args[token.slice(2)] = next;
      index++;
    }
  }
  return args;
}

export const stamp = () => new Date().toISOString();
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const shortModel = (id) => String(id).replace(/-q4f16_1-MLC$/, "").toLowerCase();

export function commitInfo() {
  try {
    const dirty = execSync("git status --porcelain -- docs/index.html src", { encoding: "utf8" }).trim() ? " (uncommitted changes)" : "";
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim() + dirty;
  } catch {
    return "unknown";
  }
}

// The served page is docs/index.html as last committed, whatever HEAD is; a
// branch can be ahead of the build. Say which commit built the page.
export function pageInfo() {
  try {
    const built = execSync("git log -1 --format=%h -- docs/index.html", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain -- docs/index.html", { encoding: "utf8" }).trim() ? " (uncommitted build)" : "";
    return built + dirty;
  } catch {
    return "unknown";
  }
}

export const machineInfo = () => `${os.cpus()[0]?.model ?? "unknown cpu"}, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.platform()} ${os.release()}`;

export function makeNotes() {
  const notes = [];
  const note = (line) => {
    notes.push(line);
    console.log(line);
  };
  return { notes, note };
}

export async function openLab({ url = DEFAULT_URL, headless = false, profile = DEFAULT_PROFILE, chromium: executablePath, note = console.log } = {}) {
  const { chromium } = await import("playwright-core");
  mkdirSync(profile, { recursive: true });
  const launchOptions = { headless, viewport: { width: 1280, height: 1000 } };
  if (executablePath) launchOptions.executablePath = executablePath;
  else launchOptions.channel = "chrome";
  const browser = await chromium.launchPersistentContext(profile, launchOptions);
  const version = () => browser.browser()?.version() ?? "unknown";
  const page = await browser.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  page.on("pageerror", (error) => note(`page error: ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error") note(`console error: ${message.text().slice(0, 300)}`);
  });
  await page.goto(url);
  note(`${stamp()} opened ${url} in ${version()} (${os.platform()} ${os.arch()}, ${os.cpus()[0]?.model ?? "unknown cpu"})`);
  return { browser, page, version };
}

// Switch to live mode, probe the device and load the model, noting progress
// every 30 s so a stalled download is distinguishable from a slow one.
export async function loadModel(page, model, { loadTimeoutMs = 20 * 60000, note = console.log } = {}) {
  await page.click("#liveMode");
  await page.click("#checkDevice");
  await page.waitForFunction(() => !document.getElementById("deviceStatus").textContent.startsWith("Checking"), null, { timeout: 60000 });
  note(`device: ${await page.locator("#deviceStatus").innerText()}`);
  await page.selectOption("#model", model);
  await page.check("#autoWiki");
  const started = Date.now();
  await page.click("#loadModel");
  // textContent, not innerText: the settings panel collapses once the model is ready.
  const loadState = () => page.evaluate(() => ({ badge: document.getElementById("modelBadge").textContent, status: document.getElementById("loadStatus").textContent }));
  let status = "";
  for (let lastNoted = 0; ; ) {
    const state = await loadState();
    status = state.status;
    const done = state.badge === "ready" || status.startsWith("Could not load");
    if (done || Date.now() - lastNoted > 30000) {
      note(`${stamp()} loading: ${status}`);
      lastNoted = Date.now();
    }
    if (done) break;
    if (Date.now() - started > loadTimeoutMs) throw new Error(`Model load timed out after ${loadTimeoutMs / 60000} minutes; last status: ${status}`);
    await wait(5000);
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  note(`model ${model}: ${status} (${seconds} s)`);
  if (!status.startsWith("Ready")) throw new Error("Model did not load.");
  return seconds;
}

// Press Run until the page reports a terminal state, retrying errored nodes.
export async function runToEnd(page, { retries = 2, runTimeoutMs = 90 * 60000, note = console.log } = {}) {
  const started = Date.now();
  let retriesUsed = 0;
  let outcome;
  for (;;) {
    await page.click("#run");
    await wait(1500);
    await page.waitForFunction(() => !window.__tangle.busy(), null, { timeout: runTimeoutMs, polling: 3000 });
    outcome = await page.evaluate(() => window.__tangle.outcome());
    note(`${stamp()} run stopped: ${outcome}`);
    if (!outcome.startsWith("Paused on error") || retriesUsed >= retries) break;
    const errored = await page.evaluate(() => window.__tangle.current().nodes.find((node) => node.status === "error"));
    note(`retry ${retriesUsed + 1}: ${errored.id} ${errored.reason}`);
    await page.click("#fit");
    await page.click(`.graph-node[data-id="${errored.id}"]`);
    await page.click("#retry");
    retriesUsed++;
  }
  const terminal = await page.evaluate(() => !window.__tangle.busy() && window.__tangle.outcome() !== "Ready");
  if (!terminal) note("warning: the page does not report a terminal state");
  return { outcome, retriesUsed, wallSeconds: Math.round((Date.now() - started) / 1000) };
}

export const exportRun = (page) =>
  page.evaluate(() => {
    const run = JSON.parse(JSON.stringify(window.__tangle.current()));
    run.exportedAt = new Date().toISOString();
    return run;
  });

// ---- the Wikipedia recording ----
// One file per response, named by the URL's hash, so a diff shows which
// articles changed and the directory can be committed.
const entryPath = (dir, url) => join(dir, createHash("sha1").update(url).digest("hex").slice(0, 16) + ".json");

export async function loadWikiCache(page, dir) {
  if (!existsSync(dir)) return 0;
  const entries = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
  return page.evaluate((entries) => window.__tangle.wiki.load(entries), entries);
}

export async function saveWikiCache(page, dir) {
  const entries = await page.evaluate(() => window.__tangle.wiki.dump());
  mkdirSync(dir, { recursive: true });
  let added = 0;
  for (const entry of entries) {
    const path = entryPath(dir, entry.url);
    if (existsSync(path)) continue;
    writeFileSync(path, JSON.stringify(entry) + "\n");
    added++;
  }
  const stats = await page.evaluate(() => window.__tangle.wiki.stats());
  return { ...stats, added };
}
