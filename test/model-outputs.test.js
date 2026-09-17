// Real model outputs from recorded runs (test/fixtures/model-outputs.json,
// each with its run, sequence number and the context the model saw), grouped by
// the class of failure they exemplify. The suite states what the harness does
// with each today — prevented by the grammar, rejected by the validator, flagged
// by the summariser, or still accepted — so a change to the schema, prompt or
// validator is checked against every recorded failure in seconds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyResult, captureEvidence, createRun, parseModelOutput, validateResult } from "../src/graph.js";
import { responseSchema } from "../src/webllm.js";
import { summarise } from "../scripts/summarise.js";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/model-outputs.json", import.meta.url), "utf8"));

// Would the live grammar (a JSON schema of anyOf object variants) have allowed this object?
export function permittedBy(schema, value) {
  return schema.anyOf.some((variant) => {
    if (!value || value.action !== variant.properties.action.const) return false;
    if (Object.keys(value).some((key) => !(key in variant.properties))) return false;
    if (variant.required.some((key) => !(key in value))) return false;
    return Object.entries(variant.properties).every(([key, rule]) => {
      if (key === "action" || !(key in value)) return true;
      const item = value[key];
      if (rule.type === "string") return typeof item === "string" && item.length >= (rule.minLength ?? 0) && item.length <= (rule.maxLength ?? Infinity);
      if (rule.type === "array") {
        if (!Array.isArray(item) || item.length < (rule.minItems ?? 0) || item.length > (rule.maxItems ?? Infinity)) return false;
        return item.every((entry) => (rule.items.enum ? rule.items.enum.includes(entry) : typeof entry === "string" && entry.length <= (rule.items.maxLength ?? Infinity)));
      }
      return true;
    });
  });
}

// Rebuild the node's situation: its excerpts (so labels map to IDs), the ceilings it faced.
function situation(fixture, limits = {}) {
  const run = createRun(fixture.question, "live", limits);
  for (const excerpt of fixture.context.evidence) captureEvidence(run, "n1", { kind: "wiki", title: excerpt.title, text: excerpt.text || excerpt.title });
  const ids = run.evidence.map((record) => record.id);
  const labels = Object.fromEntries(ids.map((id, index) => [String(index + 1), id]));
  const grammar = responseSchema(ids, fixture.context.questionsAllowed, fixture.context.lookupsRemaining);
  const parsed = parseModelOutput(fixture.raw);
  const result = Array.isArray(parsed.evidence) ? { ...parsed, evidence: parsed.evidence.map((label) => labels[label] ?? label) } : parsed;
  return { run, node: run.nodes[0], ids, grammar, parsed, result };
}

test("wrong field: questions written into reason are rejected by the validator and impossible under the grammar", () => {
  const { run, node, ids, grammar, parsed, result } = situation(fixtures["decompose-with-questions-in-reason"]);
  assert.equal(parsed.action, "decompose");
  assert.equal(parsed.questions, undefined);
  assert.throws(() => validateResult(run, node, result, ids), /Propose 1–3 questions/);
  assert.equal(permittedBy(grammar, parsed), false);
});

test("invented evidence: sentences written as evidence are rejected, and with no excerpts the grammar has no resolved at all", () => {
  const { run, node, ids, grammar, parsed, result } = situation(fixtures["resolved-with-invented-evidence-sentences"]);
  assert.equal(parsed.action, "resolved");
  assert.ok(parsed.evidence.every((entry) => entry.length > 20), "the model's evidence entries are sentences");
  assert.throws(() => validateResult(run, node, result, ids), /invented evidence/);
  assert.deepEqual(grammar.anyOf.map((variant) => variant.properties.action.const), ["wiki", "decompose", "blocked"]);
});

test("invented evidence: labels beyond those shown are rejected and outside the enum", () => {
  const { run, node, ids, grammar, parsed, result } = situation(fixtures["resolved-citing-labels-not-shown"]);
  assert.deepEqual(parsed.evidence, ["1", "2", "3"]);
  assert.equal(ids.length, 1);
  assert.throws(() => validateResult(run, node, result, ids), /invented evidence/);
  assert.equal(permittedBy(grammar, parsed), false);
});

test("ceiling: decompose at the depth limit is rejected by the validator and absent from the grammar", () => {
  // The run predates questionsAllowed in the context, so impose the ceiling here.
  const fixture = { ...fixtures["decompose-at-depth-ceiling"], context: { ...fixtures["decompose-at-depth-ceiling"].context, questionsAllowed: 0 } };
  const { run, node, ids, grammar, parsed, result } = situation(fixture, { maxDepth: 0 });
  assert.throws(() => validateResult(run, node, result, ids), /Depth safety limit/);
  assert.equal(permittedBy(grammar, parsed), false);
});

test("ceiling: wiki with no lookups remaining is absent from the grammar", () => {
  const fixture = fixtures["wiki-at-lookup-ceiling"];
  const { grammar, parsed } = situation(fixture);
  assert.equal(fixture.context.lookupsRemaining, 0);
  assert.equal(parsed.action, "wiki");
  assert.equal(permittedBy(grammar, parsed), false);
});

test("degenerate output: a finding followed by whitespace to the token cap does not parse (known, not yet prevented)", () => {
  const fixture = fixtures["resolved-runs-to-token-cap-in-whitespace"];
  assert.match(fixture.raw, /\s{100,}$/);
  assert.throws(() => parseModelOutput(fixture.raw), SyntaxError);
});

test("malformed question: three questions in one child string are rejected by the validator", () => {
  const { run, node, ids, result } = situation(fixtures["decompose-three-questions-in-one-string"]);
  assert.equal(result.questions.length, 1);
  assert.equal((result.questions[0].match(/\?/g) || []).length, 3);
  assert.throws(() => validateResult(run, node, result, ids), /One question per child/);
});

for (const [name, expectFlag] of [["resolved-aral-sea-cited-to-dead-sea", true], ["resolved-correct-but-unsupported", true], ["resolved-correct-and-supported", false]]) {
  test(`${expectFlag ? "unsupported" : "supported"} finding: ${name} is ${expectFlag ? "flagged" : "not flagged"} by the summariser and accepted by the validator`, () => {
    const { run, node, ids, grammar, parsed, result } = situation(fixtures[name]);
    assert.equal(permittedBy(grammar, parsed), true);
    assert.doesNotThrow(() => validateResult(run, node, result, ids));
    applyResult(run, node.id, result, ids);
    const flagged = /absent from its cited excerpts/.test(summarise(run));
    assert.equal(flagged, expectFlag);
  });
}

test("degenerate finding: a prompt fragment echoed as the finding is rejected by the validator", () => {
  const { run, node, ids, grammar, parsed, result } = situation(fixtures["resolved-with-prompt-fragment-as-finding"]);
  assert.equal(parsed.finding, "Dead Sea / Receding shoreline");
  assert.equal(permittedBy(grammar, parsed), true, "the grammar cannot tell a label from a claim");
  assert.throws(() => validateResult(run, node, result, ids), /must be a sentence/);
});
