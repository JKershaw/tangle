// The graders are pinned with recorded runs: if a grader changes, the
// scoreboard changes meaning, so these are strict.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatProfile, formatRunGrade, gradeRun, profileOf } from "../scripts/grade.js";
import { mentions, missingWords, normalise } from "../scripts/text.js";


test("text helpers: normalise, mentions with alternatives, missing words with stemming", () => {
  assert.equal(normalise("  Why is the Dead Sea shrinking?  "), "why is the dead sea shrinking");
  assert.equal(mentions("diversion of the Jordan River", "Jordan River|National Water Carrier"), true);
  assert.equal(mentions("the Aral Sea dried", "Jordan River|National Water Carrier"), false);
  assert.deepEqual(missingWords("The shoreline receded because of diversion.", [{ title: "Dead Sea", text: "Diversion of the Jordan; the shoreline recedes." }]), []);
  assert.deepEqual(missingWords("Potash extraction accelerated evaporation.", [{ title: "Dead Sea", text: "Diversion of the Jordan." }]), ["potash", "extraction", "accelerat", "evapor"]);
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

test("profileOf measures a brief's answer: paragraphs, sentences, what was read, and which hops the root cites", () => {
  // A scripted profile: the root kept two lead sentences, one child read a
  // section and hopped to another article and cited both, the other child
  // hopped and cited only its section, and a third child blocked.
  const run = {
    nodes: [
      { id: "n1", status: "resolved", finding: "Ada Lovelace wrote the first program for a machine. She worked with Charles Babbage on the Analytical Engine.\n\nThe Analytical Engine was a proposed mechanical general-purpose computer. Babbage never finished building it.\n\nShe worked with Charles Babbage on the Analytical Engine.", evidence: ["e1", "e2", "e3", "e4"] },
      { id: "n2", status: "resolved", finding: "…", evidence: ["e2", "e3"], readFirst: { article: "Ada Lovelace", section: "Work" } },
      { id: "n3", status: "resolved", finding: "…", evidence: ["e4"], readFirst: { article: "Ada Lovelace", section: "Legacy" } },
      { id: "n4", status: "blocked", evidence: [], readFirst: { article: "Ada Lovelace", section: "Death" } },
    ],
    evidence: [
      { id: "e1", node: "n1", article: "Ada Lovelace", title: "Ada Lovelace", text: "…" },
      { id: "e2", node: "n2", article: "Ada Lovelace", title: "Ada Lovelace § Work", text: "…" },
      { id: "e3", node: "n2", article: "Analytical Engine", title: "Analytical Engine", text: "…" },
      { id: "e4", node: "n3", article: "Ada Lovelace", title: "Ada Lovelace § Legacy", text: "…" },
      { id: "e5", node: "n3", article: "Charles Babbage", title: "Charles Babbage", text: "…" },
      { id: "e6", node: "n4", article: "Ada Lovelace", title: "Ada Lovelace § Death", text: "…" },
    ],
    trace: [{ event: "hop_chosen", node: "n2", search: "Analytical Engine", known: false }, { event: "hop_chosen", node: "n3", search: "Charles Babbage", known: false }, { event: "hop_chosen", node: "n4", search: "Ada Lovelace", known: true }],
  };
  const profile = profileOf(run);
  assert.deepEqual(profile, { paragraphs: 3, sentences: 5, chars: run.nodes[0].finding.length, duplicates: 1, articles: 3, sections: 6, hopsChosen: 3, hopsRead: 2, hopsCited: 1, blocked: 1 });
  assert.equal(formatProfile(profile), "¶3 · 5 sentences (1 repeated) · read 3 articles, 6 sections · hops 1 cited / 2 read / 3 chosen · 1 blocked");
  // A brief's row shows topics and the profile; a question's row does not.
  const seed = { id: "lovelace", seed: "Tell me about Ada Lovelace.", kind: "brief", facts: { babbage: "Babbage", engine: "Analytical Engine", poetry: "Byron|poet" } };
  const grade = gradeRun(seed, { ...run, visits: 4, modelCalls: 12, lookups: 6, tokens: 900 });
  assert.equal(grade.kind, "brief");
  assert.equal(grade.factsPresent, 2);
  assert.match(formatRunGrade(grade), /^lovelace: resolved · topics 2\/3 · supported 1\/3 · read 2\/3 · ¶3 · 5 sentences \(1 repeated\)/);
  assert.doesNotMatch(formatRunGrade(gradeRun({ ...seed, kind: undefined }, { ...run, visits: 4, modelCalls: 12, lookups: 6, tokens: 900 })), /¶/);
  // An unresolved root has no profile to measure.
  assert.equal(profileOf({ ...run, nodes: [{ ...run.nodes[0], status: "waiting" }, ...run.nodes.slice(1)] }).paragraphs, 0);
});

test("profileOf on a real profile: the 8B Turing run at walk-10 cited four of its five hops", () => {
  const turing = JSON.parse(readFileSync(new URL("../experiments/2026-09-18-qwen3-8b-turing-walk-10b.json", import.meta.url), "utf8"));
  const profile = profileOf(turing);
  assert.equal(profile.paragraphs, 6);
  assert.equal(profile.articles, 5, "Alan Turing and four hop articles");
  assert.deepEqual([profile.hopsChosen, profile.hopsRead, profile.hopsCited, profile.blocked], [5, 4, 4, 1]);
  assert.equal(profile.duplicates, 0);
  const seeds = JSON.parse(readFileSync(new URL("../evals/seeds-profile.json", import.meta.url), "utf8")).seeds;
  const grade = gradeRun(seeds.find((seed) => seed.id === "turing"), turing);
  assert.equal(grade.factsSupported, grade.factsPresent, "a profile is verbatim sentences, so every topic present is supported");
  assert.equal(grade.factsPresent >= 5, true, formatRunGrade(grade));
});

test("the profile seeds are well formed: briefs, not questions, with topics checked against the article", () => {
  const file = JSON.parse(readFileSync(new URL("../evals/seeds-profile.json", import.meta.url), "utf8"));
  for (const seed of file.seeds) {
    assert.equal(seed.kind, "brief", seed.id);
    assert.doesNotMatch(seed.seed, /\?/, `${seed.id} is a brief`);
    assert.equal(typeof seed.article, "string");
    assert.equal(Object.keys(seed.facts).length >= 8, true, seed.id);
    assert.match(seed.where, new RegExp(seed.article.split(" ")[0]));
  }
});
