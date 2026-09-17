#!/usr/bin/env node
// Drives the built page through one complete run and records the experiment:
//   node scripts/live-run.mjs --url http://127.0.0.1:8765/ --out experiments/2026-09-17-qwen3-0.6b-water-cycle
// Options:
//   --mode live|simulation   (default live)      --model <id>   (default Qwen3-0.6B-q4f16_1-MLC)
//   --seed "<question>"      (live only)          --scenario revisit|blocked|repeat (simulation only)
//   --limits '<json>'        (live only; e.g. the flat baseline {"maxDepth":0,"maxLookups":6,"maxPasses":8})
//   --wiki-cache <dir>       (load the Wikipedia recording first and add what the run fetched)
//   --retries N              (default 2: retries after "Paused on error")
//   --headless               (simulation only; live mode needs a headed browser for WebGPU)
//   --chromium <path>        (executable; default: installed Google Chrome via Playwright's "chrome" channel)
//   --profile <dir>          (persistent browser profile so model weights stay cached; default ~/.cache/tangle/chrome-profile)
//   --load-timeout <minutes> (default 20)         --run-timeout <minutes> (default 90)
// Writes <out>.json (the export), <out>.png (the map) and <out>.md (notes skeleton with the summary).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { summarise } from "./summarise.js";
import { formatSample, sample, startSampling } from "./machine.js";
import { DEFAULT_MODEL, DEFAULT_URL, commitInfo, exportRun, loadModel, loadWikiCache, machineInfo, makeNotes, openLab, parseArgs, runToEnd, saveWikiCache } from "./lab.mjs";

const args = parseArgs(process.argv.slice(2));
const mode = args.mode || "live";
const model = args.model || DEFAULT_MODEL;
const out = args.out;
if (!out) {
  console.error("--out <path-without-extension> is required");
  process.exit(2);
}
const { notes, note } = makeNotes();
const { browser, page, version } = await openLab({ url: args.url || DEFAULT_URL, headless: !!args.headless, profile: args.profile, chromium: args.chromium, note });
try {
  if (mode === "live") {
    await loadModel(page, model, { loadTimeoutMs: Number(args["load-timeout"] ?? 20) * 60000, note });
    if (args["wiki-cache"]) note(`wiki recording: ${await loadWikiCache(page, args["wiki-cache"])} responses loaded from ${args["wiki-cache"]}`);
    if (args.seed) {
      const limits = await page.evaluate(([seed, limits]) => window.__tangle.newLive(seed, limits), [String(args.seed), args.limits ? JSON.parse(args.limits) : {}]);
      note(`seed: ${args.seed} · limits ${JSON.stringify(limits)}`);
    }
  } else if (args.scenario) {
    await page.selectOption("#scenario", String(args.scenario));
  }

  note(`machine at start: ${formatSample(sample())}`);
  const health = startSampling(15000);
  const { retriesUsed, wallSeconds } = await runToEnd(page, { retries: Number(args.retries ?? 2), runTimeoutMs: Number(args["run-timeout"] ?? 90) * 60000, note });
  const machineHealth = health.stop();
  note(`machine during the run: gpu ${machineHealth.gpuPercent?.mean ?? "?"}% mean, ${machineHealth.gpuPercent?.max ?? "?"}% peak · vram up to ${machineHealth.vramGiB?.max ?? "?"} GiB · load up to ${machineHealth.load?.max ?? "?"} · ${machineHealth.throttledSamples ? `THROTTLED in ${machineHealth.throttledSamples} of ${machineHealth.samples} samples, worst ${machineHealth.worstSpeedLimit}%` : "no throttling in " + machineHealth.samples + " samples"}`);
  if (mode === "live" && args["wiki-cache"]) {
    const saved = await saveWikiCache(page, args["wiki-cache"]);
    note(`wiki recording: ${saved.hits} hits, ${saved.misses} misses, ${saved.added} new responses saved`);
  }
  const exported = await exportRun(page);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.json`, JSON.stringify(exported, null, 2));
  await page.click("#fit");
  await page.locator(".map-panel").screenshot({ path: `${out}.png` });
  const summary = summarise(exported);
  const md = [
    `# ${exported.mode} run · ${exported.model ?? "scripted"} · ${exported.seed}`,
    "",
    `- date: ${exported.created}`,
    `- commit: ${commitInfo()} (docs/index.html as served; the page loaded at run start)`,
    `- machine: ${machineInfo()}`,
    `- browser: ${version()}`,
    `- run wall time: ${wallSeconds} s · retries used: ${retriesUsed}`,
    `- machine during the run: ${JSON.stringify(machineHealth)}`,
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
