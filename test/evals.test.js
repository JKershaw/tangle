// The micro-eval cases are data the runner trusts: every case must name known
// checks, carry a usable context, and grade its own recorded output without
// throwing. Grading the recorded outputs is also the scoreboard's first row:
// what the models did at the time, under the prompts of the time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHECKS, gradeCase, summariseGrades } from "../scripts/grade.js";

const suite = JSON.parse(readFileSync(new URL("../evals/visits.json", import.meta.url), "utf8"));

test("every case is well formed", () => {
  const ids = new Set();
  for (const entry of suite.cases) {
    assert.ok(entry.id && !ids.has(entry.id), `duplicate or missing id: ${entry.id}`);
    ids.add(entry.id);
    assert.ok(["action", "section"].includes(entry.kind), `${entry.id}: kind`);
    assert.ok(entry.class, `${entry.id}: class`);
    assert.ok(entry.from?.run && entry.from?.seq, `${entry.id}: provenance`);
    assert.ok(Object.keys(entry.expect).length > 0, `${entry.id}: no checks`);
    for (const name of Object.keys(entry.expect)) assert.ok(name in CHECKS, `${entry.id}: unknown check ${name}`);
    if (entry.kind === "action") {
      assert.ok(entry.context.question, `${entry.id}: question`);
      assert.ok(Array.isArray(entry.context.evidence), `${entry.id}: evidence`);
      assert.ok(!("section_in" in entry.expect), `${entry.id}: section_in on an action case`);
    } else {
      assert.ok(entry.context.question && entry.context.article && entry.context.sections?.length, `${entry.id}: section context`);
    }
  }
});

test("every recorded output grades without throwing, and the recorded score is what the notes said", () => {
  const grades = suite.cases.filter((entry) => entry.recorded).map((entry) => gradeCase(entry, entry.recorded));
  assert.equal(grades.length, suite.cases.length, "every case has a recorded output");
  const total = summariseGrades(grades);
  // The recorded outputs are the failures we collected plus the few good
  // cases, so most fail. If this number moves, a grader changed meaning.
  assert.ok(total.passed >= 5 && total.passed <= 12, `recorded outputs pass ${total.passed}/${total.cases}`);
  for (const grade of grades) assert.ok(grade.checks.every((check) => typeof check.pass === "boolean"), grade.id);
});
