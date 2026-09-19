// Graders for the benchmark (PLAN.md). Deterministic, no model, no network:
// given a seed's rubric and a run's export, say which facts the root states,
// which its cited evidence holds, and which anything read held; and measure
// the shape of a brief's profile. The one-prompt visit's graders (CHECKS,
// gradeCase) retired with the visits suite on 2026-09-19 (REVIEW.md).
import { unitsOf } from "../src/asks.js";
import { mentions, normalise } from "./text.js";

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
  const sentences = finding.split(/\n\s*\n/).flatMap((paragraph) => unitsOf(paragraph));
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
