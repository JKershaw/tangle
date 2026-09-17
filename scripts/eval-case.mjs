#!/usr/bin/env node
// Add a micro-eval case to evals/visits.json from a recorded situation:
//   node scripts/eval-case.mjs --export experiments/<run>.json --seq <n> --id <id> --class "<class>" [--expect '<json>'] [--note "..."]
//   node scripts/eval-case.mjs --fixture <name> --id <id> [--expect '<json>']         (from test/fixtures/model-outputs.json)
// --seq points at a model_input event (an action case) or a section_chosen event (a section case).
// Without --expect the case is added with an empty expect for you to fill in.
import { readFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, token, index, all) => {
    if (token.startsWith("--")) pairs.push([token.slice(2), all[index + 1]?.startsWith("--") || all[index + 1] === undefined ? true : all[index + 1]]);
    return pairs;
  }, []),
);
const file = new URL("../evals/visits.json", import.meta.url);
let suite;
try {
  suite = JSON.parse(readFileSync(file, "utf8"));
} catch {
  suite = { version: 1, cases: [] };
}
if (!args.id) {
  console.error("--id is required");
  process.exit(2);
}
if (suite.cases.some((entry) => entry.id === args.id)) {
  console.error(`case ${args.id} already exists`);
  process.exit(2);
}
const expect = args.expect ? JSON.parse(args.expect) : {};
let entry;
if (args.fixture) {
  const fixtures = JSON.parse(readFileSync(new URL("../test/fixtures/model-outputs.json", import.meta.url), "utf8"));
  const fixture = fixtures[args.fixture];
  if (!fixture) {
    console.error(`no fixture ${args.fixture}`);
    process.exit(2);
  }
  entry = {
    id: args.id,
    kind: "action",
    class: args.class ?? fixture.class,
    from: { run: fixture.run, seq: fixture.seq, model: fixture.model, prompt: fixture.prompt, fixture: args.fixture },
    context: { question: fixture.question, ...fixture.context },
    recorded: fixture.raw,
    expect,
  };
} else {
  const run = JSON.parse(readFileSync(args.export, "utf8"));
  const seq = Number(args.seq);
  const event = run.trace.find((candidate) => candidate.seq === seq);
  if (!event) {
    console.error(`no event with seq ${seq}`);
    process.exit(2);
  }
  const from = { run: args.export.replace(/^.*\//, "").replace(/\.json$/, ""), seq, model: run.model, prompt: run.promptVersion };
  if (event.event === "model_input") {
    const output = run.trace.find((candidate) => candidate.seq > seq && candidate.event === "model_output" && candidate.node === event.node);
    entry = { id: args.id, kind: "action", class: args.class ?? null, from, context: event.context, recorded: output?.raw ?? null, expect };
  } else if (event.event === "section_chosen") {
    const asked = JSON.parse(event.messages[1].content);
    entry = { id: args.id, kind: "section", class: args.class ?? "section pick", from, context: asked, recorded: event.raw, expect };
  } else {
    console.error(`seq ${seq} is a ${event.event} event, not model_input or section_chosen`);
    process.exit(2);
  }
}
if (args.note) entry.note = args.note;
suite.cases.push(entry);
writeFileSync(file, JSON.stringify(suite, null, 2) + "\n");
console.log(`added ${entry.id} (${entry.kind}, ${entry.class ?? "unclassified"}); ${suite.cases.length} cases`);
