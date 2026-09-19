#!/usr/bin/env node
// Run the benchmark (PLAN.md) in one column against one model:
//   node scripts/eval.mjs runs --model <id> --mode tangle|flat|closed|tools|tools-cited [--seeds <path>] [--repeat N] [--only <regex>] [--out <path>] [--run-timeout <minutes>]
//   node scripts/eval.mjs runs --endpoint http://127.0.0.1:11434/v1 --model qwen3:8b --mode tangle
//   node scripts/eval.mjs runs --model qwen3:1.7b --mode tangle --replay-only          # from the cache alone (CI)
// Columns (scripts/columns.mjs): tangle is the walk; flat the walk on one
// node; closed the model alone; tools and tools-cited the same model with the
// four source requests as tools in one context (--match <tangle results json>
// gives each seed the graph's own calls and tokens). Every column's export is
// shaped like a run and graded once (grade.js gradeRun). --repeat runs the
// suite N times, one row and one JSON each, so a one-fact gap can be told
// from noise. Without --endpoint the suite runs in the built page through
// Playwright (--url, --profile, --chromium, --load-timeout as live-run.mjs);
// with it, in Node (scripts/node-lab.mjs) against an OpenAI-compatible server,
// or OpenRouter with OPENROUTER_API_KEY in the environment. A file corpus
// (--source <dir>, or the seeds file's "source") runs in Node only; with
// --actions a brief's root may run one of the corpus's commands in a worktree.
// The model cache (src/replay.js): every call is recorded by its exact context
// under --model-cache <dir> (default evals/model-cache/<model>/) and replayed
// when seen again, so a rerun after a code change costs only the calls the
// change touched; the row says how many calls were replayed. --replay-only
// runs from the cache alone, without a server, a GPU or the network, and
// exits non-zero on a miss. --no-model-cache turns recording and replay off.
// Writes <out>.json and appends one row to evals/results.md; full run exports
// go to evals/results/runs/ (not committed).
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { formatRunGrade, gradeRun } from "./grade.js";
import { summarise } from "./summarise.js";
import { formatSample, sample, startSampling } from "./machine.js";
import { DEFAULT_MODEL, DEFAULT_URL, browserLab, commitInfo, machineInfo, makeNotes, openLab, pageInfo, parseArgs, shortModel, stamp } from "./lab.mjs";
import { openNodeLab } from "./node-lab.mjs";
import { MODEL_CACHE, modelCacheDir } from "./recording.mjs";
import { TOOLS_VERSION } from "./tools.mjs";
import { CLOSED_PROFILE_VERSION, CLOSED_VERSION, COLUMNS, limitsFor, runColumn } from "./columns.mjs";
import { DEFAULT_ENDPOINT } from "../src/endpoint.js";

