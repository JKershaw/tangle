#!/usr/bin/env node
// The node evals: one ask, many variants, many models, hand-authored cases.
//   node scripts/node-eval.mjs sentence --models Qwen3-0.6B-q4f16_1-MLC,Qwen3-1.7B-q4f16_1-MLC [--variants json,list] [--only <regex>] [--repeat 1]
//   node scripts/node-eval.mjs section --models openrouter:deepseek/deepseek-chat-v3-0324
// Cases live in evals/node/<ask>.json; asks and variants in src/asks.js. Page
// models run in the built page (docs/index.html as served on --url); models
// prefixed openrouter: run over OpenRouter (OPENROUTER_API_KEY). The result is
// a table of pass rates by model and variant, saved as JSON under
// evals/results/ with every raw output, and one row per model×variant in
// evals/node/results.md.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ASKS, ASK_VERSION, askAnswer, askCalls } from "../src/asks.js";
import { cachedArticle, sectionSentences } from "./node-case.mjs";
import { askOpenRouter, openRouterModel } from "./openrouter.mjs";
import { DEFAULT_URL, loadModel, machineInfo, openLab, pageInfo, parseArgs, shortModel, stamp } from "./lab.mjs";

const args = parseArgs(process.argv.slice(2));
const ask = args._[0];
if (!ASKS[ask]) {
  console.error(`usage: node scripts/node-eval.mjs ${Object.keys(ASKS).join("|")} --models <id,id,...> [--variants a,b] [--only <regex>] [--repeat N] [--check]`);
  process.exit(2);
}
const models = String(args.models || "Qwen3-0.6B-q4f16_1-MLC").split(",").map((id) => id.trim()).filter(Boolean);
const variants = args.variants ? String(args.variants).split(",") : Object.keys(ASKS[ask].variants);
const repeat = Number(args.repeat ?? 1);
const only = args.only ? new RegExp(args.only) : null;
const TABLE = "evals/node/results.md";
const HEADER = "# Node eval results\n\nOne row per model and ask variant; the JSON named in the row holds every raw output. Pass rates are over the cases in evals/node/<ask>.json at that commit. Newest last.\n\n| date | commit | ask | variant | model | passed | median ms | calls | failed cases |\n|---|---|---|---|---|---|---|---|---|\n";

// ---- cases: build the ask input from the case file and check it ----
export function buildInput(ask, spec) {
  if (ask === "sentence") {
    const all = sectionSentences(spec.source.article, spec.source.section);
    const sentences = all.slice(spec.source.from - 1, spec.source.to);
    if (sentences.length !== spec.source.to - spec.source.from + 1) throw new Error(`${spec.id}: section has ${all.length} sentences, not ${spec.source.to}`);
    if (spec.expect.contains && !sentences[Number(spec.expect.sentence) - 1]?.includes(spec.expect.contains)) throw new Error(`${spec.id}: sentence ${spec.expect.sentence} does not contain "${spec.expect.contains}" — has the splitter changed?`);
    return { question: spec.question, sentences, titles: sentences.map(() => spec.source.article) };
  }
  if (ask === "section") {
    const sections = cachedArticle(spec.article).sections.map((section) => section.heading).filter(Boolean);
    for (const heading of spec.expect.accept) if (!sections.includes(heading)) throw new Error(`${spec.id}: "${heading}" is not a heading of ${spec.article}`);
    return { question: spec.question, article: spec.article, sections: [...new Set(sections)] };
  }
  if (ask === "missing" || ask === "question") {
    const sentences = spec.source ? sectionSentences(spec.source.article, spec.source.section).slice(spec.source.from - 1, spec.source.to) : [];
    return { question: spec.question, sentences };
  }
  throw new Error(`no input builder for ${ask}`);
}

export function grade(ask, spec, answer) {
  if (ask === "sentence") {
    const accept = spec.expect.accept ?? [spec.expect.sentence];
    const parts = String(answer).split("+");
    return parts.length > 0 && parts.every((part) => accept.includes(part));
  }
  if (ask === "section") return spec.expect.accept.includes(answer);
  if (ask === "missing") return new RegExp(spec.expect.mentions, "i").test(String(answer));
  if (ask === "question") {
    const text = String(answer).trim();
    const same = (a, b) => a.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim() === b.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    return (text.match(/\?/g) || []).length === 1 && !same(text, spec.question) && new RegExp(spec.expect.mentions, "i").test(text);
  }
  return false;
}

