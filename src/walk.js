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

import { ASKS, ASK_VERSION, parseJson, splitSentences } from "./asks.js";
import { applyResult, captureEvidence, children, nextRunnable, recordFailedLookup, trace } from "./graph.js";
import { contentWords, isParaphrase, namesSubject } from "./text.js";

export const WALK_VERSION = "walk-14"; // walk-14: a parent whose children answered resolves with what they found by code, with no pick, for a question as for a split or a brief; a child's finding is no longer offered to the sentence pick, so no "none" over it can be overridden; // walk-13: a hop's sentence names the subject only by the subject's own capitalised words, with their capitals ("Juno mission" and "rosetta orbit" no longer count for the Rosetta mission), and the first search waits for approval like every other request; // walk-12: an over-long profile loses hop paragraphs before it loses sections, and a short section is not handed to a child; a hop child may hand down hops of its own (one level), a reserve keeps room for every open node's hops, and a name is offered only if its article says something about the subject; // walk-11: a hop child reads the part of its article that names the brief's subject, and a brief's root keeps twice the sentences; a brief's child hands the things its kept sentences name (the article's links that occur in them, else capitalised phrases) to children of its own, the model picking which from a list ranked by how often the run has met each; a sentence kept anywhere is never offered again; // walk-10: a hop never re-reads an article any node has read, a brief's children follow the article's order, and the profile drops a sentence it already has; // walk-9: under a brief no model-asked questions (the shape is code's), only the root fans out, a hop's sentences must name the brief's subject, the hop comes before the sentence cap, and a finding's sentences are in source order; walk-8: a brief (no question mark, or "tell me about…") reads the lead, hands one child per section the model chooses, each child may hop to one article named from what it kept, and the root's finding is the profile in order; // walk-7: a question about two named subjects is split by code, one child per subject, and the parent's answer is their findings; after a first answer a node reads on into an unread section while lookups remain; walk-6: search snippets shown with the titles, the sentence check by model size; walk-2: paraphrases refused; walk-3: questions about "the text" refused, up to maxSentences per finding; walk-4: the article is picked from the search hits, judged sentences remembered across visits; walk-5: the first search tries both terms, the pick is checked only when its source is foreign to the question
// Which variant of each ask the walk uses; the node evals choose these
// (evals/node/results.md). Overridable per run for A/B comparison.
// sentence: a pick from the numbered list, then one yes-or-no on the chosen
// sentence alone. The plain pick cannot tell a sentence about the wrong
// subject (every size picked the Aral Sea's reason for a Dead Sea question,
// even labelled); the check catches it from 1.7B up, trading a few false
// "none"s — which cost a lookup — for false findings, which cost the run.
export const DEFAULT_VARIANTS = Object.freeze({ sentence: "list", section: "list", missing: "search", question: "one", article: "snippets", confirm: "yesno" });
// Variants by model size. The pick-then-check sentence ask has no false
// negatives at 8B (node evals 23/23; benchmark 12 → 16 facts) but costs 4B
// two facts on the benchmark (16 → 14) and refuses true answers at 1.7B, so
// only 8B and above check every pick; the rest take the plain pick and
// confirm only foreign-source picks (CHECK_FOREIGN).
export function variantsFor(modelId = "") {
  // "Qwen3-8B-q4f16_1-MLC" in the page; "qwen3:8b", "qwen3:14b-q4_K_M" over
  // an endpoint (endpoint.js). Not "Qwen3-30B-A3B", not "qwen3:1.7b".
  const big = /(?:^|[-:_/])(8|14|32)b(?=$|[-:_@\s])/i.test(String(modelId));
  return { ...DEFAULT_VARIANTS, ...(big ? { sentence: "check" } : {}) };
}
// When the picked sentence comes from an article that shares no content
// word with the question (the Aral Sea for a Dead Sea question), the pick is
// confirmed with one yes-or-no on that sentence alone. When the source is
// about the question's subject it is not: at 1.7B the check refused the
// Aral Sea's own reason for shrinking (node evals and the walk-4 benchmark),
// and a wrong pick about the right subject costs less than a lost answer.
export const CHECK_FOREIGN = true;
// A brief rather than a question: "Tell me about Alan Turing and elaborate on
// the impact of his work." There is no answering sentence to find, so the
// asks change wording (asks.js: sentence/brief, section/brief, missing/hop)
// and the walk changes shape: the lead is read, the model chooses the
// sections worth reading (one child each, made by code), each child keeps
// its sentences and may hop once to an article named from them, and the
// root's finding is the kept sentences and the children's findings in order.
export const BRIEF = /^(tell|describe|explain|write|give|summari[sz]e|elaborate|outline|profile|discuss)\b/i;
export const BRIEF_VARIANTS = Object.freeze({ sentence: "brief", section: "brief", missing: "names" });
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
// Sentences a node has already judged as not answering, kept across visits
// so a revisit reads on instead of re-showing the same windows (the water
// cycle root, walk-3: four passes over the same lead, twice).
const judgedByNode = new WeakMap();

