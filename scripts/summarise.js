#!/usr/bin/env node
// Summarise an exported run without reading the whole JSON: the tree, counters,
// and the things worth a second look (repeats, failed lookups, errors, long
// visits, findings that lean on few sources). Usage: node scripts/summarise.js run.json
import { readFileSync } from "node:fs";
import { validateImport } from "../src/graph.js";

export function summarise(run) {
  const lines = [];
  const byId = new Map(run.nodes.map((node) => [node.id, node]));
  const counts = {};
  for (const node of run.nodes) counts[node.status] = (counts[node.status] || 0) + 1;
  lines.push(`${run.mode} run · seed: ${run.seed}`);
  lines.push(`model ${run.model ?? "scripted"} · prompt ${run.promptVersion ?? "?"} · created ${run.created}${run.exportedAt ? " · exported " + run.exportedAt : ""}`);
  lines.push(`nodes ${run.nodes.length} · visits ${run.visits} · model calls ${run.modelCalls} · lookups ${run.lookups} · evidence ${run.evidence.length} · tokens ${run.tokens}`);
  lines.push(`statuses ${JSON.stringify(counts)} · outcome: ${run.nodes[0].status === "resolved" ? "root resolved" : run.stopReason || "root unresolved"}`);
  lines.push("");
  const print = (node, indent) => {
    const flags = [];
    if (node.visits > 1) flags.push(`v${node.visits}`);
    if (node.failedLookups?.length) flags.push(`${node.failedLookups.length} failed lookup${node.failedLookups.length > 1 ? "s" : ""}`);
    const tail = node.finding ? ` → ${node.finding.slice(0, 90)}` : node.reason ? ` !! ${node.reason.slice(0, 90)}` : "";
    lines.push(`${"  ".repeat(indent)}${node.id} [${node.status}${flags.length ? " " + flags.join(" ") : ""}] ${node.question}${tail}`);
    for (const child of run.nodes.filter((candidate) => candidate.parent === node.id)) print(child, indent + 1);
  };
  print(run.nodes[0], 0);
  lines.push("");

  const notes = [];
  const questions = new Map();
  for (const node of run.nodes) questions.set(node.question.toLowerCase().trim(), [...(questions.get(node.question.toLowerCase().trim()) || []), node.id]);
  for (const [question, ids] of questions) if (ids.length > 1) notes.push(`repeated question (${ids.join(", ")}): ${question}`);
  for (const node of run.nodes) {
    const parent = node.parent && byId.get(node.parent);
    if (parent && parent.question.toLowerCase().trim() === node.question.toLowerCase().trim()) notes.push(`${node.id} re-asks its parent's question verbatim`);
  }
  for (const node of run.nodes) for (const entry of node.failedLookups || []) notes.push(`${node.id} lookup found nothing: “${entry.query}” (${entry.error})`);
  for (const node of run.nodes) if (node.status === "error") notes.push(`${node.id} error: ${node.reason}`);
  for (const node of run.nodes) if (node.status === "blocked") notes.push(`${node.id} blocked: ${node.reason}`);
  const latencies = run.trace.filter((event) => event.event === "model_output" && Number.isFinite(event.latencyMs)).map((event) => event.latencyMs);
  if (latencies.length) {
    const sorted = [...latencies].sort((a, b) => a - b);
    lines.push(`model latency ms: median ${sorted[Math.floor(sorted.length / 2)]} · max ${sorted.at(-1)} · n ${sorted.length}`);
  }
  const partial = run.trace.filter((event) => event.event === "partial_model_output").length;
  if (partial) notes.push(`${partial} generation${partial > 1 ? "s" : ""} cut off before completing`);
  const invalid = run.trace.filter((event) => event.event === "node_error" && /Unknown action|Expected|evidence|questions|characters/.test(event.error || ""));
  for (const event of invalid) notes.push(`${event.node} model output rejected by the validator: ${event.error}`);
  for (const node of run.nodes.filter((candidate) => candidate.status === "resolved")) {
    const kids = run.nodes.filter((candidate) => candidate.parent === node.id && candidate.status === "resolved");
    if (kids.length && !node.evidence.some((id) => node.observed.includes(id))) notes.push(`${node.id} resolved citing only its children's sources`);
  }
  lines.push(notes.length ? "worth a look:" : "nothing flagged");
  for (const note of notes) lines.push(`- ${note}`);
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/summarise.js <exported-run.json>");
    process.exit(2);
  }
  console.log(summarise(validateImport(readFileSync(file, "utf8"))));
}