const file = `evals/node/${ask}.json`;
const cases = JSON.parse(readFileSync(file, "utf8")).cases.filter((spec) => !only || only.test(spec.id));
const inputs = cases.map((spec) => ({ spec, input: buildInput(ask, spec) }));
if (args.check) {
  for (const { spec, input } of inputs) console.log(`${spec.id}: ${ASKS[ask].describe(input)} · expect ${JSON.stringify(spec.expect)}`);
  process.exit(0);
}
const commit = pageInfo();
const date = new Date().toISOString().slice(0, 10);
const results = [];
let pageVersions = null;
const log = (line) => console.log(`${stamp()} ${line}`);
log(`${ask} · ${cases.length} cases · variants ${variants.join(", ")} · models ${models.join(", ")} · asks ${ASK_VERSION} · page ${commit}`);

async function runModel(model, send) {
  for (const variant of variants) {
    let passed = 0;
    for (const { spec, input } of inputs) {
      for (let rep = 0; rep < repeat; rep++) {
        const definition = ASKS[ask].variants[variant];
        const outputs = [];
        let latencyMs = 0;
        let tokens = 0;
        let error = null;
        let answer = null;
        let calls = [];
        const measured = async (call) => {
          calls.push(call);
          const output = await send(call);
          outputs.push(output.text);
          latencyMs += output.latencyMs ?? 0;
          tokens += output.tokens ?? 0;
          return output;
        };
        try {
          if (definition.run) {
            answer = (await definition.run(measured, input)).answer;
          } else {
            for (const call of askCalls(ask, variant, input)) await measured(call);
            answer = askAnswer(ask, variant, outputs, input);
          }
        } catch (caught) {
          error = String(caught?.message ?? caught);
        }
        const pass = !error && grade(ask, spec, answer);
        if (pass) passed++;
        results.push({ model, variant, case: spec.id, rep, size: ASKS[ask].describe(input), answer, pass, error, latencyMs, tokens, calls: calls.length, outputs });
        log(`${pass ? "pass" : "FAIL"} ${shortModel(model)} ${variant} ${spec.id} → ${error ?? JSON.stringify(answer)} (${latencyMs} ms${calls.length > 1 ? ", " + calls.length + " calls" : ""})`);
      }
    }
    log(`${shortModel(model)} ${variant}: ${passed}/${cases.length * repeat}`);
  }
}

for (const model of models) {
  const remote = openRouterModel(model);
  if (remote) {
    await runModel(model, (call) => askOpenRouter(remote, call));
    continue;
  }
  const { browser, page, versions } = await openLab({ url: args.url || DEFAULT_URL, profile: args.profile, chromium: args.chromium, note: log });
  pageVersions ??= versions;
  try {
    await loadModel(page, model, { loadTimeoutMs: Number(args["load-timeout"] ?? 20) * 60000, note: log });
    await runModel(model, (call) => page.evaluate((call) => window.__tangle.ask(call), call));
  } finally {
    await browser.close();
  }
}

// ---- the table ----
const rows = [];
for (const model of models) {
  for (const variant of variants) {
    const mine = results.filter((result) => result.model === model && result.variant === variant);
    if (!mine.length) continue;
    const passed = mine.filter((result) => result.pass).length;
    const latencies = mine.map((result) => result.latencyMs).sort((a, b) => a - b);
    const failed = [...new Set(mine.filter((result) => !result.pass).map((result) => result.case))];
    rows.push({ model, variant, passed, total: mine.length, medianMs: latencies[Math.floor(latencies.length / 2)] ?? 0, calls: mine.reduce((sum, result) => sum + result.calls, 0), failed });
  }
}
const out = args.out || `evals/results/${date}-node-${ask}-${commit.replace(/ .*/, "")}-${new Date().toISOString().slice(11, 16).replace(":", "")}`;
mkdirSync("evals/results", { recursive: true });
writeFileSync(`${out}.json`, JSON.stringify({ ask, asks: ASK_VERSION, commit, page: pageVersions, date: new Date().toISOString(), machine: machineInfo(), models, variants, repeat, cases: cases.map((spec) => spec.id), rows, results }, null, 2));
if (!existsSync(TABLE)) writeFileSync(TABLE, HEADER);
for (const row of rows) appendFileSync(TABLE, `| ${date} | ${commit} | ${ask} | ${row.variant} | ${shortModel(row.model)} | ${row.passed}/${row.total} | ${row.medianMs} | ${row.calls} | ${row.failed.join(", ") || "—"} |\n`);
console.log("");
console.log(`${ask} · pass rate by model and variant (${cases.length} cases${repeat > 1 ? " × " + repeat : ""})`);
const width = Math.max(...models.map((model) => shortModel(model).length), 5);
console.log(`${"model".padEnd(width)}  ${variants.map((variant) => variant.padStart(8)).join("")}`);
for (const model of models) console.log(`${shortModel(model).padEnd(width)}  ${variants.map((variant) => { const row = rows.find((candidate) => candidate.model === model && candidate.variant === variant); return (row ? `${row.passed}/${row.total}` : "—").padStart(8); }).join("")}`);
console.log(`\nwrote ${out}.json and ${rows.length} rows in ${TABLE}`);
