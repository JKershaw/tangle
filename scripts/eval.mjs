#!/usr/bin/env node
// Run an eval suite against a model in the built page (PLAN.md):
//   node scripts/eval.mjs visits --model Qwen3-1.7B-q4f16_1-MLC [--only <regex>] [--out evals/results/<name>]
//   node scripts/eval.mjs runs --model <id> --mode tangle|flat|composing|closed [--seeds <path>] [--repeat N] [--only <regex>] [--run-timeout <minutes>]
// Modes: tangle is the walk with default limits; flat is the walk on one node
// (no children, more lookups); composing is the old one-prompt visit on one
// node, where the model writes its own finding; closed is the model alone,
// asked the seed with no tools — what it knows, graded on facts named, none
// of them supported by construction. --repeat runs the suite N times, one
// row and one JSON each, so a one-fact gap can be told from noise.
// Options shared with live-run.mjs: --url, --profile, --chromium, --load-timeout.
// visits: every case in evals/visits.json through one model call, graded.
// runs: every seed in evals/seeds.json as a whole graph (tangle limits or the
// flat one-node baseline), Wikipedia served from evals/wiki-cache and added to.
// Both write <out>.json and append one row to evals/results.md; full run
// exports go to evals/results/runs/ (not committed).
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { FLAT_LIMITS, formatGrades, formatRunGrade, gradeCase, gradeRun, profileOf, summariseGrades } from "./grade.js";
import { summarise } from "./summarise.js";
import { mentions } from "./text.js";
import { formatSample, sample, startSampling } from "./machine.js";
import { DEFAULT_MODEL, DEFAULT_URL, commitInfo, exportRun, loadModel, loadWikiCache, machineInfo, makeNotes, openLab, pageInfo, parseArgs, runToEnd, saveWikiCache, shortModel, stamp } from "./lab.mjs";

const args = parseArgs(process.argv.slice(2));
const suiteName = args._[0];
if (!["visits", "runs"].includes(suiteName)) {
  console.error("usage: node scripts/eval.mjs visits|runs --model <id> [--mode tangle|flat|composing] [--seeds <path>] [--repeat N] [--only <regex>] [--out <path>]");
  process.exit(2);
}
const mode = args.mode || "tangle";
if (!["tangle", "flat", "composing", "closed"].includes(mode)) {
  console.error(`unknown mode ${mode}`);
  process.exit(2);
}
const repeats = Math.max(1, Number(args.repeat ?? 1));
// The closed-book control: one call, the question, no evidence. The answer is
// a short JSON string so the same grammar path and token cap apply.
const CLOSED_VERSION = "closed-1";
const CLOSED_SYSTEM = "Answer the question in two or three sentences from what you know. Name the specific causes, places, processes or people involved.";
// A brief gets room for a profile: the same characters the graph may gather.
const CLOSED_PROFILE_VERSION = "closed-profile-1";
const CLOSED_PROFILE_SYSTEM = "Write a short profile answering the brief from what you know, in several short paragraphs. Name the specific works, events, places, people and consequences involved.";
const closedCall = (seed) =>
  seed.kind === "brief"
    ? { messages: [{ role: "system", content: CLOSED_PROFILE_SYSTEM }, { role: "user", content: seed.seed }], schema: { type: "object", properties: { answer: { type: "string", maxLength: 6000 } }, required: ["answer"], additionalProperties: false }, maxTokens: 1500 }
    : { messages: [{ role: "system", content: CLOSED_SYSTEM }, { role: "user", content: seed.seed }], schema: { type: "object", properties: { answer: { type: "string", maxLength: 900 } }, required: ["answer"], additionalProperties: false }, maxTokens: 320 };
