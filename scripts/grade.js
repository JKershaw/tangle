// Graders for the evals (see PLAN.md). Deterministic, no model, no network:
// given a recorded situation and a raw model output, say which named checks
// pass. The runner (scripts/eval.mjs) feeds these live outputs; the test suite
// feeds them recorded fixtures so the graders themselves are pinned.
import { captureEvidence, createRun, parseModelOutput, validateResult } from "../src/graph.js";
import { responseSchema } from "../src/webllm.js";
import { splitSentences } from "../src/asks.js";
import { mentions, missingWords, normalise } from "./text.js";

export const ABSENT_WORDS_THRESHOLD = 4;

// Rebuild the node's situation from a recorded context: its excerpts (so
// labels map to IDs) and the ceilings it faced. The grammar is the one live
// mode would build for this context today.
export function reconstruct(context, question = context.question, limits = {}) {
  const run = createRun(question, "live", limits);
  for (const excerpt of context.evidence ?? []) {
    captureEvidence(run, "n1", { kind: excerpt.kind ?? "wiki", title: excerpt.title, text: excerpt.text || excerpt.title, ...(excerpt.sections ? { headings: excerpt.sections } : {}) });
  }
  const ids = run.evidence.map((record) => record.id);
  const labels = Object.fromEntries(ids.map((id, index) => [String(index + 1), id]));
  const grammar = responseSchema(ids, context.questionsAllowed ?? 3, context.lookupsRemaining ?? null);
  return { run, node: run.nodes[0], ids, labels, grammar };
}

// Parse a raw output and map cited labels back to evidence IDs. Never throws.
export function interpret(raw, labels) {
  try {
    const parsed = parseModelOutput(raw);
    const result = Array.isArray(parsed.evidence) ? { ...parsed, evidence: parsed.evidence.map((label) => labels[label] ?? label) } : parsed;
    return { parsed, result, error: null };
  } catch (error) {
    return { parsed: null, result: null, error: String(error?.message || error) };
  }
}

const words = (text) => normalise(text).split(" ").filter(Boolean);
// Checks that only make sense for one action are vacuous for the others; a
// case that needs a particular action says so with action_in. Output that did
// not parse fails everything.
const NOT_APPLICABLE = (parsed, kind) => (parsed ? { pass: true, detail: `not a ${kind}` } : { pass: false, detail: "no parsable output" });
const SECTION_SEPARATOR = /\s(?:\/|§)\s/;

