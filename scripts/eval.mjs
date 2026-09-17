#!/usr/bin/env node
// Run an eval suite against a model in the built page (PLAN.md):
//   node scripts/eval.mjs visits --model Qwen3-1.7B-q4f16_1-MLC [--only <regex>] [--out evals/results/<name>]
//   node scripts/eval.mjs runs --model <id> --mode tangle|flat [--only <regex>] [--run-timeout <minutes>]
// Options shared with live-run.mjs: --url, --profile, --chromium, --load-timeout.
// visits: every case in evals/visits.json through one model call, graded.
// runs: every seed in evals/seeds.json as a whole graph (tangle limits or the
// flat one-node baseline), Wikipedia served from evals/wiki-cache and added to.
// Both write <out>.json and append one row to evals/results.md; full run
// exports go to evals/results/runs/ (not committed).
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { FLAT_LIMITS, formatGrades, formatRunGrade, gradeCase, gradeRun, summariseGrades } from "./grade.js";
import { summarise } from "./summarise.js";
import { DEFAULT_MODEL, DEFAULT_URL, commitInfo, exportRun, loadModel, loadWikiCache, machineInfo, makeNotes, openLab, pageInfo, parseArgs, runToEnd, saveWikiCache, shortModel, stamp } from "./lab.mjs";