// The first lookup is code: the question minus its question words. The raw
// question sent to Wikipedia's search found the Aral Sea for "Why is the Dead
// Sea shrinking?" (experiments/2026-09-18-qwen3-1.7b-dead-sea-walk-1); the
// stripped term finds the Dead Sea, and the same rule finds the right article
// for every benchmark seed tried.
const QUESTION_WORDS = new Set("why is are was were the a an does do did how what which who whom when where keep going happen happened happens it its there so much many still".split(" "));
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
export function briefSubject(question) {
  const text = String(question ?? "").split(FOCUS)[0];
  for (const match of text.matchAll(NAME_IN_TEXT)) {
    // The brief's first word is its verb ("Describe the Great Barrier Reef").
    const name = (match.index === 0 ? match[1].replace(/^\S+\s+(?:me\s+|us\s+)?(?:about\s+)?(?:the\s+)?/i, "") : match[1]).replace(/^the /i, "").trim();
    if (!name || BRIEF.test(name)) continue;
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
export function searchTerm(question) {
  const { base, focus, others } = focusOf(question);
  if (!focus && isBrief(base)) {
    const subject = briefSubject(base);
    if (subject) return subject;
  }
  let text = String(base ?? "").replace(/[?.!,;:"“”]/g, "");
  for (const other of others) text = text.replace(other.replace(/[?.!,;:"“”]/g, ""), " ");
  const words = text.split(/\s+/).filter(Boolean);
  const kept = words.filter((word) => !QUESTION_WORDS.has(word.toLowerCase()) && !(focus && JOIN_WORDS.has(word.toLowerCase())));
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
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function occurs(title, text) {
  const shown = String(title).replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (shown.length < 3) return false;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRe(shown)}(?=$|[^\\p{L}\\p{N}])`, "iu").test(String(text));
}
// Per run: the links of each article read (null when unavailable), and the
// names any node has already opened a child for. Kept outside the run so an
// export stays what the model saw and said.
const frontierByRun = new WeakMap();
const frontierOf = (run) => {
  if (!frontierByRun.has(run)) frontierByRun.set(run, { links: new Map(), opened: new Set() });
  return frontierByRun.get(run);
};
// Sentences kept by any node, so a profile never offers one twice.
const keptByRun = new WeakMap();
const keptOf = (run) => {
  if (!keptByRun.has(run)) keptByRun.set(run, new Set());
  return keptByRun.get(run);
};

// The sentences a node can choose between: the excerpts it has observed,
// newest first. Every candidate carries the evidence it rests on. A child's
// finding is not a candidate: a finding is not evidence, and a parent whose
// children answered resolves with what they found without a pick (below).
export function candidates(run, node) {
  const out = [];
  // Under a brief, a hop's article is about something else (the bombe, chess);
  // only its sentences that name the brief's subject are offered, so a hop to
  // "Chess" cannot fill a Turing profile with chess.
  const base = String(node.question).split(FOCUS)[0];
  const subject = node.hopTo ? (briefSubject(base) ?? base) : null;
  const onSubject = (record, text) => subject === null || record.node !== node.id || node.readFirst?.article === record.article || namesSubject(text, subject);
  for (const id of [...node.observed].reverse()) {
    const record = run.evidence.find((candidate) => candidate.id === id);
    if (!record) continue;
    splitSentences(record.text).forEach((text, index) => {
      if (onSubject(record, text)) out.push({ text, evidence: [id], from: "excerpt", source: record.title, at: index });
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
  const { signal, onUpdate = () => {}, ask, wiki, approve = async () => true, pace = null, variants: chosen = {} } = options;
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
  const lookup = async (query, readOn = null, { chosen = false, fresh = false } = {}) => {
    trace(run, "tool_proposed", { node: node.id, query, tool: "wiki", ...(readOn ? { readOn } : {}) });
    if (!(await approve(query, signal))) {
      signal?.throwIfAborted();
      applyResult(run, node.id, { action: "blocked", reason: "Wikipedia request declined by the user." }, visible());
      onUpdate(node.id, "Request declined");
      return "declined";
    }
    signal?.throwIfAborted();
    lookups++;
    run.lookups++;
    onUpdate(node.id, run.mode === "simulation" ? "Reading fixture evidence" : "Reading Wikipedia");
    let outcome = await wiki(query, readOn ? { signal, readOn } : { signal });
    signal?.throwIfAborted();
    trace(run, "tool_result", { node: node.id, query, ...(readOn ? { readOn } : {}), result: outcome });
    // A search's first hit is Wikipedia's guess. When there are others, the
    // model picks the article from the titles — one enum call — and the
    // walk reads that one instead. "none" is a failed lookup.
    if (!readOn && !chosen && outcome.ok && outcome.alternatives?.length && variants.article !== "off") {
      const titles = [outcome.title, ...outcome.alternatives];
      const exact = titles.find((title) => normalise(title) === normalise(query));
      let chosen = exact ?? (await answer("article", { question: node.question, titles }, "Choosing an article"));
      // "none" is overridden by a title that is the query itself (a hop to
      // "Bombe" offered Bombe, Baked Alaska and Bombe glacée; 8B said none)
      // or that shares a content word with the question.
      const fallback = chosen === "none" ? titles.find((title) => normalise(title) === normalise(query)) ?? titles.find((title) => !isForeign(title, node.question)) ?? null : null;
      trace(run, "article_chosen", { node: node.id, query, titles, article: chosen, ...(exact ? { byCode: true } : {}), ...(fallback ? { readInstead: fallback } : {}) });
      if (fallback) chosen = fallback;
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
      captureEvidence(run, node.id, outcome);
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
  const readSentences = () => candidates(run, node).slice(0, WINDOW).map((candidate) => candidate.text);
  const firstLookup = async () => {
    if (node.readFirst) return lookup(`${node.readFirst.article} / ${node.readFirst.section}`, { ...node.readFirst });
    if (node.hopTo) {
      // A name from the article's links is an article title: read it
      // directly — the part of it that is about the brief's subject, since
      // that is what a hop is for. A capitalised phrase may not be a title;
      // then search for it.
      const direct = await lookup(node.hopTo, { article: node.hopTo, section: 0, about: briefSubject(focusOf(node.question).base) ?? focusOf(node.question).base }, { fresh: true });
      if (direct !== "nothing" || lookups >= run.limits.maxLookups) return direct;
      return lookup(node.hopTo, null, { fresh: true });
    }
    const { focus } = focusOf(node.question);
    const terms = [...new Set([searchTerm(node.question), focus ? focus.replace(/^the /, "") : String(node.question).trim()])];
    if (variants.article === "off" || !wiki.length || terms.length < 2) return lookup(terms[0]);
    // The search is a Wikipedia request too, and the page promises that
    // every request is approved: it went out unasked until 2026-09-18.
    trace(run, "tool_proposed", { node: node.id, query: terms.join(" | "), tool: "wiki", searchOnly: true });
    if (!(await approve(terms.join(" | "), signal))) {
      signal?.throwIfAborted();
      applyResult(run, node.id, { action: "blocked", reason: "Wikipedia request declined by the user." }, visible());
      onUpdate(node.id, "Request declined");
      return "declined";
    }
    const titles = [];
    const snippets = [];
    for (const term of terms) {
      let found = null;
      try {
        found = await wiki(term, { signal, searchOnly: true });
      } catch (error) {
        if (signal?.aborted || error?.name === "AbortError") throw error;
      }
      signal?.throwIfAborted();
      trace(run, "tool_result", { node: node.id, query: term, searchOnly: true, result: found });
      (found?.hits ?? []).forEach((title, index) => {
        if (titles.includes(title)) return;
        titles.push(title);
        snippets.push(found.snippets?.[index] ?? "");
      });
    }
    if (!titles.length) return lookup(terms[0]);
    // A hit whose title is the search term itself is read without asking.
    const exact = titles.find((title) => normalise(title) === normalise(terms[0]));
    if (exact) {
      trace(run, "article_chosen", { node: node.id, query: terms.join(" | "), titles, article: exact, byCode: true });
      return lookup(exact, null, { chosen: true });
    }
    let chosen = await answer("article", { question: node.question, titles: titles.slice(0, 8), snippets: snippets.slice(0, 8) }, "Choosing an article");
    // "none" is honoured only when no title is about the question's subject:
    // 0.6B says none to everything (evals/node/results.md), and a title that
    // shares a content word with the question is worth a read regardless.
    const fallback = chosen === "none" ? titles.find((title) => !isForeign(title, node.question)) ?? null : null;
    trace(run, "article_chosen", { node: node.id, query: terms.join(" | "), titles, article: chosen, ...(fallback ? { readInstead: fallback } : {}) });
    if (fallback) chosen = fallback;
    if (chosen === "none") {
      lookups++;
      run.lookups++;
      recordFailedLookup(run, node.id, terms[0], { kind: "no_match", message: `None of the articles found is about the question: ${titles.join(", ")}.` });
      onUpdate(node.id, "Lookup found nothing");
      return "nothing";
    }
    return lookup(chosen, null, { chosen: true });
  };

  try {
    // A question about two named subjects is split by code before anything
    // is read; when its children have settled, the parent's answer is what
    // they found, with no pick — each half is the answer to its half.
    if (!node.observed.length && !children(run, node.id).length) {
      const subjects = splitSubjects(node.question);
      if (subjects.length && node.depth < run.limits.maxDepth && run.nodes.length + subjects.length <= run.limits.maxNodes) {
        node.split = subjects;
        trace(run, "question_split", { node: node.id, subjects });
        applyResult(run, node.id, { action: "decompose", harness: true, questions: subjects.map((subject) => `${String(node.question).trim()}${FOCUS}${subject}`) }, visible());
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
      const found = children(run, node.id).filter((child) => child.status === "resolved" && child.finding);
      const kept = node.kept ?? [];
      if (found.length || kept.some((entry) => entry.evidence.length)) {
        // A sentence the profile already has is dropped from later paragraphs.
        const seenText = new Set();
        const fresh = (text) => String(text).split(/\n\n+/).map((paragraph) => splitSentences(paragraph).filter((sentence) => !seenText.has(sentence) && seenText.add(sentence)).join(" ")).filter(Boolean).join("\n\n");
        const parts = [...(kept.length ? [fresh(kept.map((entry) => entry.text).join(" "))] : []), ...found.map((child) => fresh(child.finding))].filter(Boolean);
        const cap = run.limits.maxFindingChars ?? 6000;
        const joiner = node.fanned ? "\n\n" : " ";
        // Over the cap, a child's hop paragraphs go before any child does: the
        // 8B Turing profile at walk-12 lost its last three sections, and their
        // topics, to hops under the first three.
        while (parts.join(joiner).length > cap) {
          const split = parts.map((part, index) => [index, part.split(/\n\n+/)]).filter(([, paragraphs]) => paragraphs.length > 1);
          if (!split.length) break;
          const [index, paragraphs] = split.sort((a, b) => b[1].join("").length - a[1].join("").length)[0];
          parts[index] = paragraphs.slice(0, -1).join("\n\n");
        }
        while (parts.length > 1 && parts.join(joiner).length > cap) parts.pop();
        applyResult(run, node.id, { action: "resolved", harness: true, finding: parts.join(joiner), evidence: [...new Set([...kept.flatMap((entry) => entry.evidence), ...found.flatMap((child) => child.evidence)])] }, visible());
        onUpdate(node.id, "Findings gathered");
        return true;
      }
      if (node.split || node.fanned) {
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
      if (node.hopTo && !node.observed.length) {
        applyResult(run, node.id, { action: "blocked", reason: `Nothing could be read about ${node.hopTo}.` }, visible());
        onUpdate(node.id, "Blocked");
        return true;
      }
    }
    if (!judgedByNode.has(node)) judgedByNode.set(node, new Set());
    const judged = judgedByNode.get(node);
    // Sentences picked and checked so far this visit; the finding is their
    // text, verbatim, in the order found. After a pick the walk asks again
    // over what remains until it says none or maxSentences is reached.
    const gathered = [];
    // How many sentences this visit may keep: twice as many for a brief's
    // root, whose lead is the article's own summary (the Hubble lead holds
    // the launch, the flawed mirror and the servicing missions; three picks
    // kept none of them, 8B, walk-11).
    const room = () => (run.limits.maxSentences ?? 1) * (brief && node.depth === 0 ? 2 : 1);
    // The finding reads in source order — the order the article says it,
    // excerpt by excerpt — not the order the model picked it.
    const inOrder = (picked) => [...picked].sort((a, b) => a.evidence[0] === b.evidence[0] ? (a.at ?? 0) - (b.at ?? 0) : run.evidence.findIndex((record) => record.id === a.evidence[0]) - run.evidence.findIndex((record) => record.id === b.evidence[0]));
    const resolveWith = () => {
      applyResult(run, node.id, { action: "resolved", harness: true, finding: inOrder(gathered).map((candidate) => candidate.text).join(" "), evidence: [...new Set(inOrder(gathered).flatMap((candidate) => candidate.evidence))] }, visible());
      onUpdate(node.id, "Finding recorded");
      return true;
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
      let remaining = unread.headings.filter((heading) => { const size = sizes[lead.headings.indexOf(heading)]; return !(Number.isFinite(size) && size < SHORT_SECTION); });
      if (!remaining.length) remaining = [...unread.headings];
      while (chosen.length < budget && remaining.length) {
        const pick = await answer("section", { question: node.question, article: unread.article, sections: remaining, chosen }, "Choosing sections");
        if (pick === "none" || !remaining.includes(pick)) break;
        chosen.push(pick);
        remaining = remaining.filter((heading) => heading !== pick);
      }
      chosen.sort((a, b) => unread.headings.indexOf(a) - unread.headings.indexOf(b));
      trace(run, "sections_chosen", { node: node.id, article: unread.article, sections: chosen });
      if (!chosen.length) return false;
      node.kept = inOrder(gathered).map((candidate) => ({ text: candidate.text, evidence: [...candidate.evidence] }));
      node.fanned = true;
      applyResult(run, node.id, { action: "decompose", harness: true, questions: chosen.map((heading) => `${String(node.question).trim()}${FOCUS}${heading}`) }, visible());
      for (const child of run.nodes.slice(-chosen.length)) child.readFirst = { article: unread.article, section: chosen[run.nodes.slice(-chosen.length).indexOf(child)] };
      onUpdate(node.id, `Reading ${chosen.length} section${chosen.length === 1 ? "" : "s"} below`);
      return "fanned";
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
        const article = run.evidence.find((record) => record.id === candidate.evidence[0])?.article;
        const links = frontier.links.get(article);
        if (!links) continue;
        linked = true;
        for (const link of links) if (!UNWANTED_NAME.test(link) && occurs(link, candidate.text)) add(link);
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
      const about = briefSubject(subject) ?? subject;
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
        const says = Boolean(found?.ok) && !read.has(normalise(found.title)) && !read.has(normalise(found.article));
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
      if (node.hopTo && run.nodes.find((candidate) => candidate.id === node.parent)?.hopTo) return false;
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
      node.kept = inOrder(gathered).map((candidate) => ({ text: candidate.text, evidence: [...candidate.evidence] }));
      node.fanned = true;
      const base = focusOf(node.question).base.trim();
      applyResult(run, node.id, { action: "decompose", harness: true, questions: chosen.map((name) => `${base}${FOCUS}${name}`) }, visible());
      run.nodes.slice(-chosen.length).forEach((child, index) => { child.hopTo = chosen[index]; });
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
        if (unread && node.depth === 0 && node.depth < run.limits.maxDepth && !children(run, node.id).length && (await fanOut(unread))) return "fanned";
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
      const pool = candidates(run, node).filter((candidate) => !judged.has(candidate.text) && !keptAnywhere.has(normalise(candidate.text)));
      if (pool.length && passes < run.limits.maxPasses && gathered.length < room()) {
        const window = pool.slice(0, WINDOW);
        passes++;
        const pick = await answer("sentence", { question: node.question, sentences: window.map((candidate) => candidate.text), titles: window.map((candidate) => String(candidate.source).split(" § ")[0]) }, gathered.length ? "Reading for more" : "Reading");
        trace(run, "sentence_picked", { node: node.id, pick, shown: window.length, gathered: gathered.length });
        if (pick !== "none") {
          const index = Number(pick) - 1;
          const chosen = window[index];
          if (!chosen) throw new Error(`The model picked sentence ${pick} of ${window.length}.`);
          // A brief's hop article is foreign to the brief by design (the
          // Bombe for Turing), so its picks are not confirmed.
          if (CHECK_FOREIGN && !brief && variants.sentence !== "check" && chosen.from === "excerpt" && isForeign(chosen.source, node.question)) {
            const verdict = await answer("confirm", { question: node.question, sentence: chosen.text }, "Checking the pick");
            trace(run, "pick_checked", { node: node.id, pick, source: chosen.source, verdict });
            if (verdict !== "yes") {
              judged.add(chosen.text);
              continue;
            }
          }
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
      // A hop child reads one article for sentences that name the brief's
      // subject; when its lead has none, no section of it is read either
      // (8B's Gordon Brown child read on and asked for section "none").
      if (brief && node.hopTo) {
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