// Each check receives the graded situation and its argument from the case's
// `expect`, and returns { pass, detail }. Keep them small and literal: a
// reader should be able to predict the verdict from the name.
export const CHECKS = {
  action_in: ({ parsed }, allowed) => ({ pass: !!parsed && allowed.includes(parsed.action), detail: parsed?.action ?? "no action" }),
  valid: ({ situation, result, error }) => {
    if (error) return { pass: false, detail: error };
    try {
      validateResult(situation.run, situation.node, result, situation.ids);
      return { pass: true, detail: "accepted by the validator" };
    } catch (failure) {
      return { pass: false, detail: failure.message };
    }
  },
  query_not: ({ parsed }, forbidden) => {
    const query = normalise(parsed?.query);
    const hit = forbidden.find((entry) => normalise(entry) === query);
    return parsed?.action !== "wiki" ? NOT_APPLICABLE(parsed, "lookup") : { pass: !hit, detail: parsed.query };
  },
  // Not a bare title already in evidence, not a query that already found nothing.
  query_new: ({ parsed, context }) => {
    if (parsed?.action !== "wiki") return NOT_APPLICABLE(parsed, "lookup");
    const query = normalise(parsed.query);
    const seen = [...(context.evidence ?? []).map((excerpt) => excerpt.title), ...(context.failedLookups ?? []).map((entry) => entry.query)].map(normalise);
    return { pass: !seen.includes(query), detail: parsed.query };
  },
  // A topic, not the question: at most six words, no question mark, not the question itself.
  query_short: ({ parsed, context }) => {
    if (parsed?.action !== "wiki") return NOT_APPLICABLE(parsed, "lookup");
    const query = String(parsed.query);
    const pass = words(query).length <= 6 && !query.includes("?") && normalise(query) !== normalise(context.question);
    return { pass, detail: query };
  },
  query_mentions: ({ parsed }, wanted) => {
    if (parsed?.action !== "wiki") return NOT_APPLICABLE(parsed, "lookup");
    const missing = wanted.filter((entry) => !mentions(parsed.query, entry));
    return { pass: missing.length === 0, detail: missing.length ? `query lacks ${missing.join("; ")}: ${parsed.query}` : parsed.query };
  },
  // "Title / Section" where the section is one the context listed.
  query_reads_section: ({ parsed, context }) => {
    if (parsed?.action !== "wiki") return NOT_APPLICABLE(parsed, "lookup");
    const query = String(parsed.query);
    const [, heading] = query.split(SECTION_SEPARATOR);
    if (!heading) return { pass: false, detail: `bare query: ${query}` };
    const listed = (context.evidence ?? []).flatMap((excerpt) => excerpt.sections ?? []);
    const known = listed.length === 0 || listed.some((section) => normalise(section).includes(normalise(heading)) || normalise(heading).includes(normalise(section)));
    return { pass: known, detail: known ? query : `section not listed: ${heading}` };
  },
  questions_differ: ({ parsed, context }) => {
    if (parsed?.action !== "decompose") return NOT_APPLICABLE(parsed, "decompose");
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) return { pass: false, detail: "no questions" };
    const question = normalise(context.question);
    const repeats = (parsed.questions ?? []).filter((child) => normalise(child) === question);
    return { pass: repeats.length === 0, detail: repeats.length ? `repeats the question: ${repeats[0]}` : `${parsed.questions.length} questions` };
  },
  questions_one_each: ({ parsed }) => {
    if (parsed?.action !== "decompose") return NOT_APPLICABLE(parsed, "decompose");
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) return { pass: false, detail: "no questions" };
    const multi = (parsed.questions ?? []).find((child) => (String(child).match(/\?/g) || []).length > 1);
    return { pass: !multi, detail: multi ?? "one question per child" };
  },
  evidence_valid: ({ parsed, situation }) => {
    if (parsed?.action !== "resolved") return NOT_APPLICABLE(parsed, "resolution");
    const shown = Object.keys(situation.labels);
    const bad = (parsed.evidence ?? []).filter((label) => !shown.includes(String(label)));
    return { pass: bad.length === 0 && (parsed.evidence ?? []).length > 0, detail: bad.length ? `cites ${bad.join(", ")} of ${shown.length} shown` : `cites ${(parsed.evidence ?? []).join(", ")}` };
  },
  // Against the excerpts the finding cites. When the words are in an excerpt
  // that was shown but not cited, the detail says so: that is a citation
  // error, not an invention, and the two need different fixes.
  finding_supported: ({ parsed, situation }) => {
    if (parsed?.action !== "resolved") return NOT_APPLICABLE(parsed, "resolution");
    const cited = (parsed.evidence ?? []).map((label) => situation.run.evidence.find((record) => record.id === situation.labels[label])).filter(Boolean);
    const missing = missingWords(parsed.finding, cited);
    if (missing.length < ABSENT_WORDS_THRESHOLD) return { pass: true, detail: "every content word is in a cited excerpt" };
    const uncited = missingWords(parsed.finding, situation.run.evidence);
    const where = uncited.length < ABSENT_WORDS_THRESHOLD ? "; in an uncited excerpt (mis-cited)" : uncited.length < missing.length ? `; ${uncited.length} in no excerpt` : "; in no excerpt (invented)";
    return { pass: false, detail: `absent from cited: ${missing.slice(0, 6).join(", ")}${where}` };
  },
  // Against every excerpt shown, cited or not: did the substance come from the page at all?
  finding_grounded: ({ parsed, situation }) => {
    if (parsed?.action !== "resolved") return NOT_APPLICABLE(parsed, "resolution");
    const missing = missingWords(parsed.finding, situation.run.evidence);
    return { pass: missing.length < ABSENT_WORDS_THRESHOLD, detail: missing.length ? `in no excerpt: ${missing.slice(0, 6).join(", ")}` : "every content word is in a shown excerpt" };
  },
  finding_mentions: ({ parsed }, wanted) => {
    if (parsed?.action !== "resolved") return NOT_APPLICABLE(parsed, "resolution");
    const missing = wanted.filter((entry) => !mentions(parsed.finding, entry));
    return { pass: missing.length === 0, detail: missing.length ? `missing: ${missing.join("; ")}` : "all present" };
  },
  finding_avoids: ({ parsed }, forbidden) => {
    if (parsed?.action !== "resolved") return NOT_APPLICABLE(parsed, "resolution");
    const hit = forbidden.filter((entry) => mentions(parsed.finding, entry));
    return { pass: hit.length === 0, detail: hit.length ? `mentions: ${hit.join("; ")}` : "clear" };
  },
  section_in: ({ parsed }, allowed) => {
    const section = parsed?.section;
    return { pass: allowed.some((entry) => normalise(entry) === normalise(section)), detail: section ?? "no section" };
  },
};

