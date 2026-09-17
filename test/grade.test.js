// The graders are pinned with recorded outputs: each check must give the
// verdict a reader would give from its name. If a grader changes, the
// scoreboard changes meaning, so these are strict.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHECKS, formatGrades, formatRunGrade, gradeCase, gradeRun, summariseGrades } from "../scripts/grade.js";
import { mentions, missingWords, normalise } from "../scripts/text.js";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/model-outputs.json", import.meta.url), "utf8"));
const caseFrom = (name, expect, extra = {}) => ({ id: name, kind: "action", class: fixtures[name].class, context: { question: fixtures[name].question, ...fixtures[name].context }, expect, ...extra });
const verdicts = (grade) => Object.fromEntries(grade.checks.map((check) => [check.name, check.pass]));

test("text helpers: normalise, mentions with alternatives, missing words with stemming", () => {
  assert.equal(normalise("  Why is the Dead Sea shrinking?  "), "why is the dead sea shrinking");
  assert.equal(mentions("diversion of the Jordan River", "Jordan River|National Water Carrier"), true);
  assert.equal(mentions("the Aral Sea dried", "Jordan River|National Water Carrier"), false);
  assert.deepEqual(missingWords("The shoreline receded because of diversion.", [{ title: "Dead Sea", text: "Diversion of the Jordan; the shoreline recedes." }]), []);
  assert.deepEqual(missingWords("Potash extraction accelerated evaporation.", [{ title: "Dead Sea", text: "Diversion of the Jordan." }]), ["potash", "extraction", "accelerat", "evapor"]);
});

test("a supported, correct finding passes the resolution checks", () => {
  const grade = gradeCase(caseFrom("resolved-correct-and-supported", { action_in: ["resolved"], valid: true, evidence_valid: true, finding_supported: true, finding_mentions: ["Jordan River|National Water Carrier"], finding_avoids: ["Aral"] }), fixtures["resolved-correct-and-supported"].raw);
  assert.equal(grade.pass, true, formatGrades([grade]));
  assert.equal(grade.action, "resolved");
});

test("a finding about the wrong lake fails finding_avoids and finding_supported but is otherwise valid", () => {
  const grade = gradeCase(caseFrom("resolved-aral-sea-cited-to-dead-sea", { valid: true, evidence_valid: true, finding_supported: true, finding_avoids: ["Aral"] }), fixtures["resolved-aral-sea-cited-to-dead-sea"].raw);
  assert.deepEqual(verdicts(grade), { valid: true, evidence_valid: true, finding_supported: false, finding_avoids: false });
  assert.equal(grade.pass, false);
});

test("a correct finding citing a lead that does not contain it fails finding_supported and finding_grounded: invented, not mis-cited", () => {
  const grade = gradeCase(caseFrom("resolved-correct-but-unsupported", { valid: true, finding_supported: true, finding_grounded: true, finding_mentions: ["Jordan"] }), fixtures["resolved-correct-but-unsupported"].raw);
  assert.deepEqual(verdicts(grade), { valid: true, finding_supported: false, finding_grounded: false, finding_mentions: true });
  assert.match(grade.checks[1].detail, /in no excerpt/);
});

test("a finding whose substance is in a shown but uncited excerpt fails finding_supported as mis-cited and passes finding_grounded", () => {
  const context = { question: "Why is the Dead Sea shrinking?", children: [], evidence: [
    { id: "e1", label: "1", title: "Dead Sea", text: "The Dead Sea is a landlocked salt lake bordered by Jordan.", kind: "wiki" },
    { id: "e2", label: "2", title: "Dead Sea § Receding shoreline", text: "The Dead Sea has been rapidly shrinking since the 1960s because of diversion of incoming water from the Jordan River as part of the National Water Carrier scheme, completed in 1964.", kind: "wiki" },
  ], lookupsRemaining: 0, questionsAllowed: 3 };
  const spec = { id: "miscited", kind: "action", context, expect: { finding_supported: true, finding_grounded: true } };
  const grade = gradeCase(spec, '{"action":"resolved","finding":"The Dead Sea is shrinking because incoming water was diverted from the Jordan River under the National Water Carrier scheme completed in 1964.","evidence":["1"]}');
  assert.deepEqual(verdicts(grade), { finding_supported: false, finding_grounded: true });
  assert.match(grade.checks[0].detail, /mis-cited/);
  assert.equal(gradeCase(spec, '{"action":"resolved","finding":"The Dead Sea is shrinking because incoming water was diverted from the Jordan River under the National Water Carrier scheme completed in 1964.","evidence":["2"]}').pass, true);
});

