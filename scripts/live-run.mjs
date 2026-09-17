#!/usr/bin/env node
// Drives the built page through one complete run and records the experiment:
//   node scripts/live-run.mjs --url http://127.0.0.1:8765/ --out experiments/2026-09-17-qwen3-0.6b-water-cycle
// Options:
//   --mode live|simulation   (default live)      --model <id>   (default Qwen3-0.6B-q4f16_1-MLC)
//   --seed "<question>"      (live only)          --scenario revisit|blocked|repeat (simulation only)
//   --retries N              (default 2: retries after "Paused on error")
//   --headless               (simulation only; live mode needs a headed browser for WebGPU)
//   --chromium <path>        (executable; default: installed Google Chrome via Playwright's "chrome" channel)
//   --profile <dir>          (persistent browser profile so model weights stay cached; default ~/.cache/tangle/chrome-profile)
//   --load-timeout <minutes> (default 20)         --run-timeout <minutes> (default 90)
// Writes <out>.json (the export), <out>.png (the map) and <out>.md (notes skeleton with the summary).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import os from "node:os";
import { summarise } from "./summarise.js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, token, index, all) => {
    if (token.startsWith("--")) pairs.push([token.slice(2), all[index + 1]?.startsWith("--") || all[index + 1] === undefined ? true : all[index + 1]]);
    return pairs;
  }, []),
);
const url = args.url || "http://127.0.0.1:8765/";
const mode = args.mode || "live";
const model = args.model || "Qwen3-0.6B-q4f16_1-MLC";
const retries = Number(args.retries ?? 2);
const out = args.out;
if (!out) {
  console.error("--out <path-without-extension> is required");
  process.exit(2);
}
const loadTimeoutMs = Number(args["load-timeout"] ?? 20) * 60000;
const runTimeoutMs = Number(args["run-timeout"] ?? 90) * 60000;

const { chromium } = await import("playwright-core");
// A persistent profile keeps the browser's model-weight cache between runs; a
// throwaway profile re-downloads gigabytes every time.
const profile = args.profile || join(os.homedir(), ".cache", "tangle", "chrome-profile");
mkdirSync(profile, { recursive: true });
const launchOptions = { headless: !!args.headless, viewport: { width: 1280, height: 1000 } };
if (args.chromium) launchOptions.executablePath = args.chromium;
else launchOptions.channel = "chrome";
const browser = await chromium.launchPersistentContext(profile, launchOptions);
const version = () => browser.browser()?.version() ?? "unknown";
const notes = [];
const note = (line) => {
  notes.push(line);
  console.log(line);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = () => new Date().toISOString();

try {
  const page = await browser.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  page.on("pageerror", (error) => note(`page error: ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error") note(`console error: ${message.text().slice(0, 300)}`);
  });
  await page.goto(url);
  note(`${stamp()} opened ${url} in ${version()} (${os.platform()} ${os.arch()}, ${os.cpus()[0]?.model ?? "unknown cpu"})`);

  if (mode === "live") {
    await page.click("#liveMode");
    await page.click("#checkDevice");
    await page.waitForFunction(() => !document.getElementById("deviceStatus").textContent.startsWith("Checking"), null, { timeout: 60000 });
    note(`device: ${await page.locator("#deviceStatus").innerText()}`);
    if (args.seed) {
      await page.fill("#seed", String(args.seed));
      await page.click("#newLive");
    }
    await page.selectOption("#model", model);
    await page.check("#autoWiki");
    const loadStarted = Date.now();
    await page.click("#loadModel");
    // Read textContent, not innerText: the page collapses the settings panel once
    // the model is ready, and innerText of a collapsed element is "". Poll rather
    // than waitForFunction so the notes show download and compile progress; a
    // stalled load is otherwise indistinguishable from a slow one.
    const loadState = () =>
      page.evaluate(() => ({ badge: document.getElementById("modelBadge").textContent, status: document.getElementById("loadStatus").textContent }));
    let loadStatus = "";
    for (let lastNoted = 0; ; ) {
      const { badge, status } = await loadState();
      loadStatus = status;
      const done = badge === "ready" || status.startsWith("Could not load");
      if (done || Date.now() - lastNoted > 30000) {
        note(`${stamp()} loading: ${status}`);
        lastNoted = Date.now();
      }
      if (done) break;
      if (Date.now() - loadStarted > loadTimeoutMs) throw new Error(`Model load timed out after ${loadTimeoutMs / 60000} minutes; last status: ${status}`);
      await wait(5000);
    }
    note(`model ${model}: ${loadStatus} (${Math.round((Date.now() - loadStarted) / 1000)} s)`);
    if (!loadStatus.startsWith("Ready")) throw new Error("Model did not load.");
  } else {
    if (args.scenario) await page.selectOption("#scenario", String(args.scenario));
  }

  const terminal = () => page.evaluate(() => !window.__tangle.busy() && window.__tangle.outcome() !== "Ready");
  const runStarted = Date.now();
  let retriesUsed = 0;
  for (;;) {
    await page.click("#run");
    await wait(1500);
    await page.waitForFunction(() => !window.__tangle.busy(), null, { timeout: runTimeoutMs, polling: 3000 });
    const outcome = await page.evaluate(() => window.__tangle.outcome());
    note(`${stamp()} run stopped: ${outcome}`);
    if (!outcome.startsWith("Paused on error") || retriesUsed >= retries) break;
    const errored = await page.evaluate(() => window.__tangle.current().nodes.find((node) => node.status === "error"));
    note(`retry ${retriesUsed + 1}: ${errored.id} ${errored.reason}`);
    await page.click("#fit");
    await page.click(`.graph-node[data-id="${errored.id}"]`);
    await page.click("#retry");
    retriesUsed++;
  }
  if (!(await terminal())) note("warning: the page does not report a terminal state");
  const wallSeconds = Math.round((Date.now() - runStarted) / 1000);

  const exported = await page.evaluate(() => {
    const run = JSON.parse(JSON.stringify(window.__tangle.current()));
    run.exportedAt = new Date().toISOString();
    return run;
  });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.json`, JSON.stringify(exported, null, 2));
  await page.click("#fit");
  await page.locator(".map-panel").screenshot({ path: `${out}.png` });
  const summary = summarise(exported);
  const md = [
    `# ${exported.mode} run · ${exported.model ?? "scripted"} · ${exported.seed}`,
    "",
    `- date: ${exported.created}`,
    `- commit: (fill in: git rev-parse --short HEAD)`,
    `- machine / GPU: (fill in)`,
    `- browser: ${version()}`,
    `- run wall time: ${wallSeconds} s · retries used: ${retriesUsed}`,
    "",
    "## Driver log",
    "",
    ...notes.map((line) => `- ${line}`),
    "",
    "## Summary",
    "",
    "```",
    summary,
    "```",
    "",
    "## Observations",
    "",
    "(the three strangest things in the trace, quoting node questions and raw model output)",
    "",
  ].join("\n");
  writeFileSync(`${out}.md`, md);
  console.log("\n" + summary + `\n\nwrote ${out}.json, ${out}.png, ${out}.md`);
} finally {
  await browser.close();
}
