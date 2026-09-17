#!/usr/bin/env node
// Run an eval suite against a model in the built page (PLAN.md):
//   node scripts/eval.mjs visits --model Qwen3-1.7B-q4f16_1-MLC [--only <regex>] [--out evals/results/<name>]
// Options shared with live-run.mjs: --url, --profile, --chromium, --load-timeout.
// Writes <out>.json with every graded output and appends one row to evals/results.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { PROMPT_VERSION } from "../src/episode.js";
import { RESPONSE_SCHEMA_VERSION } from "../src/webllm.js";
import { formatGrades, gradeCase, summariseGrades } from "./grade.js";
import { DEFAULT_MODEL, DEFAULT_URL, commitInfo, loadModel, machineInfo, makeNotes, openLab, parseArgs, shortModel, stamp } from "./lab.mjs";

const args = parseArgs(process.argv.slice(2));
const suiteName = args._[0];
if (suiteName !== "visits") {
  console.error("usage: node scripts/eval.mjs visits --model <id> [--only <regex>] [--out <path>]");
  process.exit(2);
}
const model = args.model || DEFAULT_MODEL;
const commit = commitInfo();
const date = new Date().toISOString().slice(0, 10);
const out = args.out || `evals/results/${date}-${suiteName}-${shortModel(model)}-${commit.replace(/ .*/, "")}`;
const only = args.only ? new RegExp(args.only) : null;
const suite = JSON.parse(readFileSync(new URL("../evals/visits.json", import.meta.url), "utf8"));
const cases = suite.cases.filter((entry) => !only || only.test(entry.id) || only.test(entry.class ?? ""));

const { notes, note } = makeNotes();
const { browser, page, version } = await openLab({ url: args.url || DEFAULT_URL, profile: args.profile, chromium: args.chromium, note });
const results = [];
try {
  const loadSeconds = await loadModel(page, model, { loadTimeoutMs: Number(args["load-timeout"] ?? 20) * 60000, note });
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
  const record = {
    suite: suiteName,
    model,
    prompt: PROMPT_VERSION,
    schema: RESPONSE_SCHEMA_VERSION,
    commit,
    machine: machineInfo(),
    browser: version(),
    date: new Date().toISOString(),
    loadSeconds,
    cases: results.length,
    passed: total.passed,
    rate: total.rate,
    byClass: total.byClass,
    results,
    notes,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.json`, JSON.stringify(record, null, 2) + "\n");
  const failing = Object.entries(total.byClass)
    .filter(([, entry]) => entry.passed < entry.cases)
    .map(([name, entry]) => `${name} ${entry.passed}/${entry.cases}`)
    .join(", ");
  const latencies = results.map((result) => result.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
  const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;
  const row = `| ${date} | ${commit} | ${suiteName} | ${shortModel(model)} | ${PROMPT_VERSION} · ${RESPONSE_SCHEMA_VERSION} | **${total.passed}/${total.cases}** | ${failing || "none"} | ${median ?? "?"} ms |`;
  const table = "evals/results.md";
  if (!existsSync(table)) writeFileSync(table, "# Eval results\n\nOne row per suite run; the JSON next to each holds every graded output. Newest last.\n\n| date | commit | suite | model | prompt · grammar | passed | classes not fully passing | median latency |\n|---|---|---|---|---|---|---|---|\n");
  appendFileSync(table, row + "\n");
  console.log("\n" + formatGrades(results) + `\n\nwrote ${out}.json and a row in ${table}`);
} finally {
  await browser.close();
}