const args = parseArgs(process.argv.slice(2));
const usage = "usage: node scripts/eval.mjs runs --model <id> [--mode tangle|flat|closed|tools|tools-cited] [--seeds <path>] [--repeat N] [--only <regex>] [--out <path>] [--endpoint <url>] [--match <json>] [--replay-only]";
if (args._[0] !== "runs") {
  console.error(usage);
  process.exit(2);
}
const mode = args.mode || "tangle";
if (!COLUMNS.includes(mode)) {
  console.error(`unknown mode ${mode}\n${usage}`);
  process.exit(2);
}
const tools = mode.startsWith("tools");
const repeats = Math.max(1, Number(args.repeat ?? 1));
const seedsPath = args.seeds || "evals/seeds.json";
const allSeedsFile = JSON.parse(readFileSync(seedsPath, "utf8"));
const allSeeds = allSeedsFile.seeds ?? [];
const seedSet = seedsPath.replace(/^.*\//, "").replace(/\.json$/, "");
const WIKI_CACHE = "evals/wiki-cache";
const TABLE = "evals/results.md";
const HEADER = "# Eval results\n\nOne row per suite run; the JSON next to each holds every graded output. Newest last.\n\n| date | commit | suite | model | prompt · grammar | passed | detail | latency |\n|---|---|---|---|---|---|---|---|\n";
const model = args.model || DEFAULT_MODEL;
const replayOnly = Boolean(args["replay-only"]);
const modelCache = args["no-model-cache"] ? null : args["model-cache"] && args["model-cache"] !== true ? String(args["model-cache"]) : MODEL_CACHE;
const modelDir = modelCache ? modelCacheDir(modelCache, model) : null;
if (replayOnly && !modelDir) {
  console.error("--replay-only needs the model cache; drop --no-model-cache");
  process.exit(2);
}
const endpoint = args.endpoint ? String(args.endpoint) : replayOnly ? DEFAULT_ENDPOINT : null;
if (tools && !endpoint) {
  console.error("the tool control runs in Node; add --endpoint");
  process.exit(2);
}
// The budget each seed gets in the tool control: the graph's own spend on it.
const matched = args.match ? JSON.parse(readFileSync(String(args.match), "utf8")) : null;
const budgetFor = (seed) => {
  const row = matched?.results?.find((result) => result.id === seed.id);
  return row ? { calls: row.cost.modelCalls, tokens: row.cost.tokens } : null;
};
// The page under test is docs/index.html as served; name it by the commit
// that built it. In Node the code under test is src/ at HEAD.
const commit = endpoint ? commitInfo() : pageInfo();
const head = commitInfo();
const date = new Date().toISOString().slice(0, 10);
const modelName = `${shortModel(model)}${endpoint ? "-node" : ""}`;
const out = args.out || `evals/results/${date}-runs-${mode}${seedSet !== "seeds" ? "-" + seedSet : ""}-${modelName.replace(/[:/]/g, "-")}-${commit.replace(/ .*/, "")}${replayOnly ? "-replay" : ""}${repeats > 1 ? "-" + new Date().toISOString().slice(11, 16).replace(":", "") : ""}`;
const only = args.only ? new RegExp(args.only) : null;
const { notes, note } = makeNotes();
// --source <dir>: a directory as the corpus (src/files.js); the seeds file
// may name one too ("source": { "root": "../mangodb" }, relative to the
// repository). Node only, for now.
const sourceRoot = args.source ? String(args.source) : allSeedsFile.source?.root ? resolve(process.cwd(), allSeedsFile.source.root) : null;
if (sourceRoot && !endpoint) {
  console.error("a file corpus runs in Node for now; add --endpoint");
  process.exit(2);
}
const lab = endpoint ? await openNodeLab({ endpoint, live: !replayOnly, offline: replayOnly, wikiCache: WIKI_CACHE, source: sourceRoot ? { ...(allSeedsFile.source ?? {}), root: sourceRoot } : null, actions: Boolean(args.actions), note }) : browserLab(await openLab({ url: args.url || DEFAULT_URL, profile: args.profile, chromium: args.chromium, note }));
const corpus = lab.corpus?.() ?? null;
const record = { suite: "runs", model, runtime: lab.kind, ...(endpoint ? { endpoint } : {}), ...(corpus ? { source: { kind: "files", name: corpus.name, root: corpus.root, files: corpus.size, hash: corpus.hash } } : {}), commit, head, machine: machineInfo(), browser: lab.version(), date: new Date().toISOString() };
const appendRow = (cells) => {
  if (!existsSync(TABLE)) writeFileSync(TABLE, HEADER);
  appendFileSync(TABLE, `| ${date} | ${commit} | ${cells.join(" | ")} |\n`);
};
try {
  record.loadSeconds = await lab.loadModel(model, { loadTimeoutMs: Number(args["load-timeout"] ?? 20) * 60000, note });
  if (modelDir) note(`${stamp()} model cache ${modelDir}: ${await lab.modelLoad(modelDir)} responses loaded${replayOnly ? " · replay only" : ""}`);
  const versions = await lab.versions();
  // The row's prompt and grammar columns name what decided the column's picks.
  let PROMPT_VERSION = "?";
  let RESPONSE_SCHEMA_VERSION = "?";
  if (mode === "closed") {
    PROMPT_VERSION = allSeeds.some((seed) => seed.kind === "brief") ? CLOSED_PROFILE_VERSION : CLOSED_VERSION;
    RESPONSE_SCHEMA_VERSION = "answer:string";
  } else if (tools) {
    PROMPT_VERSION = TOOLS_VERSION;
    RESPONSE_SCHEMA_VERSION = `tools:${mode === "tools-cited" ? "cited" : "composing"}${matched ? " · matched" : ""}`;
  } else if (versions?.walk) {
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
  const seeds = allSeeds.filter((seed) => !only || only.test(seed.id));
  const limits = limitsFor(mode, { matched: args.match ?? null });
  note(`${stamp()} ${seeds.length} seeds from ${seedsPath} · mode ${mode} · limits ${JSON.stringify(limits)} · prompt ${PROMPT_VERSION} · grammar ${RESPONSE_SCHEMA_VERSION} · commit ${commit}${repeats > 1 ? ` · ${repeats} repeats` : ""}`);
  note(`wiki recording: ${await lab.wikiLoad(WIKI_CACHE)} responses loaded`);
  for (let repeat = 1; repeat <= repeats; repeat++) {
    const results = [];
    const suffix = repeats > 1 ? `-r${repeat}` : "";
    if (repeats > 1) note(`${stamp()} repeat ${repeat} of ${repeats}`);
    for (const seed of seeds) {
      const budget = tools ? budgetFor(seed) : null;
      if (tools && matched && !budget) note(`${seed.id}: no row in ${args.match}; the default budget`);
      const { exported, outcome, retriesUsed, wallSeconds } = await runColumn(mode, seed, lab, { retries: Number(args.retries ?? 2), runTimeoutMs: Number(args["run-timeout"] ?? 45) * 60000, budget, note });
      const saved = await lab.wikiSave(WIKI_CACHE);
      const replayed = modelDir ? await lab.modelSave(modelDir) : null;
      const exportPath = `evals/results/runs/${date}-${modelName.replace(/[:/]/g, "-")}-${mode}-${seed.id}${suffix}.json`;
      mkdirSync(dirname(exportPath), { recursive: true });
      writeFileSync(exportPath, JSON.stringify({ ...exported, model: exported.model ?? model, exportedAt: exported.exportedAt ?? new Date().toISOString() }));
      const grade = {
        ...gradeRun(seed, exported),
        kind: seed.kind,
        outcome,
        retriesUsed,
        wallSeconds,
        wiki: saved,
        replay: exported.replay ?? (replayed ? { hits: replayed.hits, misses: replayed.misses } : { hits: 0, misses: 0 }),
        export: exportPath,
        ...(mode === "closed" ? { raw: exported.raw ?? "", latencyMs: exported.latencyMs ?? null } : {}),
        ...(tools ? { budget: exported.limits ?? null, stoppedBy: exported.stoppedBy, dropped: exported.dropped, refused: exported.refused ?? 0, answer: exported.answer ?? null } : {}),
        ...(mode === "tangle" || mode === "flat" ? { summary: summarise(exported) } : {}),
      };
      results.push(grade);
      const extras = tools ? ` · stopped by ${exported.stoppedBy}${exported.refused ? ` · ${exported.refused} unread answers refused` : ""}${exported.dropped ? ` · ${exported.dropped} results dropped from the context` : ""}` : mode === "closed" ? "" : ` · wiki ${saved.hits} hits ${saved.misses} misses`;
      note(`${formatRunGrade(grade)}${extras} · ${wallSeconds} s${replayed ? ` · model ${replayed.hits} replayed ${replayed.misses} missed` : ""}`);
    }
    const rolled = repeat === repeats ? machineNote() : null;
    const sum = (key) => results.reduce((total, grade) => total + grade[key], 0);
    const replay = { hits: results.reduce((total, grade) => total + (grade.replay?.hits ?? 0), 0), misses: results.reduce((total, grade) => total + (grade.replay?.misses ?? 0), 0), cache: modelDir, replayOnly };
    const repeatRecord = { ...record, mode, seedSet: seedsPath, repeat, repeats, limits: mode === "tangle" ? "default" : limits, seeds: results.length, resolved: results.filter((grade) => grade.resolved).length, factsPresent: sum("factsPresent"), factsSupported: sum("factsSupported"), factsRead: sum("factsRead"), factsTotal: sum("factsTotal"), replay, results, notes: [...notes] };
    writeFileSync(`${out}${suffix}.json`, JSON.stringify(repeatRecord, null, 2) + "\n");
    const calls = results.reduce((total, grade) => total + grade.cost.modelCalls, 0);
    const lookups = results.reduce((total, grade) => total + grade.cost.lookups, 0);
    const seconds = results.reduce((total, grade) => total + grade.wallSeconds, 0);
    const perSeed = results.map((grade) => `${grade.id} ${grade.resolved ? "✓" : "✗"} ${grade.factsSupported}/${grade.factsPresent}/${grade.factsTotal}${grade.distractors.length ? "!" : ""}${grade.kind === "brief" && grade.profile ? ` ¶${grade.profile.paragraphs} h${grade.profile.hopsCited}/${grade.profile.hopsRead}/${grade.profile.hopsChosen}` : ""}`).join(", ");
    const briefs = results.some((grade) => grade.kind === "brief");
    appendRow([`runs · ${mode}${seedSet !== "seeds" ? ` · ${seedSet}` : ""}${repeats > 1 ? ` · r${repeat}/${repeats}` : ""}`, endpoint ? `${shortModel(model)} · node` : shortModel(model), `${PROMPT_VERSION} · ${RESPONSE_SCHEMA_VERSION}`, `**${repeatRecord.resolved}/${repeatRecord.seeds} resolved** · facts ${repeatRecord.factsPresent}/${repeatRecord.factsTotal} · supported ${repeatRecord.factsSupported}/${repeatRecord.factsTotal}`, `${perSeed} (supported/present/total${briefs ? " topics; ¶ paragraphs; hops cited/read/chosen" : ""}) · ${calls} calls · ${lookups} lookups${modelDir ? ` · ${replay.hits} replayed` : ""}`, `${seconds} s${rolled?.throttledSamples ? ` · throttled to ${rolled.worstSpeedLimit}%` : ""}`]);
    console.log("\n" + results.map(formatRunGrade).join("\n") + `\n\nwrote ${out}${suffix}.json and a row in ${TABLE}`);
    if (modelDir) console.log(`model cache: ${replay.hits} of ${calls} calls replayed, ${replay.misses} missed`);
    if (replayOnly && replay.misses) {
      console.error(`replay only, but ${replay.misses} calls were not in the cache`);
      process.exitCode = 1;
    }
  }
} finally {
  await lab.close();
}
process.exit(process.exitCode ?? 0);
