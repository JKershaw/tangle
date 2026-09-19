#!/usr/bin/env node
// One run of the walk in Node, no browser, against an OpenAI-compatible
// endpoint (Ollama by default) and the Wikipedia recording:
//   node scripts/run.mjs --seed "Why is the Dead Sea shrinking?" --model qwen3:8b --out experiments/2026-09-19-qwen3-8b-dead-sea-node
// Options: --endpoint <url> (default http://127.0.0.1:11434/v1) · --limits '<json>' · --source <dir> (a directory as the corpus, in place of Wikipedia)
//          --wiki-cache <dir> (default evals/wiki-cache; replayed and added to)
//          --retries N (default 2) · --run-timeout <minutes> (default 45) · --quiet
// Writes <out>.json (the export) and <out>.md (notes skeleton with the summary),
// the same files scripts/live-run.mjs writes for the page, minus the map image.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { summarise } from "./summarise.js";
import { commitInfo, machineInfo, makeNotes, parseArgs, stamp } from "./lab.mjs";
import { openNodeLab } from "./node-lab.mjs";
import { DEFAULT_ENDPOINT } from "../src/endpoint.js";

const args = parseArgs(process.argv.slice(2));
if (!args.seed || !args.out || !args.model) {
  console.error("usage: node scripts/run.mjs --seed <question or brief> --model <id> --out <path-without-extension> [--endpoint <url>] [--limits <json>] [--wiki-cache <dir>]");
  process.exit(2);
}
const { notes, note } = makeNotes();
const lab = await openNodeLab({ endpoint: args.endpoint || DEFAULT_ENDPOINT, wikiCache: args["wiki-cache"] ?? "evals/wiki-cache", source: args.source ? { root: String(args.source) } : null, note, onUpdate: args.quiet ? null : (nodeId, message) => message && console.log(`${stamp()} ${nodeId} · ${message}`) });
try {
  await lab.loadModel(String(args.model));
  const limits = lab.newLive(String(args.seed), args.limits ? JSON.parse(args.limits) : {});
  note(`seed: ${args.seed} · limits ${JSON.stringify(limits)} · wiki recording: ${lab.wikiSave().entries} responses`);
  const { retriesUsed, wallSeconds } = await lab.runToEnd({ retries: Number(args.retries ?? 2), runTimeoutMs: Number(args["run-timeout"] ?? 45) * 60000, note });
  const saved = lab.wikiSave();
  note(`wiki recording: ${saved.hits} hits, ${saved.misses} misses, ${saved.added} new responses saved`);
  const exported = lab.exportRun();
  mkdirSync(dirname(String(args.out)), { recursive: true });
  writeFileSync(`${args.out}.json`, JSON.stringify(exported, null, 2));
  const summary = summarise(exported);
  const md = [
    `# ${exported.mode} run · ${exported.model} · ${exported.seed}`,
    "",
    `- date: ${exported.created}`,
    `- commit: ${commitInfo()} (src/ as run in Node)`,
    `- runtime: ${lab.runtime}`,
    `- machine: ${machineInfo()}`,
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
  writeFileSync(`${args.out}.md`, md);
  console.log("\n" + summary + `\n\nwrote ${args.out}.json and ${args.out}.md`);
} finally {
  await lab.close();
}