test("labels beyond those shown fail evidence_valid and valid", () => {
  const grade = gradeCase(caseFrom("resolved-citing-labels-not-shown", { evidence_valid: true, valid: true }), fixtures["resolved-citing-labels-not-shown"].raw);
  assert.deepEqual(verdicts(grade), { evidence_valid: false, valid: false });
  assert.match(grade.checks[0].detail, /cites 2, 3 of 1 shown/);
});

test("a wiki at the lookup ceiling fails action_in; a repeated bare title fails query_new; a section query passes query_reads_section", () => {
  const ceiling = gradeCase(caseFrom("wiki-at-lookup-ceiling", { action_in: ["decompose", "resolved", "blocked"], questions_differ: true }), fixtures["wiki-at-lookup-ceiling"].raw);
  assert.deepEqual(verdicts(ceiling), { action_in: false, questions_differ: true });
  const context = { question: "Why is the Dead Sea shrinking?", children: [], evidence: [{ id: "e1", label: "1", title: "Dead Sea", text: "A salt lake.", kind: "wiki", sections: ["Geography", "Receding shoreline"] }], lookupsRemaining: 1, questionsAllowed: 3 };
  const spec = { id: "repeat", kind: "action", context, expect: { query_new: true, query_reads_section: true, query_short: true } };
  const repeat = gradeCase(spec, '{"action":"wiki","query":"Dead Sea"}');
  assert.deepEqual(verdicts(repeat), { query_new: false, query_reads_section: false, query_short: true });
  const section = gradeCase(spec, '{"action":"wiki","query":"Dead Sea / Receding shoreline"}');
  assert.equal(section.pass, true, formatGrades([section]));
  const unlisted = gradeCase(spec, '{"action":"wiki","query":"Dead Sea / Salinity"}');
  assert.equal(verdicts(unlisted).query_reads_section, false);
  const whole = gradeCase(spec, '{"action":"wiki","query":"Why is the Dead Sea shrinking?"}');
  assert.equal(verdicts(whole).query_short, false);
});

test("decompose checks: three questions in one child fails questions_one_each; a child equal to the question fails questions_differ", () => {
  const multi = gradeCase(caseFrom("decompose-three-questions-in-one-string", { questions_one_each: true, questions_differ: true, valid: true }), fixtures["decompose-three-questions-in-one-string"].raw);
  assert.deepEqual(verdicts(multi), { questions_one_each: false, questions_differ: true, valid: false });
  const context = { question: "Why is the Dead Sea shrinking?", children: [], evidence: [], lookupsRemaining: 2, questionsAllowed: 3 };
  const same = gradeCase({ id: "same", kind: "action", context, expect: { questions_differ: true } }, '{"action":"decompose","questions":["Why is the Dead Sea shrinking?","What feeds it?"]}');
  assert.equal(same.pass, false);
  assert.match(same.checks[0].detail, /repeats the question/);
});

test("questions written into reason: the output parses but fails action checks and the validator", () => {
  const grade = gradeCase(caseFrom("decompose-with-questions-in-reason", { valid: true, questions_one_each: true, finding_supported: true }), fixtures["decompose-with-questions-in-reason"].raw);
  assert.deepEqual(verdicts(grade), { valid: false, questions_one_each: false, finding_supported: true }, "checks for another action are vacuous");
});

test("output that does not parse fails every check and records the error", () => {
  const grade = gradeCase(caseFrom("resolved-runs-to-token-cap-in-whitespace", { action_in: ["resolved"], valid: true, finding_supported: true }), fixtures["resolved-runs-to-token-cap-in-whitespace"].raw);
  assert.equal(grade.pass, false);
  assert.ok(grade.error);
  assert.ok(grade.checks.every((check) => !check.pass));
});