// Grade one raw output against a case: { id, kind, context, expect }.
export function gradeCase(spec, raw) {
  const context = spec.context;
  const situation = spec.kind === "section" ? null : reconstruct(context, context.question, spec.limits ?? {});
  const { parsed, result, error } = spec.kind === "section" ? interpretPlain(raw) : interpret(raw, situation.labels);
  const graded = { situation, context, parsed, result, error };
  const checks = Object.entries(spec.expect ?? {}).map(([name, argument]) => {
    const check = CHECKS[name];
    if (!check) return { name, pass: false, detail: "unknown check" };
    try {
      return { name, ...check(graded, argument) };
    } catch (failure) {
      return { name, pass: false, detail: String(failure?.message || failure) };
    }
  });
  return { id: spec.id, kind: spec.kind ?? "action", class: spec.class ?? null, pass: checks.every((check) => check.pass), action: parsed?.action ?? parsed?.section ?? null, error, checks };
}

function interpretPlain(raw) {
  try {
    return { parsed: parseModelOutput(raw), result: null, error: null };
  } catch (error) {
    return { parsed: null, result: null, error: String(error?.message || error) };
  }
}

// Roll a list of graded cases into the numbers the scoreboard shows.
export function summariseGrades(grades) {
  const byClass = {};
  for (const grade of grades) {
    const key = grade.class ?? "unclassified";
    byClass[key] ??= { cases: 0, passed: 0 };
    byClass[key].cases++;
    if (grade.pass) byClass[key].passed++;
  }
  const passed = grades.filter((grade) => grade.pass).length;
  return { cases: grades.length, passed, rate: grades.length ? passed / grades.length : 0, byClass };
}

export function formatGrades(grades) {
  const lines = [];
  for (const grade of grades) {
    const failed = grade.checks.filter((check) => !check.pass);
    lines.push(`${grade.pass ? "pass" : "FAIL"} ${grade.id} [${grade.class ?? "-"}] → ${grade.action ?? grade.error ?? "?"}${failed.length ? " · " + failed.map((check) => `${check.name}: ${check.detail}`).join(" · ") : ""}`);
  }
  const total = summariseGrades(grades);
  lines.push(`${total.passed}/${total.cases} passed (${Math.round(total.rate * 100)}%)`);
  for (const [name, entry] of Object.entries(total.byClass)) lines.push(`  ${name}: ${entry.passed}/${entry.cases}`);
  return lines.join("\n");
}

// ---- whole runs ----
// A benchmark seed: the question, the facts a correct answer contains (each a
// pipe-separated set of interchangeable keywords), and distractors that mean
// the model answered about something else. gradeRun says, per fact, whether
// the root finding states it, whether an excerpt the root cites contains it,
// and whether any excerpt in the run contains it at all (read but unsaid).
export const FLAT_LIMITS = Object.freeze({ maxNodes: 1, maxVisits: 3, maxDepth: 0, maxLookups: 6, maxPasses: 8 });

