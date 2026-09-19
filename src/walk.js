// The walk: one visit as a fixed sequence of asks, sequenced by code.
//
// The model never chooses an action. It only picks from things the harness
// prepared — which numbered sentence answers the question, which section
// heading to read — and names one short thing (what to look up next, or one
// smaller question) when there is nothing to pick from. A finding is the
// chosen sentence, verbatim, cited to the excerpt it came from; the harness
// never asks the model to compose one. Everything else — the first lookup,
// what counts as a repeat, when to read on, when to hand down a question,
// when a parent's answer is the sum of its children — is code, and bounded
// by the run's limits. See PLAN.md, "The turn", and src/asks.js.
//
// runEpisode (episode.js) is the earlier one-prompt visit, kept so the two can
// be compared on the same seeds. Both persist outcomes through applyResult.

import { ASKS, ASK_VERSION, parseJson, splitSentences, unitsOf } from "./asks.js";
import { applyResult, captureEvidence, children, nextRunnable, recordFailedLookup, stateOf, trace } from "./graph.js";
import { evidenceOf } from "./source.js";
import { contentWords, isParaphrase, namesSubject } from "./text.js";
import { lineUnits, usesName } from "./files.js";

export const WALK_VERSION = "walk-16"; // walk-16: an action node (ROADMAP 6): a brief's root, once its sections are handed down, may hand down one command from the list code prepared (scripts/actions.mjs), picked by the model; the child runs it in a worktree, the result is evidence, and its finding is the result's last lines; // walk-15: a second source (src/files.js): a file's sentences are its lines, a finding over code reads as lines and a short one brings its neighbours, a hop over code is on subject by construction (a link is a use, named by a use, and may be another declaration of a file already read), a ranked search's first hit is read when the model says none, the corpus's own name and a brief's framing words ("tell me about") are not search terms or subjects, and a brief's root fans out even when its lead gave it nothing to keep; // walk-14: a parent whose children answered resolves with what they found by code, with no pick, for a question as for a split or a brief; a child's finding is no longer offered to the sentence pick, so no "none" over it can be overridden; // walk-13: a hop's sentence names the subject only by the subject's own capitalised words, with their capitals ("Juno mission" and "rosetta orbit" no longer count for the Rosetta mission), and the first search waits for approval like every other request; // walk-12: an over-long profile loses hop paragraphs before it loses sections, and a short section is not handed to a child; a hop child may hand down hops of its own (one level), a reserve keeps room for every open node's hops, and a name is offered only if its article says something about the subject; // walk-11: a hop child reads the part of its article that names the brief's subject, and a brief's root keeps twice the sentences; a brief's child hands the things its kept sentences name (the article's links that occur in them, else capitalised phrases) to children of its own, the model picking which from a list ranked by how often the run has met each; a sentence kept anywhere is never offered again; // walk-10: a hop never re-reads an article any node has read, a brief's children follow the article's order, and the profile drops a sentence it already has; // walk-9: under a brief no model-asked questions (the shape is code's), only the root fans out, a hop's sentences must name the brief's subject, the hop comes before the sentence cap, and a finding's sentences are in source order; walk-8: a brief (no question mark, or "tell me about…") reads the lead, hands one child per section the model chooses, each child may hop to one article named from what it kept, and the root's finding is the profile in order; // walk-7: a question about two named subjects is split by code, one child per subject, and the parent's answer is their findings; after a first answer a node reads on into an unread section while lookups remain; walk-6: search snippets shown with the titles, the sentence check by model size; walk-2: paraphrases refused; walk-3: questions about "the text" refused, up to maxSentences per finding; walk-4: the article is picked from the search hits, judged sentences remembered across visits; walk-5: the first search tries both terms, the pick is checked only when its source is foreign to the question
// Which variant of each ask the walk uses; the node evals choose these
// (evals/node/results.md). Overridable per run for A/B comparison.
// sentence: a pick from the numbered list, then one yes-or-no on the chosen
// sentence alone. The plain pick cannot tell a sentence about the wrong
// subject (every size picked the Aral Sea's reason for a Dead Sea question,
// even labelled); the check catches it from 1.7B up, trading a few false
// "none"s — which cost a lookup — for false findings, which cost the run.
export const DEFAULT_VARIANTS = Object.freeze({ sentence: "list", section: "list", missing: "search", question: "one", article: "snippets", confirm: "yesno", action: "list" });
// Variants by model size. The pick-then-check sentence ask has no false
// negatives at 8B (node evals 23/23; benchmark 12 → 16 facts) but costs 4B
// two facts on the benchmark (16 → 14) and refuses true answers at 1.7B, so
// only 8B and above check every pick; the rest take the plain pick.
export function variantsFor(modelId = "") {
  // "Qwen3-8B-q4f16_1-MLC" in the page; "qwen3:8b", "qwen3:14b-q4_K_M" over
  // an endpoint (endpoint.js). Not "Qwen3-30B-A3B", not "qwen3:1.7b".
  // A provider-prefixed id ("deepseek/deepseek-v3.2", "anthropic/claude-haiku-4.5")
  // is a reference model over an API, and large by construction.
  const big = /(?:^|[-:_/])(8|14|32)b(?=$|[-:_@\s])/i.test(String(modelId)) || /^[a-z0-9-]+\/[^/]+$/i.test(String(modelId));
  return { ...DEFAULT_VARIANTS, ...(big ? { sentence: "check" } : {}) };
}
// A brief rather than a question: "Tell me about Alan Turing and elaborate on
// the impact of his work." There is no answering sentence to find, so the
// asks change wording (asks.js: sentence/brief, section/brief, missing/hop)
// and the walk changes shape: the lead is read, the model chooses the
// sections worth reading (one child each, made by code), each child keeps
// its sentences and may hop once to an article named from them, and the
// root's finding is the kept sentences and the children's findings in order.
export const BRIEF = /^(tell|describe|explain|write|give|summari[sz]e|elaborate|outline|profile|discuss)\b/i;
export const BRIEF_VARIANTS = Object.freeze({ sentence: "brief", section: "brief", missing: "names" });
// Over a file corpus (src/files.js) the same asks serve: wordings that named
// lines, declarations and paths were tried at 1.7B (2026-09-19, four
// combinations on the MangoDB briefs) and none beat the brief's, and one
// halved the graph (evals/readings.md).
// How many named things one hop pick sees.
export const NAMES_SHOWN = 8;
// A section shorter than this is not handed to a child under a brief.
export const SHORT_SECTION = 600;
export function isBrief(question) {
  const text = String(question ?? "").trim();
  const base = text.includes(FOCUS) ? text.slice(0, text.indexOf(FOCUS)) : text;
  return !base.includes("?") || BRIEF.test(base);
}
// How many sentences one pick sees. Beyond this, the walk asks again over the
// next window; a visit's passes bound how far it reads.
export const WINDOW = 12;
export const MIN_FINDING_WORDS = 6;
// How many of a result's last lines an action node keeps as its finding.
export const RESULT_LINES = 6;
// Sentences a node has already judged as not answering, kept across visits
// so a revisit reads on instead of re-showing the same windows (the water
// cycle root, walk-3: four passes over the same lead, twice). In the run's
// state (graph.js), as is everything below, so an export resumes.
const setOn = (array) => ({
  has: (value) => array.includes(value),
  add: (value) => {
    if (!array.includes(value)) array.push(value);
  },
  get size() {
    return array.length;
  },
});
const judgedOf = (run, node) => setOn((stateOf(run).judged[node.id] ??= []));