const seedsPath = args.seeds || "evals/seeds.json";
const allSeeds = suiteName === "runs" ? JSON.parse(readFileSync(seedsPath, "utf8")).seeds : [];
const seedSet = seedsPath.replace(/^.*\//, "").replace(/\.json$/, "");
const WIKI_CACHE = "evals/wiki-cache";
const TABLE = "evals/results.md";
const HEADER = "# Eval results\n\nOne row per suite run; the JSON next to each holds every graded output. Newest last.\n\n| date | commit | suite | model | prompt · grammar | passed | detail | latency |\n|---|---|---|---|---|---|---|---|\n";
const model = args.model || DEFAULT_MODEL;
// The page under test is docs/index.html as served; name it by the commit that built it.
const commit = pageInfo();
const head = commitInfo();
const date = new Date().toISOString().slice(0, 10);
const out = args.out || `evals/results/${date}-${suiteName}${suiteName === "runs" ? "-" + mode : ""}${seedSet !== "seeds" ? "-" + seedSet : ""}-${shortModel(model)}-${commit.replace(/ .*/, "")}${repeats > 1 ? "-" + new Date().toISOString().slice(11, 16).replace(":", "") : ""}`;
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
  // Live runs are the walk unless a run's limits say otherwise: label rows
  // with the walk and its ask variants rather than the one-prompt visit.
  if (mode === "closed") {
    PROMPT_VERSION = allSeeds.some((seed) => seed.kind === "brief") ? CLOSED_PROFILE_VERSION : CLOSED_VERSION;
    RESPONSE_SCHEMA_VERSION = "answer:string";
  } else if (versions?.walk && suiteName === "runs" && mode !== "composing") {
    PROMPT_VERSION = `${versions.walk}/${versions.asks}`;
    RESPONSE_SCHEMA_VERSION = Object.entries(versions.variants ?? {}).map(([ask, variant]) => `${ask}:${variant}`).join(",");
  }
  Object.assign(record, { prompt: PROMPT_VERSION, schema: RESPONSE_SCHEMA_VERSION, page: versions });
  note(`machine at start: ${formatSample(sample())}`);
  const health = startSampling(15000);
  const machineNote = () => {
    const rolled = health.stop();
    record.machineHealth = rolled;
    note(`machine during the suite: gpu ${rolled.gpuPercent?.mean ?? "?"}% mean, ${rolled.gpuPercent?.max ?? "?"}% peak · vram up to ${rolled.vramGiB?.max ?? "?"} GiB · load up to ${rolled.load?.max ?? "?"} · ${rolled.throttledSamples ? `THROTTLED in ${rolled.throttledSamples} of ${rolled.samples} samples, worst ${rolled.worstSpeedLimit}%` : "no throttling in " + rolled.samples + " samples"}`);
    return rolled;
  };
  mkdirSync(dirname(out), { recursive: true });
  if (suiteName === "runs") {
    const seeds = allSeeds.filter((seed) => !only || only.test(seed.id));
    const limits = mode === "flat" ? FLAT_LIMITS : mode === "composing" ? { ...FLAT_LIMITS, walk: false } : mode === "closed" ? { closed: true } : {};
    note(`${stamp()} ${seeds.length} seeds from ${seedsPath} · mode ${mode} · limits ${JSON.stringify(limits)} · prompt ${PROMPT_VERSION} · grammar ${RESPONSE_SCHEMA_VERSION} · commit ${commit}${repeats > 1 ? ` · ${repeats} repeats` : ""}`);
    note(`wiki recording: ${await loadWikiCache(page, WIKI_CACHE)} responses loaded`);
    for (let repeat = 1; repeat <= repeats; repeat++) {
    const results = [];
    const suffix = repeats > 1 ? `-r${repeat}` : "";
    if (repeats > 1) note(`${stamp()} repeat ${repeat} of ${repeats}`);
    for (const seed of seeds) {
      if (mode === "closed") {
        const started = Date.now();
        let output;
        try {
          output = await page.evaluate((call) => window.__tangle.ask(call), closedCall(seed));
        } catch (error) {
          output = { text: "", error: String(error?.message || error) };
        }
        let text = "";
        try {
          text = String(JSON.parse(String(output.text ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim()).answer ?? "");
        } catch {
          text = String(output.text ?? "");
        }
        const facts = {};
        for (const [name, alternatives] of Object.entries(seed.facts)) facts[name] = { present: mentions(text, alternatives), supported: false, read: false };
        const profile = profileOf({ nodes: [{ id: "n1", status: "resolved", finding: text, evidence: [] }], evidence: [], trace: [] });
        const grade = { id: seed.id, kind: seed.kind ?? null, resolved: Boolean(text.trim()), outcome: text.trim() ? "answered" : "no answer", facts, factsTotal: Object.keys(facts).length, factsPresent: Object.values(facts).filter((fact) => fact.present).length, factsSupported: 0, factsRead: 0, distractors: (seed.distractors ?? []).filter((entry) => mentions(text, entry)), cost: { nodes: 0, visits: 0, modelCalls: 1, lookups: 0, tokens: output.tokens ?? 0 }, statuses: {}, finding: text, profile, wallSeconds: Math.round((Date.now() - started) / 1000), latencyMs: output.latencyMs ?? null, raw: output.text ?? "", ...(output.error ? { driverError: output.error } : {}) };
        results.push(grade);
        note(`${formatRunGrade(grade)} · ${grade.wallSeconds} s`);
        continue;
      }
      await page.evaluate(([seed, limits]) => window.__tangle.newLive(seed, limits), [seed.seed, limits]);
      const { outcome, retriesUsed, wallSeconds } = await runToEnd(page, { retries: Number(args.retries ?? 2), runTimeoutMs: Number(args["run-timeout"] ?? 45) * 60000, note });
      const saved = await saveWikiCache(page, WIKI_CACHE);
      const exported = await exportRun(page);
      const exportPath = `evals/results/runs/${date}-${shortModel(model)}-${mode}-${seed.id}${suffix}.json`;
      mkdirSync(dirname(exportPath), { recursive: true });
      writeFileSync(exportPath, JSON.stringify(exported));
      const grade = { ...gradeRun(seed, exported), kind: seed.kind, outcome, retriesUsed, wallSeconds, wiki: saved, export: exportPath, summary: summarise(exported) };
      results.push(grade);
      note(`${formatRunGrade(grade)} · ${wallSeconds} s · wiki ${saved.hits} hits ${saved.misses} misses`);
    }
    const rolled = repeat === repeats ? machineNote() : null;
    const sum = (key) => results.reduce((total, grade) => total + grade[key], 0);
    const repeatRecord = { ...record, mode, seedSet: seedsPath, repeat, repeats, limits: mode === "tangle" ? "default" : limits, seeds: results.length, resolved: results.filter((grade) => grade.resolved).length, factsPresent: sum("factsPresent"), factsSupported: sum("factsSupported"), factsRead: sum("factsRead"), factsTotal: sum("factsTotal"), results, notes: [...notes] };
    writeFileSync(`${out}${suffix}.json`, JSON.stringify(repeatRecord, null, 2) + "\n");
    const calls = results.reduce((total, grade) => total + grade.cost.modelCalls, 0);
    const lookups = results.reduce((total, grade) => total + grade.cost.lookups, 0);
    const seconds = results.reduce((total, grade) => total + grade.wallSeconds, 0);
    const perSeed = results.map((grade) => `${grade.id} ${grade.resolved ? "✓" : "✗"} ${grade.factsSupported}/${grade.factsPresent}/${grade.factsTotal}${grade.distractors.length ? "!" : ""}${grade.kind === "brief" && grade.profile ? ` ¶${grade.profile.paragraphs} h${grade.profile.hopsCited}/${grade.profile.hopsRead}/${grade.profile.hopsChosen}` : ""}`).join(", ");
    const briefs = results.some((grade) => grade.kind === "brief");
    appendRow([`runs · ${mode}${seedSet !== "seeds" ? ` · ${seedSet}` : ""}${repeats > 1 ? ` · r${repeat}/${repeats}` : ""}`, shortModel(model), `${PROMPT_VERSION} · ${RESPONSE_SCHEMA_VERSION}`, `**${repeatRecord.resolved}/${repeatRecord.seeds} resolved** · facts ${repeatRecord.factsPresent}/${repeatRecord.factsTotal} · supported ${repeatRecord.factsSupported}/${repeatRecord.factsTotal}`, `${perSeed} (supported/present/total${briefs ? " topics; ¶ paragraphs; hops cited/read/chosen" : ""}) · ${calls} calls · ${lookups} lookups`, `${seconds} s${rolled?.throttledSamples ? ` · throttled to ${rolled.worstSpeedLimit}%` : ""}`]);
    console.log("\n" + results.map(formatRunGrade).join("\n") + `\n\nwrote ${out}${suffix}.json and a row in ${TABLE}`);
    }
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
  const rolled = machineNote();
  const total = summariseGrades(results);
  Object.assign(record, { cases: results.length, passed: total.passed, rate: total.rate, byClass: total.byClass, results, notes });
  writeFileSync(`${out}.json`, JSON.stringify(record, null, 2) + "\n");
  const failing = Object.entries(total.byClass)
    .filter(([, entry]) => entry.passed < entry.cases)
    .map(([name, entry]) => `${name} ${entry.passed}/${entry.cases}`)
    .join(", ");
  const latencies = results.map((result) => result.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
  const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;
  appendRow([suiteName, shortModel(model), `${PROMPT_VERSION} · ${RESPONSE_SCHEMA_VERSION}`, `**${total.passed}/${total.cases}**`, failing ? `not fully passing: ${failing}` : "all classes pass", `median ${median ?? "?"} ms${rolled?.throttledSamples ? ` · throttled to ${rolled.worstSpeedLimit}%` : ""}`]);
  console.log("\n" + formatGrades(results) + `\n\nwrote ${out}.json and a row in ${TABLE}`);
} finally {
  await browser.close();
}