// The shape of a profile (a brief's answer): how much was written, how much
// was read to write it, and whether the hops to other articles ended up in
// it. Counted for every run; only a brief's row shows it. hopsChosen is how
// often a child named somewhere to hop, hopsRead how many of those articles
// were captured, hopsCited how many the root's finding rests on.
export function profileOf(run) {
  const root = run.nodes[0];
  const finding = root.status === "resolved" ? String(root.finding ?? "") : "";
  const paragraphs = finding.split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).length;
  const sentences = splitSentences(finding);
  const seen = new Set();
  let duplicates = 0;
  for (const sentence of sentences) {
    const key = normalise(sentence);
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }
  const byId = new Map(run.nodes.map((node) => [node.id, node]));
  const hopRecords = run.evidence.filter((record) => {
    const node = byId.get(record.node);
    return Boolean(node?.hopTo) || (node?.readFirst && record.article !== node.readFirst.article);
  });
  const cited = new Set(root.evidence ?? []);
  return {
    paragraphs,
    sentences: sentences.length,
    chars: finding.length,
    duplicates,
    articles: new Set(run.evidence.map((record) => record.article ?? record.title)).size,
    sections: new Set(run.evidence.map((record) => record.title)).size,
    // walk-10 traced one hop_chosen per child's free-text hop; walk-11 traces
    // hops_chosen with the names offered and chosen.
    hopsChosen: (run.trace ?? []).reduce((total, event) => total + (event.event === "hop_chosen" ? 1 : event.event === "hops_chosen" ? (event.chosen ?? []).length : 0), 0),
    hopsRead: hopRecords.length,
    hopsCited: hopRecords.filter((record) => cited.has(record.id)).length,
    blocked: run.nodes.filter((node) => node.status === "blocked").length,
  };
}

export const formatProfile = (profile) => `¶${profile.paragraphs} · ${profile.sentences} sentences${profile.duplicates ? ` (${profile.duplicates} repeated)` : ""} · read ${profile.articles} articles, ${profile.sections} sections · hops ${profile.hopsCited} cited / ${profile.hopsRead} read / ${profile.hopsChosen} chosen${profile.blocked ? ` · ${profile.blocked} blocked` : ""}`;

export function gradeRun(seed, run) {
  const root = run.nodes[0];
  const cited = (root.evidence ?? []).map((id) => run.evidence.find((record) => record.id === id)).filter(Boolean);
  const excerptText = (record) => `${record.title ?? ""} ${record.text ?? ""}`;
  const facts = {};
  for (const [name, alternatives] of Object.entries(seed.facts)) {
    facts[name] = {
      present: root.status === "resolved" && mentions(root.finding, alternatives),
      supported: root.status === "resolved" && mentions(root.finding, alternatives) && cited.some((record) => mentions(excerptText(record), alternatives)),
      read: run.evidence.some((record) => mentions(excerptText(record), alternatives)),
    };
  }
  const count = (key) => Object.values(facts).filter((fact) => fact[key]).length;
  const distractors = run.nodes.filter((node) => node.finding && (seed.distractors ?? []).some((entry) => mentions(node.finding, entry))).map((node) => node.id);
  const statuses = {};
  for (const node of run.nodes) statuses[node.status] = (statuses[node.status] || 0) + 1;
  return {
    id: seed.id,
    kind: seed.kind ?? null,
    resolved: root.status === "resolved",
    outcome: root.status === "resolved" ? "root resolved" : run.stopReason || `root ${root.status}`,
    facts,
    factsTotal: Object.keys(facts).length,
    factsPresent: count("present"),
    factsSupported: count("supported"),
    factsRead: count("read"),
    distractors,
    cost: { nodes: run.nodes.length, visits: run.visits, modelCalls: run.modelCalls, lookups: run.lookups, tokens: run.tokens },
    statuses,
    finding: root.finding || null,
    profile: profileOf(run),
  };
}

export const formatRunGrade = (grade) =>
  `${grade.id}: ${grade.resolved ? "resolved" : grade.outcome} · ${grade.kind === "brief" ? "topics" : "facts"} ${grade.factsPresent}/${grade.factsTotal} · supported ${grade.factsSupported}/${grade.factsTotal} · read ${grade.factsRead}/${grade.factsTotal}${grade.distractors.length ? ` · distractor in ${grade.distractors.join(", ")}` : ""}${grade.kind === "brief" && grade.profile ? ` · ${formatProfile(grade.profile)}` : ""} · ${grade.cost.nodes} nodes, ${grade.cost.modelCalls} calls, ${grade.cost.lookups} lookups, ${grade.cost.tokens} tokens`;