// The first lookup is code: the question minus its question words. The raw
// question sent to Wikipedia's search found the Aral Sea for "Why is the Dead
// Sea shrinking?" (experiments/2026-09-18-qwen3-1.7b-dead-sea-walk-1); the
// stripped term finds the Dead Sea, and the same rule finds the right article
// for every benchmark seed tried.
const QUESTION_WORDS = new Set("why is are was were the a an does do did how what which who whom when where keep going happen happened happens it its there so much many still tell me us about describe explain elaborate".split(" "));
// Words that only join two subjects; dropped from a split child's search term.
const JOIN_WORDS = new Set("and or both common share shared versus vs have in of do".split(" "));
// A brief names its subject: "Tell me about the Hubble Space Telescope and
// what it has discovered" is about the Hubble Space Telescope, and that is
// the search term. Searching for the whole brief minus its question words
// found Nancy Grace Roman and Edwin Hubble and never the telescope (8B,
// walk-10, evals/results 2026-09-18). The first capitalised phrase that is
// not the brief's opening word.
// Lower-case words that continue a subject ("the Antikythera mechanism",
// "the Rosetta mission") are kept up to the first joining word or mark, so
// the search is not for "Antikythera", the island.
const SUBJECT_STOP = new Set("and or but that which who whom whose what how why when where in on at of for from with by to as into over under since during after before its his her their it he she they is was were are be been has have had does did".split(" "));
// Names that are never a brief's subject: a corpus's own name ("MangoDB" in
// every brief about MangoDB), registered by whoever loads the corpus.
// Words a source says to ignore as a subject (a corpus's own name: every
// MangoDB brief names MangoDB); the walk passes them from its options.
const NO_IGNORE = new Set();
export function briefSubject(question, ignore = NO_IGNORE) {
  const text = String(question ?? "").split(FOCUS)[0];
  for (const match of text.matchAll(NAME_IN_TEXT)) {
    // The brief's first word is its verb ("Describe the Great Barrier Reef").
    const name = (match.index === 0 ? match[1].replace(/^\S+\s+(?:me\s+|us\s+)?(?:about\s+)?(?:the\s+)?/i, "") : match[1]).replace(/^the /i, "").trim();
    if (!name || BRIEF.test(name) || ignore.has(normalise(name)) || ignore.has(normalise(name.split(/\s+/)[0].replace(/['’]s$/, "")))) continue;
    const rest = text.slice(match.index + match[0].length).match(/^((?:\s+[a-z][a-z'’-]*)*)/)?.[1] ?? "";
    const tail = [];
    for (const word of rest.trim().split(/\s+/).filter(Boolean)) {
      if (SUBJECT_STOP.has(word.toLowerCase()) || /[.,;:!?]$/.test(word)) break;
      tail.push(word);
    }
    return [name, ...tail].join(" ");
  }
  return null;
}
export function searchTerm(question, ignore = NO_IGNORE) {
  const { base, focus, others } = focusOf(question);
  if (!focus && isBrief(base)) {
    const subject = briefSubject(base, ignore);
    if (subject) return subject;
  }
  let text = String(base ?? "").replace(/[?.!,;:"“”]/g, "");
  for (const other of others) text = text.replace(other.replace(/[?.!,;:"“”]/g, ""), " ");
  const words = text.split(/\s+/).filter(Boolean);
  const kept = words.filter((word) => !QUESTION_WORDS.has(word.toLowerCase()) && !ignore.has(normalise(word)) && !(focus && JOIN_WORDS.has(word.toLowerCase())));
  return (kept.length ? kept : words).join(" ").trim();
}

// A question about two named things at once — "Why did the Dead Sea and the
// Aral Sea both shrink?", "What do the shrinking of Lake Chad and the Dead Sea
// have in common?" — is two questions, and a node that reads one article
// answers half of it and stops (evals/seeds-graph.json, every size,
// 2026-09-18). Code can see the join, so code splits it: one child per
// subject, the parent's question with "— about <subject>" appended, and the
// parent's answer is its children's findings. The model is not asked.
const NAME = "(?:the |Lake |Mount |Cape )?[A-Z][\\w'’-]+(?:(?: of| the| de| du)? [A-Z][\\w'’-]+)*";
const PAIR = new RegExp(`(${NAME}(?: [a-z]+){0,2})\\s+(?:and|or|versus|vs\\.?)\\s+((?:[a-z]+ ){0,4}${NAME})`);
export const FOCUS = " — about ";
export function splitSubjects(question) {
  const text = String(question ?? "");
  if (text.includes(FOCUS)) return [];
  const match = text.match(PAIR);
  if (!match) return [];
  const subjects = [match[1], match[2]].map((subject) => subject.trim());
  if (subjects.some((subject) => QUESTION_WORDS.has(subject.toLowerCase()) || text.startsWith(subject))) return [];
  return subjects;
}
export function focusOf(question) {
  const text = String(question ?? "");
  const at = text.indexOf(FOCUS);
  if (at < 0) return { base: text, focus: null, others: [] };
  const base = text.slice(0, at);
  const focus = text.slice(at + FOCUS.length).trim();
  return { base, focus, others: splitSubjects(base).filter((subject) => subject !== focus) };
}

const normalise = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// The things a sentence names, by code: capitalised phrases of one to five
// words that are not the brief's subject and do not merely start the
// sentence ("During", "He"). The fallback when an article's links are not
// to be had; a link that occurs in the sentence is the better candidate,
// since it is what the article's editors decided the words refer to.
const NAME_IN_TEXT = new RegExp(`(?:^|[\\s(“"'])(${NAME})`, "g");
const UNWANTED_NAME = /\(disambiguation\)|^(?:January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|British|English|German|French|American|European|Polish|Scottish|Welsh|Irish|Thousands|Section)$/i;
const LEADING_WORD = /^(?:During|After|Before|In|On|At|With|When|While|Since|Following|Under|By|For|From|He|She|It|They|This|That|These|Those|Although|Because|Despite|Throughout|Its|His|Her|Their|Among|Between|Over|Through|Until|Upon|Within|As|An|A|The)\b\s*(?:the\s+)?/;
export function namesIn(sentences, subject = "") {
  const wanted = contentWords(subject);
  const out = [];
  for (const sentence of sentences) {
    for (const match of String(sentence).matchAll(NAME_IN_TEXT)) {
      // A sentence's first word is capitalised whatever it is: "During the
      // Second World War" names the war, "He devised" names nothing.
      const name = (match.index === 0 ? match[1].replace(LEADING_WORD, "") : match[1]).replace(/^the /i, "").trim();
      if (!name) continue;
      const words = name.split(" ");
      if (words.length === 1 && (match.index === 0 || name.length < 4)) continue;
      const have = [...contentWords(name)];
      if (!have.length || have.every((word) => wanted.has(word))) continue;
      if (!out.some((known) => normalise(known) === normalise(name))) out.push(name);
    }
  }
  return out;
}
// Does a title occur in the text, as whole words, ignoring case and any
// disambiguation in parentheses ("Mercury (planet)" occurs as "Mercury")?
// An article's links are all tested against every kept sentence, thousands
// of titles a node: two million Unicode regex tests in the profile suite,
// nine tenths of the walk's own time once the model was replayed. So a
// lower-cased substring check goes first and the regex decides only when
// the title's letters are there at all; the pattern is kept per title.
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const occursPatterns = new Map();
let lastText = null;
let lastLower = "";
export function occurs(title, text) {
  const shown = String(title).replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (shown.length < 3) return false;
  text = String(text);
  if (text !== lastText) {
    lastText = text;
    lastLower = text.toLowerCase();
  }
  if (!lastLower.includes(shown.toLowerCase())) return false;
  let pattern = occursPatterns.get(shown);
  if (!pattern) {
    pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRe(shown)}(?=$|[^\\p{L}\\p{N}])`, "iu");
    occursPatterns.set(shown, pattern);
  }
  return pattern.test(text);
}
// Per run: the links of each article read (null when unavailable), and the
// names any node has already opened a child for.
const frontierOf = (run) => {
  const state = stateOf(run);
  return {
    links: { has: (article) => Object.hasOwn(state.links, article), get: (article) => state.links[article], set: (article, links) => void (state.links[article] = links) },
    opened: setOn(state.opened),
  };
};
// Sentences kept by any node, so a profile never offers one twice.
const keptOf = (run) => setOn(stateOf(run).kept);

// The sentences a node can choose between: the excerpts it has observed,
// newest first. Every candidate carries the evidence it rests on. A child's
// finding is not a candidate: a finding is not evidence, and a parent whose
// children answered resolves with what they found without a pick (below).
// A node's kind is set when the walk creates it and derived, for an export
// from before kinds, from what it carries: a hop child names hopTo, a
// section child names readFirst, a split parent lists its subjects, and a
// brief's root is the root of a brief. Everything else is a question.
export function kindOf(node) {
  return node.kind ?? (node.action ? "action" : node.hopTo ? "hop" : node.readFirst ? "section" : node.split ? "split" : isBrief(node.question) && node.depth === 0 ? "brief" : "question");
}

export function candidates(run, node, ignore = NO_IGNORE) {
  const out = [];
  // Under a brief, a hop's article is about something else (the bombe, chess);
  // only its sentences that name the brief's subject are offered, so a hop to
  // "Chess" cannot fill a Turing profile with chess.
  const base = String(node.question).split(FOCUS)[0];
  const subject = kindOf(node) === "hop" ? (briefSubject(base, ignore) ?? base) : null;
  // A file's lines are on subject by construction: a hop to a declaration
  // comes from a line that used it, and a callee rarely restates its
  // caller's subject.
  const onSubject = (record, text) => subject === null || record.lines || record.node !== node.id || node.readFirst?.article === record.article || namesSubject(text, subject);
  for (const id of [...node.observed].reverse()) {
    const record = run.evidence.find((candidate) => candidate.id === id);
    if (!record) continue;
    // A file's sentences are its lines (files.js); an article's are split.
    const units = record.lines ? lineUnits(record.text) : splitSentences(record.text);
    units.forEach((text, index) => {
      if (onSubject(record, text)) out.push({ text, evidence: [id], from: "excerpt", source: record.title, at: index, ...(record.lines ? { line: true } : {}) });
    });
  }
  return out;
}

// Articles in the node's context whose sections have not all been read, with
// the headings still unread.
export function unreadSections(run, node) {
  const records = node.observed.map((id) => run.evidence.find((record) => record.id === id)).filter(Boolean);
  const out = [];
  for (const lead of records.filter((record) => record.section === 0 && record.headings?.length)) {
    const read = new Set(records.filter((record) => record.article === lead.article && record.section !== 0).map((record) => String(record.title).split(" § ")[1]));
    const headings = lead.headings.filter((heading) => !read.has(heading));
    if (headings.length) out.push({ article: lead.article, headings });
  }
  return out;
}

// A child question about the sentences it was shown rather than the world
// ("What is the name of the weapon described in the text?", 1.7B under
// "Why did the Aral Sea shrink?", evals/results/runs 2026-09-18) sends the
// graph away from its seed and never comes back.
export const ABOUT_THE_TEXT = /\b(the|these|those|this|given|above|provided)\s+(text|sentences?|passage|excerpts?|context)\b|\b(mentioned|described|highlighted|listed|stated)\s+(in|above|here)\b/i;

// A question is a repeat if it is any ancestor's or sibling's question again,
// verbatim or as a paraphrase that keeps every content word.
// An article whose title shares no content word with the question.
export function isForeign(title, question) {
  const wanted = contentWords(question);
  const have = contentWords(String(title).split(" § ")[0]);
  return ![...have].some((word) => wanted.has(word));
}

export function isRepeat(run, node, question) {
  const wanted = normalise(question);
  if (!wanted) return true;
  for (let current = node; current; current = run.nodes.find((candidate) => candidate.id === current.parent)) {
    if (normalise(current.question) === wanted || isParaphrase(question, current.question)) return true;
  }
  return children(run, node.id).some((child) => normalise(child.question) === wanted || isParaphrase(question, child.question));
}

export async function runWalk(run, options) {
  const { signal, onUpdate = () => {}, ask, wiki, actions = null, approve = async () => true, pace = null, variants: chosen = {}, source = "wiki", ignore: ignored = [] } = options;
  const ignore = new Set(ignored.map(normalise));
  if (run.readOnly) throw new Error("Imported runs are inspect-only.");
  const variants = { ...DEFAULT_VARIANTS, ...chosen };
  run.promptVersion ??= `${WALK_VERSION}/${ASK_VERSION}/${Object.entries(variants).map(([ask, variant]) => `${ask}:${variant}`).join(",")}`;
  if (run.visits >= run.limits.maxVisits) {
    run.stopReason = "Visit safety limit · root unresolved";
    trace(run, "limit_reached", { limit: "visits" });
    onUpdate();
    return false;
  }
  const node = nextRunnable(run);
  if (!node) return false;
  const previousStatus = node.status;
  node.status = "working";
  node.kind = kindOf(node);
  const kind = node.kind;
  node.visits++;
  run.visits++;
  trace(run, "node_started", { node: node.id, visit: node.visits });
  let lookups = 0;
  let passes = 0;

  // One raw model call, traced like the one-prompt visit's calls so the
  // summariser and graders read both.
  const send = async (call, meta) => {
    signal?.throwIfAborted();
    trace(run, "model_input", { node: node.id, ...meta, messages: call.messages });
    onUpdate(node.id, meta.status);
    const started = performance.now();
    run.modelCalls++;
    if (pace) await pace(signal);
    const output = await ask(call, { signal, run, node });
    signal?.throwIfAborted();
    trace(run, "model_output", { node: node.id, ...meta, raw: output.text, tokens: output.tokens ?? null, latencyMs: Math.round(performance.now() - started), simulated: run.mode === "simulation" });
    if (Number.isFinite(output.tokens)) run.tokens += output.tokens;
    return output;
  };
  const brief = isBrief(node.question);
  const variantOf = (askName) => (brief && ASKS[askName].variants[BRIEF_VARIANTS[askName]] ? BRIEF_VARIANTS[askName] : variants[askName]);
  const answer = async (askName, input, status) => {
    const variant = variantOf(askName);
    const definition = ASKS[askName].variants[variant];
    const meta = { ask: askName, variant, status };
    if (definition.run) return (await definition.run((call) => send(call, meta), input)).answer;
    const outputs = [];
    for (const call of definition.calls(input)) outputs.push((await send(call, meta)).text);
    return definition.combine(outputs, input);
  };

  const visible = () => [...new Set([...node.observed, ...children(run, node.id).filter((child) => child.status === "resolved").flatMap((child) => child.evidence)])];
  // The article to read from what a search found. A title that is the
  // query itself is read by code. Otherwise the model picks from the first
  // `shown` titles (with a snippet each when the search gave them). A "none"
  // is overridden by a title that shares a content word with the question
  // (0.6B says none to everything; a title about the subject is worth a
  // read regardless) or, when the search ranked its hits (a file corpus,
  // src/files.js, whose paths rarely share a word with a brief), by the
  // first hit. `label` is what the trace calls the query.
  const chooseArticle = async (query, titles, { snippets = null, ranked = false, shown = titles.length, label = query } = {}) => {
    const exact = titles.find((title) => normalise(title) === normalise(query));
    const chosen = exact ?? (await answer("article", { question: node.question, titles: titles.slice(0, shown), ...(snippets ? { snippets: snippets.slice(0, shown) } : {}) }, "Choosing an article"));
    const fallback = chosen === "none" ? titles.find((title) => !isForeign(title, node.question)) ?? (ranked ? titles[0] : null) : null;
    trace(run, "article_chosen", { node: node.id, query: label, titles, article: chosen, ...(exact ? { byCode: true } : {}), ...(fallback ? { readInstead: fallback } : {}) });
    return fallback ?? chosen;
  };
  const lookup = async (query, readOn = null, { chosen = false, fresh = false } = {}) => {
    trace(run, "tool_proposed", { node: node.id, query, tool: source, ...(readOn ? { readOn } : {}) });
    if (!(await approve(query, signal))) {
      signal?.throwIfAborted();
      applyResult(run, node.id, { action: "blocked", reason: "Wikipedia request declined by the user." }, visible());
      onUpdate(node.id, "Request declined");
      return "declined";
    }
    signal?.throwIfAborted();
    lookups++;
    run.lookups++;
    onUpdate(node.id, run.mode === "simulation" ? "Reading fixture evidence" : source === "wiki" ? "Reading Wikipedia" : `Reading ${source}`);
    let outcome = await wiki(query, readOn ? { signal, readOn } : { signal });
    signal?.throwIfAborted();
    trace(run, "tool_result", { node: node.id, query, ...(readOn ? { readOn } : {}), result: outcome });
    // A search's first hit is Wikipedia's guess. When there are others, the
    // article is chosen from the titles (chooseArticle) and the walk reads
    // that one instead. "none" is a failed lookup.
    if (!readOn && !chosen && outcome.ok && outcome.alternatives?.length && variants.article !== "off") {
      const titles = [outcome.title, ...outcome.alternatives];
      const chosen = await chooseArticle(query, titles);
      if (chosen === "none") outcome = { ok: false, error: { kind: "no_match", message: `None of the articles found for “${query}” is about the question: ${titles.join(", ")}.` } };
      else if (chosen !== outcome.title) {
        outcome = await wiki(chosen, { signal });
        signal?.throwIfAborted();
        trace(run, "tool_result", { node: node.id, query: chosen, result: outcome });
      }
    }
    // Already read by this node — or, for a hop (fresh), by any node.
    if (outcome.ok && (fresh ? run.evidence : node.observed.map((id) => run.evidence.find((record) => record.id === id))).some((record) => record?.title === outcome.title)) {
      outcome = { ok: false, error: { kind: "no_match", message: `Already read: “${outcome.title}”.` } };
    }
    if (outcome.ok) {
      captureEvidence(run, node.id, evidenceOf(outcome));
      onUpdate(node.id, "Evidence captured");
      return "captured";
    }
    recordFailedLookup(run, node.id, query, outcome.error);
    onUpdate(node.id, "Lookup found nothing");
    return "nothing";
  };
  // The asks that name something (a search term, a smaller question) see
  // what was read most recently, one window of it: 8B once overflowed the
  // 4,096-token context with every sentence of five excerpts (evals/results/
  // runs 2026-09-18, sky-blue).
  const readSentences = () => candidates(run, node, ignore).slice(0, WINDOW).map((candidate) => candidate.text);
  const firstLookup = async () => {
    if (kind === "section") return lookup(`${node.readFirst.article} / ${node.readFirst.section}`, { ...node.readFirst });
    if (kind === "hop") {
      // A name from the article's links is an article title: read it
      // directly — the part of it that is about the brief's subject, since
      // that is what a hop is for. A capitalised phrase may not be a title;
      // then search for it.
      const direct = await lookup(node.hopTo, { article: node.hopTo, section: 0, about: briefSubject(focusOf(node.question).base, ignore) ?? focusOf(node.question).base }, { fresh: true });
      if (direct !== "nothing" || lookups >= run.limits.maxLookups) return direct;
      return lookup(node.hopTo, null, { fresh: true });
    }
    const { focus } = focusOf(node.question);
    const terms = [...new Set([searchTerm(node.question, ignore), focus ? focus.replace(/^the /, "") : String(node.question).trim()])];
    if (variants.article === "off" || !wiki.length || terms.length < 2) return lookup(terms[0]);
    // The search is a Wikipedia request too, and the page promises that
    // every request is approved: it went out unasked until 2026-09-18.
    trace(run, "tool_proposed", { node: node.id, query: terms.join(" | "), tool: source, searchOnly: true });
    if (!(await approve(terms.join(" | "), signal))) {
      signal?.throwIfAborted();
      applyResult(run, node.id, { action: "blocked", reason: "Wikipedia request declined by the user." }, visible());
      onUpdate(node.id, "Request declined");
      return "declined";
    }
    const titles = [];
    const snippets = [];
    let ranked = false;
    for (const term of terms) {
      let found = null;
      try {
        found = await wiki(term, { signal, searchOnly: true });
      } catch (error) {
        if (signal?.aborted || error?.name === "AbortError") throw error;
      }
      signal?.throwIfAborted();
      trace(run, "tool_result", { node: node.id, query: term, searchOnly: true, result: found });
      if (found?.ranked && !titles.length) ranked = true;
      (found?.hits ?? []).forEach((title, index) => {
        if (titles.includes(title)) return;
        titles.push(title);
        snippets.push(found.snippets?.[index] ?? "");
      });
    }
    if (!titles.length) return lookup(terms[0]);
    const chosen = await chooseArticle(terms[0], titles, { snippets, ranked, shown: 8, label: terms.join(" | ") });
    if (chosen === "none") {
      lookups++;
      run.lookups++;
      recordFailedLookup(run, node.id, terms[0], { kind: "no_match", message: `None of the articles found is about the question: ${titles.join(", ")}.` });
      onUpdate(node.id, "Lookup found nothing");
      return "nothing";
    }
    return lookup(chosen, null, { chosen: true });
  };

  // The one way a node resolves: its own kept text (this visit's picks, or
  // the picks it saved before fanning out) followed by what its settled
  // children found, one paragraph each. A sentence the finding already has
  // is dropped from later paragraphs; over the cap, a child's hop paragraphs
  // go before any child does (the 8B Turing profile at walk-12 lost its
  // last three sections, and their topics, to hops under the first three);
  // and a finding is a claim, not a fragment (six words, as graph.js says).
  const settled = () => children(run, node.id).filter((child) => child.status === "resolved" && child.finding);
  const resolve = (own) => {
    const found = settled();
    const seenText = new Set();
    const fresh = (text) => String(text).split(/\n\n+/).map((paragraph) => unitsOf(paragraph).filter((sentence) => !seenText.has(sentence) && seenText.add(sentence)).join(paragraph.includes("\n") ? "\n" : " ")).filter(Boolean).join("\n\n");
    const parts = [...(own?.text ? [fresh(own.text)] : []), ...found.map((child) => fresh(child.finding))].filter(Boolean);
    const cap = run.limits.maxFindingChars ?? 6000;
    const joiner = node.fanned ? "\n\n" : " ";
    while (parts.join(joiner).length > cap) {
      const split = parts.map((part, index) => [index, part.split(/\n\n+/)]).filter(([, paragraphs]) => paragraphs.length > 1);
      if (!split.length) break;
      const [index, paragraphs] = split.sort((a, b) => b[1].join("").length - a[1].join("").length)[0];
      parts[index] = paragraphs.slice(0, -1).join("\n\n");
    }
    while (parts.length > 1 && parts.join(joiner).length > cap) parts.pop();
    const finding = parts.join(joiner);
    if (finding.split(/\s+/).filter(Boolean).length < MIN_FINDING_WORDS) {
      applyResult(run, node.id, { action: "blocked", reason: `What was kept is a fragment, not a finding: "${finding.slice(0, 80)}".` }, visible());
      onUpdate(node.id, "Blocked");
      return true;
    }
    applyResult(run, node.id, { action: "resolved", harness: true, finding, evidence: [...new Set([...(own?.evidence ?? []), ...found.flatMap((child) => child.evidence)])] }, visible());
    onUpdate(node.id, found.length ? "Findings gathered" : "Finding recorded");
    return true;
  };

  try {
    // An action child runs the one command it was made for, in the worktree,
    // and its finding is the result's last lines: where a test runner sums
    // up. A command that could not run blocks the node; one that ran and
    // failed is a result like any other, exit code and all.
    if (kind === "action") {
      if (!actions) {
        applyResult(run, node.id, { action: "blocked", reason: "No actions can run here." }, visible());
        onUpdate(node.id, "Blocked");
        return true;
      }
      onUpdate(node.id, `Running ${node.action}`);
      run.lookups++;
      const result = await actions.run(node.action, { signal });
      signal?.throwIfAborted();
      trace(run, "action_run", { node: node.id, action: node.action, ok: Boolean(result?.ok), exit: result?.exit ?? null, ms: result?.ms ?? null, chars: result?.text?.length ?? 0 });
      if (!result?.ok) {
        recordFailedLookup(run, node.id, node.action, result?.error ?? { kind: "error", message: "The action did not run." });
        applyResult(run, node.id, { action: "blocked", reason: result?.error?.message ?? "The action did not run." }, visible());
        onUpdate(node.id, "Blocked");
        return true;
      }
      const record = captureEvidence(run, node.id, evidenceOf(result));
      const lines = String(result.text).split("\n").map((line) => line.trimEnd()).filter((line) => line.trim());
      return resolve({ text: lines.slice(-RESULT_LINES).join("\n"), evidence: [record.id] });
    }
    // A question about two named subjects is split by code before anything
    // is read; when its children have settled, the parent's answer is what
    // they found, with no pick — each half is the answer to its half.
    if (!node.observed.length && !children(run, node.id).length) {
      const subjects = splitSubjects(node.question);
      if (subjects.length && node.depth < run.limits.maxDepth && run.nodes.length + subjects.length <= run.limits.maxNodes) {
        node.split = subjects;
        node.kind = "split";
        trace(run, "question_split", { node: node.id, subjects });
        applyResult(run, node.id, { action: "decompose", harness: true, questions: subjects.map((subject) => `${String(node.question).trim()}${FOCUS}${subject}`) }, visible());
        for (const child of run.nodes.slice(-subjects.length)) child.kind = "question";
        onUpdate(node.id, "Split into one question per subject");
        return true;
      }
    }
    // When the children are settled, the parent's answer is what they found,
    // by code and with no pick: each half of a split question answers its
    // half, a brief's sections are its paragraphs, and a question handed down
    // answers the question above it. Until walk-14 a question's parent was
    // shown its child's finding as one more sentence and then resolved with
    // the parts whatever it said: an explicit "none" was overridden, and
    // when the finding was one kept sentence the run-wide kept set hid it and
    // the parent was never asked at all (the observer's case, 2026-09-19).
    if (children(run, node.id).length) {
      const kept = node.kept ?? [];
      if (settled().length || kept.some((entry) => entry.evidence.length)) return resolve(kept.length ? { text: kept.map((entry) => entry.text).join(kept.some((entry) => entry.line) ? "\n" : " "), evidence: kept.flatMap((entry) => entry.evidence) } : null);
      if (kind === "split" || node.fanned) {
        applyResult(run, node.id, { action: "blocked", reason: "Neither part of the question could be answered." }, visible());
        onUpdate(node.id, "Blocked");
        return true;
      }
      // A question whose handed-down question blocked judges its own
      // excerpts again and may read on or ask another.
    }
    // Nothing read and nothing found by children: the first lookup searches
    // for the question minus its question words and for the question itself
    // — neither term is right every time ("sky blue" finds the colour; the
    // raw Dead Sea question finds the Aral Sea) — and the article is picked
    // from every title both found.
    if (!node.observed.length && !children(run, node.id).length && lookups < run.limits.maxLookups) {
      if ((await firstLookup()) === "declined") return true;
      // A hop child exists to read one article; with none read it is done.
      if (kind === "hop" && !node.observed.length) {
        applyResult(run, node.id, { action: "blocked", reason: `Nothing could be read about ${node.hopTo}.` }, visible());
        onUpdate(node.id, "Blocked");
        return true;
      }
    }
    const judged = judgedOf(run, node);
    // Sentences picked and checked so far this visit; the finding is their
    // text, verbatim, in the order found. After a pick the walk asks again
    // over what remains until it says none or maxSentences is reached.
    const gathered = [];
    // How many sentences this visit may keep: twice as many for a brief's
    // root, whose lead is the article's own summary (the Hubble lead holds
    // the launch, the flawed mirror and the servicing missions; three picks
    // kept none of them, 8B, walk-11).
    const room = () => (run.limits.maxSentences ?? 1) * (kind === "brief" ? 2 : 1);
    // The finding reads in source order — the order the article says it,
    // excerpt by excerpt — not the order the model picked it.
    const inOrder = (picked) => [...picked].sort((a, b) => a.evidence[0] === b.evidence[0] ? (a.at ?? 0) - (b.at ?? 0) : run.evidence.findIndex((record) => record.id === a.evidence[0]) - run.evidence.findIndex((record) => record.id === b.evidence[0]));
    // Lines kept from a file read as lines; sentences as prose.
    const glue = (picked) => (picked.some((candidate) => candidate.line) ? "\n" : " ");
    // A finding is a claim, not a label (graph.js: six words). A kept line
    // of code can be shorter ("export class Store"), so the lines after it
    // in the same read come along, verbatim and cited, until it is one.
    const padded = () => {
      const picked = inOrder(gathered);
      const words = () => picked.map((candidate) => candidate.text).join(" ").split(/\s+/).filter(Boolean).length;
      if (!picked.some((candidate) => candidate.line)) return picked;
      const pool = candidates(run, node, ignore);
      for (let guard = 0; words() < MIN_FINDING_WORDS && guard < 8; guard++) {
        const last = picked.at(-1);
        const next = pool.find((candidate) => candidate.evidence[0] === last.evidence[0] && candidate.at === last.at + 1) ?? pool.find((candidate) => candidate.evidence[0] === picked[0].evidence[0] && candidate.at === picked[0].at - 1);
        if (!next || picked.includes(next)) break;
        picked.push(next);
        picked.sort((a, b) => a.at - b.at);
      }
      return picked;
    };
    const resolveWith = () => {
      const picked = padded();
      return resolve({ text: picked.map((candidate) => candidate.text).join(glue(picked)), evidence: picked.flatMap((candidate) => candidate.evidence) });
    };
    // A first answer is rarely the whole answer to a why-question: the Dead
    // Sea lead says it is receding, the section says why. While the finding
    // has room, lookups remain and the article has unread sections, the walk
    // reads one more (the model picks the heading) and asks again over it.
    // For a brief the sections are not read on by this node: the model
    // chooses which are worth reading and code makes one child per section,
    // keeping this node's own picks for the front of the profile.
    const fanOut = async (unread) => {
      const budget = Math.min(run.limits.maxSections ?? 6, run.limits.maxNodes - run.nodes.length);
      const chosen = [];
      // A heading whose own text is a few lines of introduction ("Career and
      // research", 452 characters, chosen and blocked at every size) is not
      // worth a child; its subsections are offered instead.
      const lead = run.evidence.find((record) => record.article === unread.article && record.section === 0 && record.headings?.length);
      const sizes = lead?.sizes ?? [];
      // A file's short declaration is still a section: a two-line method is
      // what a brief may need most.
      let remaining = unread.headings.filter((heading) => { const size = sizes[lead.headings.indexOf(heading)]; return lead.lines || !(Number.isFinite(size) && size < SHORT_SECTION); });
      if (!remaining.length) remaining = [...unread.headings];
      const summaryOf = (heading) => lead?.summaries?.[lead.headings.indexOf(heading)];
      while (chosen.length < budget && remaining.length) {
        const pick = await answer("section", { question: node.question, article: unread.article, sections: remaining, chosen, ...(lead?.summaries ? { summaries: remaining.map(summaryOf) } : {}) }, "Choosing sections");
        if (pick === "none" || !remaining.includes(pick)) break;
        chosen.push(pick);
        remaining = remaining.filter((heading) => heading !== pick);
      }
      chosen.sort((a, b) => unread.headings.indexOf(a) - unread.headings.indexOf(b));
      trace(run, "sections_chosen", { node: node.id, article: unread.article, sections: chosen });
      const action = await actOut();
      if (!chosen.length && !action) return false;
      node.kept = inOrder(gathered).map((candidate) => ({ text: candidate.text, evidence: [...candidate.evidence], ...(candidate.line ? { line: true } : {}) }));
      node.fanned = true;
      if (chosen.length) {
        applyResult(run, node.id, { action: "decompose", harness: true, questions: chosen.map((heading) => `${String(node.question).trim()}${FOCUS}${heading}`) }, visible());
        run.nodes.slice(-chosen.length).forEach((child, index) => {
          child.kind = "section";
          child.readFirst = { article: unread.article, section: chosen[index] };
        });
      }
      if (action) {
        applyResult(run, node.id, { action: "decompose", harness: true, questions: [`${String(node.question).trim()}${FOCUS}${action}`] }, visible());
        Object.assign(run.nodes.at(-1), { kind: "action", action });
      }
      onUpdate(node.id, `Reading ${chosen.length} section${chosen.length === 1 ? "" : "s"}${action ? ` and running ${action}` : ""} below`);
      return "fanned";
    };
    // Once, at a brief's root, when something can be run: the model picks one
    // command from the list code prepared, or none. The child that runs it
    // is a paragraph of the profile like any section's.
    const actOut = async () => {
      if (!actions || kind !== "brief" || node.acted || run.nodes.length >= run.limits.maxNodes) return null;
      const offered = actions.list();
      if (!offered.length) return null;
      node.acted = true;
      const pick = await answer("action", { question: node.question, actions: offered }, "Choosing an action");
      trace(run, "action_chosen", { node: node.id, offered: offered.map((entry) => entry.name), chosen: pick });
      return offered.some((entry) => entry.name === pick) ? pick : null;
    };
    // A brief's node, having kept its sentences, may hand the things they
    // name to children of its own: code lists the article's links that
    // occur in the kept sentences (or, without links, their capitalised
    // phrases), ranked by how often the run has met each, minus anything
    // read or opened anywhere in the run; the model picks which are worth
    // an article each, up to maxHops, or none. A child made this way reads
    // that article and keeps only sentences that name the brief's subject.
    const namesFor = async () => {
      const frontier = frontierOf(run);
      const subject = focusOf(node.question).base;
      const kept = inOrder(gathered);
      const articles = [...new Set(kept.map((candidate) => run.evidence.find((record) => record.id === candidate.evidence[0])?.article).filter(Boolean))];
      for (const article of articles) {
        if (frontier.links.has(article)) continue;
        let found = null;
        try {
          found = await wiki(article, { signal, links: true });
        } catch (error) {
          if (signal?.aborted || error?.name === "AbortError") throw error;
        }
        signal?.throwIfAborted();
        trace(run, "tool_result", { node: node.id, query: article, links: true, result: found?.ok ? { ok: true, kind: "links", title: found.title, links: found.links.length } : found ?? null });
        frontier.links.set(article, found?.ok && Array.isArray(found.links) ? found.links : null);
      }
      const wanted = contentWords(subject);
      const read = new Set(run.evidence.flatMap((record) => [normalise(record.article), normalise(record.title)]));
      const unseen = (name) => !read.has(normalise(name)) && !frontier.opened.has(normalise(name)) && ![...contentWords(name)].every((word) => wanted.has(word));
      const names = [];
      const add = (name) => {
        if (unseen(name) && !names.some((known) => normalise(known) === normalise(name) || occurs(known, name) || occurs(name, known))) names.push(name);
      };
      // With the article's links, only they are offered: they are what its
      // editors decided the words refer to. Without them, capitalised phrases.
      // Never a disambiguation page, a month, or a nationality (8B's Turing
      // children were offered "Turing (disambiguation)", "February", "German").
      let linked = false;
      for (const candidate of kept) {
        const record = run.evidence.find((entry) => entry.id === candidate.evidence[0]);
        const links = frontier.links.get(record?.article);
        if (!links) continue;
        linked = true;
        // A line of code names a link by using it, not by containing the
        // word: "// then rename" named the collection's rename method (1.7B,
        // 2026-09-19). And the lines a model keeps from a declaration are
        // its comments, which use nothing, so over code the hops are what
        // the declaration read calls, not what the kept lines say.
        const shown = (link) => String(link).replace(/\s*\([^)]*\)\s*$/, "");
        const scope = candidate.line ? record.text : candidate.text;
        for (const link of links) if (!UNWANTED_NAME.test(link) && (candidate.line ? usesName(scope, shown(link)) : occurs(link, scope))) add(link);
      }
      if (!linked) for (const name of namesIn(kept.map((candidate) => candidate.text), subject)) if (!UNWANTED_NAME.test(name)) add(name);
      // Ranked by how many excerpts in the run name each: what several
      // nodes met is what the profile most needs.
      const met = (name) => run.evidence.filter((record) => occurs(name, record.text)).length;
      const counts = new Map(names.map((name) => [name, met(name)]));
      names.sort((a, b) => counts.get(b) - counts.get(a));
      // Offered only if its article says something about the subject: code
      // reads the part that would be read (cached, no evidence captured), so
      // Astronomy, Universe and Star — named by every excerpt, ranked first,
      // chosen, and empty of the subject (8B, walk-11) — are not on the list.
      const about = briefSubject(subject, ignore) ?? subject;
      const offered = [];
      for (const name of names.slice(0, NAMES_SHOWN + 4)) {
        if (offered.length >= NAMES_SHOWN) break;
        let found = null;
        try {
          found = await wiki(name, { signal, readOn: { article: name, section: 0, about } });
        } catch (error) {
          if (signal?.aborted || error?.name === "AbortError") throw error;
        }
        signal?.throwIfAborted();
        // An article read by any node is not hopped to again; over code the
        // unit is the declaration, and another method of a file already
        // read is new reading ("rename" beside "writeDocuments").
        const says = Boolean(found?.ok) && !read.has(normalise(found.title)) && (Boolean(found.lines) || !read.has(normalise(found.article)));
        trace(run, "hop_checked", { node: node.id, name, about, says, ...(found?.ok ? { title: found.title } : { error: found?.error?.message ?? null }) });
        if (says) offered.push(name);
      }
      return offered;
    };
    const hopOut = async () => {
      if (!brief || node.hopped || !gathered.length || node.depth >= run.limits.maxDepth) return false;
      // A hop child may hand down hops of its own, once: the Bombe's child
      // reads Bletchley Park for what it says about Turing. A hop's hop is a
      // leaf, so the first section's subtree cannot swallow the budget.
      const parent = run.nodes.find((candidate) => candidate.id === node.parent);
      if (kind === "hop" && parent && kindOf(parent) === "hop") return false;
      // Every node still open is owed room for its own hops.
      const open = run.nodes.filter((candidate) => candidate.status === "open" && candidate.id !== node.id).length;
      const budget = Math.min(run.limits.maxHops ?? 2, run.limits.maxNodes - run.nodes.length - open * (run.limits.maxHops ?? 2));
      if (budget <= 0) return false;
      node.hopped = true;
      const offered = await namesFor();
      if (!offered.length) {
        trace(run, "hops_chosen", { node: node.id, offered, chosen: [] });
        return false;
      }
      const chosen = [];
      let remaining = [...offered];
      while (chosen.length < budget && remaining.length) {
        const pick = await answer("missing", { question: node.question, sentences: inOrder(gathered).map((candidate) => candidate.text), names: remaining, chosen }, "Choosing where to hop");
        if (pick === "none" || !remaining.includes(pick)) break;
        chosen.push(pick);
        remaining = remaining.filter((name) => name !== pick);
      }
      trace(run, "hops_chosen", { node: node.id, offered, chosen });
      if (!chosen.length) return false;
      const frontier = frontierOf(run);
      for (const name of chosen) frontier.opened.add(normalise(name));
      node.kept = inOrder(gathered).map((candidate) => ({ text: candidate.text, evidence: [...candidate.evidence], ...(candidate.line ? { line: true } : {}) }));
      node.fanned = true;
      const base = focusOf(node.question).base.trim();
      applyResult(run, node.id, { action: "decompose", harness: true, questions: chosen.map((name) => `${base}${FOCUS}${name}`) }, visible());
      run.nodes.slice(-chosen.length).forEach((child, index) => {
        child.kind = "hop";
        child.hopTo = chosen[index];
      });
      onUpdate(node.id, `Reading about ${chosen.length} more thing${chosen.length === 1 ? "" : "s"} below`);
      return "fanned";
    };
    const readOn = async () => {
      const unread = unreadSections(run, node)[0];
      // A brief's own picks are the front of the profile, whatever their
      // number; the sections are handed down regardless.
      // Only the brief's root fans out: a child that hopped to "Chess" once
      // fanned that article's sections into grandchildren (1.7B, walk-8).
      if (brief) {
        if (unread && kind === "brief" && node.depth < run.limits.maxDepth && !children(run, node.id).length && (await fanOut(unread))) return "fanned";
        return hopOut();
      }
      if (gathered.length >= room() || lookups >= run.limits.maxLookups || passes >= run.limits.maxPasses) return false;
      if (!unread) return false;
      const section = await answer("section", { question: node.question, article: unread.article, sections: unread.headings }, "Reading on");
      trace(run, "section_chosen", { node: node.id, article: unread.article, section, readOn: true });
      return (await lookup(`${unread.article} / ${section}`, { article: unread.article, section })) === "captured";
    };
    while (true) {
      signal?.throwIfAborted();
      const keptAnywhere = keptOf(run);
      const pool = candidates(run, node, ignore).filter((candidate) => !judged.has(candidate.text) && !keptAnywhere.has(normalise(candidate.text)));
      if (pool.length && passes < run.limits.maxPasses && gathered.length < room()) {
        const window = pool.slice(0, WINDOW);
        passes++;
        const pick = await answer("sentence", { question: node.question, sentences: window.map((candidate) => candidate.text), titles: window.map((candidate) => String(candidate.source).split(" § ")[0]) }, gathered.length ? "Reading for more" : "Reading");
        trace(run, "sentence_picked", { node: node.id, pick, shown: window.length, gathered: gathered.length });
        if (pick !== "none") {
          const index = Number(pick) - 1;
          const chosen = window[index];
          if (!chosen) throw new Error(`The model picked sentence ${pick} of ${window.length}.`);
          // A finding is a sentence, not a fragment (validateResult). A very
          // short first pick keeps its neighbour for context — still verbatim.
          if (!gathered.length && chosen.text.split(/\s+/).length < MIN_FINDING_WORDS && index > 0 && window[index - 1].evidence[0] === chosen.evidence[0]) gathered.push(window[index - 1]);
          gathered.push(chosen);
          judged.add(chosen.text);
          keptAnywhere.add(normalise(chosen.text));
          continue;
        }
        if (gathered.length) {
          for (const candidate of window) judged.add(candidate.text);
          const next = await readOn();
          if (next === "fanned") return true;
          if (next) continue;
          return resolveWith();
        }
        for (const candidate of window) judged.add(candidate.text);
        continue;
      }
      if (gathered.length) {
        const next = await readOn();
        if (next === "fanned") return true;
        if (next) continue;
        return resolveWith();
      }
      // Nothing left to judge.
      // A brief's root whose lead gave it nothing to keep still hands its
      // sections down: a source file's header can be one line ("Common
      // types and interfaces"), and the file's substance is its
      // declarations (1.7B, 2026-09-19, the find brief blocked at the root).
      if (kind === "brief" && !children(run, node.id).length && node.depth < run.limits.maxDepth) {
        const unread = unreadSections(run, node)[0];
        if (unread && (await fanOut(unread))) return true;
      }
      // A hop child reads one article for sentences that name the brief's
      // subject; when its lead has none, no section of it is read either
      // (8B's Gordon Brown child read on and asked for section "none").
      if (kind === "hop") {
        applyResult(run, node.id, { action: "blocked", reason: judged.size ? `Nothing of what ${node.hopTo} says about the subject was kept.` : `Nothing read about ${node.hopTo} names the subject of the brief.` }, visible());
        onUpdate(node.id, "Blocked");
        return true;
      }
      if (lookups < run.limits.maxLookups && passes < run.limits.maxPasses) {
        const unread = unreadSections(run, node)[0];
        if (unread) {
          const section = await answer("section", { question: node.question, article: unread.article, sections: unread.headings }, "Choosing a section");
          trace(run, "section_chosen", { node: node.id, article: unread.article, section });
          if (section === "none") lookups = run.limits.maxLookups;
          else {
            if ((await lookup(`${unread.article} / ${section}`, { article: unread.article, section })) === "declined") return true;
            continue;
          }
        }
        // Under a brief the walk never names a search term: what to read
        // next is a pick from what was kept (hopOut), and a node that kept
        // nothing has nothing to pick from.
        const search = brief ? null : await answer("missing", { question: node.question, sentences: readSentences() }, "Deciding what to look up");
        const tried = search === null || (node.failedLookups ?? []).some((entry) => normalise(entry.query) === normalise(search));
        const known = search !== null && node.observed.some((id) => normalise(run.evidence.find((record) => record.id === id)?.article) === normalise(search));
        if (!tried && !known) {
          if ((await lookup(search)) === "declined") return true;
          continue;
        }
        if (search !== null) recordFailedLookup(run, node.id, search, { kind: "no_match", message: known ? "Already read." : "Already tried." });
        lookups = run.limits.maxLookups; // nothing new to read here
      }
      // Under a brief the graph's shape is code's (sections, hops); a
      // model-asked question here chained seven nodes about Prolog under
      // "Career and research" (experiments/2026-09-18-qwen3-8b-turing-walk-8).
      const questionsAllowed = !brief && node.depth < run.limits.maxDepth ? Math.max(0, run.limits.maxNodes - run.nodes.length) : 0;
      if (questionsAllowed > 0) {
        const question = await answer("question", { question: node.question, sentences: readSentences() }, "Asking a smaller question");
        const rejected = isRepeat(run, node, question) ? "repeat" : ABOUT_THE_TEXT.test(question) ? "about the text" : (question.match(/\?/g) || []).length > 1 ? "several questions" : null;
        if (!rejected) {
          applyResult(run, node.id, { action: "decompose", questions: [question] }, visible());
          onUpdate(node.id, "New question added");
          return true;
        }
        trace(run, "question_rejected", { node: node.id, question, reason: rejected });
      }
      applyResult(run, node.id, { action: "blocked", reason: node.observed.length ? "Nothing read states the answer, and no further lookup or question is allowed here." : "Nothing could be read for this question." }, visible());
      onUpdate(node.id, "Blocked");
      return true;
    }
  } catch (error) {
    if (error.partialText) trace(run, "partial_model_output", { node: node.id, raw: error.partialText });
    if (signal?.aborted || error.name === "AbortError") {
      node.status = previousStatus;
      trace(run, "node_cancelled", { node: node.id });
      onUpdate(node.id, "Cancelled · node remains open");
    } else {
      node.status = "error";
      node.reason = String(error.message || error).slice(0, 4000);
      run.stopReason = "Paused on error · inspect or retry";
      trace(run, "node_error", { node: node.id, error: node.reason });
      onUpdate(node.id, node.reason);
    }
    return false;
  }
}