test("section cases: section_in compares headings case-insensitively", () => {
  const spec = { id: "pick", kind: "section", class: "section pick", context: { question: "Why is the Dead Sea shrinking?", article: "Dead Sea", sections: ["Geography", "Receding shoreline", "Extraction"] }, expect: { section_in: ["Receding shoreline"] } };
  assert.equal(gradeCase(spec, '<think>\n\n</think>\n\n{"section": "receding shoreline"}').pass, true);
  const wrong = gradeCase(spec, '{"section": "Extraction"}');
  assert.equal(wrong.pass, false);
  assert.equal(wrong.action, "Extraction");
});

test("an unknown check fails loudly rather than passing silently", () => {
  const grade = gradeCase({ id: "x", kind: "action", context: { question: "Q?", children: [], evidence: [] }, expect: { no_such_check: true } }, '{"action":"blocked","reason":"none"}');
  assert.deepEqual(grade.checks, [{ name: "no_such_check", pass: false, detail: "unknown check" }]);
  assert.ok(Object.keys(CHECKS).length >= 12);
});

test("summariseGrades and formatGrades roll cases up by class", () => {
  const grades = [
    { id: "a", class: "repeat", pass: true, action: "wiki", checks: [] },
    { id: "b", class: "repeat", pass: false, action: "wiki", checks: [{ name: "query_new", pass: false, detail: "Dead Sea" }] },
    { id: "c", class: "support", pass: true, action: "resolved", checks: [] },
  ];
  assert.deepEqual(summariseGrades(grades), { cases: 3, passed: 2, rate: 2 / 3, byClass: { repeat: { cases: 2, passed: 1 }, support: { cases: 1, passed: 1 } } });
  const text = formatGrades(grades);
  assert.match(text, /FAIL b \[repeat\] → wiki · query_new: Dead Sea/);
  assert.match(text, /2\/3 passed \(67%\)/);
});

test("gradeRun scores a recorded run against a seed rubric: present, supported, read, distractors", () => {
  const seed = { id: "dead-sea", seed: "Why is the Dead Sea shrinking?", facts: { "jordan-diversion": "Jordan River|National Water Carrier|diversion|diverted", "mineral-extraction": "Dead Sea Works|potash|evaporation pond|Arab Potash|mineral", rate: "per year|a year|annually" }, distractors: ["Aral"] };
  const grounded = JSON.parse(readFileSync(new URL("../experiments/2026-09-17-qwen3-8b-dead-sea-2.json", import.meta.url), "utf8"));
  const grade = gradeRun(seed, grounded);
  assert.equal(grade.resolved, true);
  assert.deepEqual(grade.facts["jordan-diversion"], { present: true, supported: true, read: true });
  assert.equal(grade.factsPresent >= 1 && grade.factsPresent <= 3, true);
  assert.equal(grade.factsSupported <= grade.factsPresent, true);
  assert.deepEqual(grade.distractors, []);
  assert.equal(grade.cost.nodes, grounded.nodes.length);
  assert.match(formatRunGrade(grade), /^dead-sea: resolved · facts \d\/3 · supported \d\/3 · read \d\/3 · 1 nodes/);

  const wrongLake = JSON.parse(readFileSync(new URL("../experiments/2026-09-17-qwen3-0.6b-dead-sea.json", import.meta.url), "utf8"));
  const bad = gradeRun(seed, wrongLake);
  assert.equal(bad.resolved, true);
  assert.deepEqual(bad.distractors, ["n1"]);
  assert.match(formatRunGrade(bad), /distractor in n1/);

  const frozen = JSON.parse(readFileSync(new URL("../experiments/2026-09-17-qwen3-1.7b-dead-sea-5.json", import.meta.url), "utf8"));
  const waiting = gradeRun(seed, frozen);
  assert.equal(waiting.resolved, false);
  assert.equal(waiting.factsPresent, 0, "an unresolved root states nothing");
  assert.equal(waiting.facts["jordan-diversion"].read, true, "but the run did read the fact");
});