const args = parseArgs(process.argv.slice(2));
const suiteName = args._[0];
if (!["visits", "runs"].includes(suiteName)) {
  console.error("usage: node scripts/eval.mjs visits|runs --model <id> [--mode tangle|flat] [--only <regex>] [--out <path>]");
  process.exit(2);
}
const mode = args.mode || "tangle";
const WIKI_CACHE = "evals/wiki-cache";
const TABLE = "evals/results.md";
const HEADER = "# Eval results\n\nOne row per suite run; the JSON next to each holds every graded output. Newest last.\n\n| date | commit | suite | model | prompt · grammar | passed | detail | latency |\n|---|---|---|---|---|---|---|---|\n";
const model = args.model || DEFAULT_MODEL;
// The page under test is docs/index.html as served; name it by the commit that built it.
const commit = pageInfo();
const head = commitInfo();
const date = new Date().toISOString().slice(0, 10);
const out = args.out || `evals/results/${date}-${suiteName}${suiteName === "runs" ? "-" + mode : ""}-${shortModel(model)}-${commit.replace(/ .*/, "")}`;
const only = args.only ? new RegExp(args.only) : null;
const { notes, note } = makeNotes();
const { browser, page, version } = await openLab({ url: args.url || DEFAULT_URL, profile: args.profile, chromium: args.chromium, note });
const results = [];
const record = { suite: suiteName, model, commit, head, machine: machineInfo(), browser: version(), date: new Date().toISOString() };
let PROMPT_VERSION = "?";
let RESPONSE_SCHEMA_VERSION = "?";
const appendRow = (cells) => {
  if (!existsSync(TABLE)) writeFileSync(TABLE, HEADER);
  appendFileSync(TABLE, `| ${date} | ${commit} | ${cells.join(" | ")} |\n`);
};
try {
  record.loadSeconds = await loadModel(page, model, { loadTimeoutMs: Number(args["load-timeout"] ?? 20) * 60000, note });
  const versions = await page.evaluate(() => window.__tangle.versions?.() ?? null);
  if (versions) ({ prompt: PROMPT_VERSION, schema: RESPONSE_SCHEMA_VERSION } = versions);
  Object.assign(record, { prompt: PROMPT_VERSION, schema: RESPONSE_SCHEMA_VERSION });
  mkdirSync(dirname(out), { recursive: true });
  if (suiteName === "runs") {
    const seeds = JSON.parse(readFileSync(new URL("../evals/seeds.json", import.meta.url), "utf8")).seeds.filter((seed) => !only || only.test(seed.id));
    const limits = mode === "flat" ? FLAT_LIMITS : {};
    note(`${stamp()} ${seeds.length} seeds · mode ${mode} · limits ${JSON.stringify(limits)} · prompt ${PROMPT_VERSION} · grammar ${RESPONSE_SCHEMA_VERSION} · commit ${commit}`);
    note(`wiki recording: ${await loadWikiCache(page, WIKI_CACHE)} responses loaded`);
    for (const seed of seeds) {
      await page.evaluate(([seed, limits]) => window.__tangle.newLive(seed, limits), [seed.seed, limits]);
      const { outcome, retriesUsed, wallSeconds } = await runToEnd(page, { retries: Number(args.retries ?? 2), runTimeoutMs: Number(args["run-timeout"] ?? 45) * 60000, note });
      const saved = await saveWikiCache(page, WIKI_CACHE);
      const exported = await exportRun(page);
      const exportPath = `evals/results/runs/${date}-${shortModel(model)}-${mode}-${seed.id}.json`;
      mkdirSync(dirname(exportPath), { recursive: true });
      writeFileSync(exportPath, JSON.stringify(exported));
      const grade = { ...gradeRun(seed, exported), kind: seed.kind, outcome, retriesUsed, wallSeconds, wiki: saved, export: exportPath, summary: summarise(exported) };
      results.push(grade);
      note(`${formatRunGrade(grade)} · ${wallSeconds} s · wiki ${saved.hits} hits ${saved.misses} misses`);
    }
    const sum = (key) => results.reduce((total, grade) => total + grade[key], 0);
    Object.assign(record, { mode, limits: mode === "flat" ? FLAT_LIMITS : "default", seeds: results.length, resolved: results.filter((grade) => grade.resolved).length, factsPresent: sum("factsPresent"), factsSupported: sum("factsSupported"), factsRead: sum("factsRead"), factsTotal: sum("factsTotal"), results, notes });
    writeFileSync(`${out}.json`, JSON.stringify(record, null, 2) + "\n");
    const calls = results.reduce((total, grade) => total + grade.cost.modelCalls, 0);
    const lookups = results.reduce((total, grade) => total + grade.cost.lookups, 0);
    const seconds = results.reduce((total, grade) => total + grade.wallSeconds, 0);
    const perSeed = results.map((grade) => `${grade.id} ${grade.resolved ? "✓" : "✗"} ${grade.factsSupported}/${grade.factsPresent}/${grade.factsTotal}${grade.distractors.length ? "!" : ""}`).join(", ");
    appendRow([`runs · ${mode}`, shortModel(model), `${PROMPT_VERSION} · ${RESPONSE_SCHEMA_VERSION}`, `**${record.resolved}/${record.seeds} resolved** · facts ${record.factsPresent}/${record.factsTotal} · supported ${record.factsSupported}/${record.factsTotal}`, `${perSeed} (supported/present/total) · ${calls} calls · ${lookups} lookups`, `${seconds} s`]);
    console.log("\n" + results.map(formatRunGrade).join("\n") + `\n\nwrote ${out}.json and a row in ${TABLE}`);
    process.exitCode = 0;
    await browser.close();
    process.exit(0);
  }
  const suite = JSON.parse(readFileSync(new URL("../evals/visits.json", import.meta.url), "utf8"));
  const cases = suite.cases.filter((entry) => !only || only.test(entry.id) || only.test(entry.class ?? ""));
  note(`${stamp()} ${cases.length} cases · prompt ${PROMPT_VERSION} · grammar ${RESPONSE_SCHEMA_VERSION} · commit ${commit}`);
  for (const entry of cases) {
    let output;
    try {
      output = await page.evaluate(
        ([kind, context]) => (kind === "section" ? window.__tangle.pick(context) : window.__tangle.visit(context)),
        [entry.kind, entry.context],
      );
    } catch (error) {
      output = { text: "", error: String(error?.message || error), latencyMs: null, tokens: null };
    }
    const grade = gradeCase(entry, output.text ?? "");
    const result = { ...grade, raw: output.text ?? "", latencyMs: output.latencyMs ?? null, tokens: output.tokens ?? null, ...(output.error ? { driverError: output.error } : {}) };
    results.push(result);
    const failed = grade.checks.filter((check) => !check.pass);
    note(`${grade.pass ? "pass" : "FAIL"} ${entry.id} → ${grade.action ?? grade.error ?? "?"} (${output.latencyMs ?? "?"} ms)${failed.length ? " · " + failed.map((check) => `${check.name}: ${check.detail}`).join(" · ") : ""}`);
  }
  const total = summariseGrades(results);
  Object.assign(record, { cases: results.length, passed: total.passed, rate: total.rate, byClass: total.byClass, results, notes });
  writeFileSync(`${out}.json`, JSON.stringify(record, null, 2) + "\n");
  const failing = Object.entries(total.byClass)
    .filter(([, entry]) => entry.passed < entry.cases)
    .map(([name, entry]) => `${name} ${entry.passed}/${entry.cases}`)
    .join(", ");
  const latencies = results.map((result) => result.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
  const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;
  appendRow([suiteName, shortModel(model), `${PROMPT_VERSION} · ${RESPONSE_SCHEMA_VERSION}`, `**${total.passed}/${total.cases}**`, failing ? `not fully passing: ${failing}` : "all classes pass", `median ${median ?? "?"} ms`]);
  console.log("\n" + formatGrades(results) + `\n\nwrote ${out}.json and a row in ${TABLE}`);
} finally {
  await browser.close();
}
