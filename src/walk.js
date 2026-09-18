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
import { contentWords, isParaphrase } from "./text.js";

export const WALK_VERSION = "walk-7"; // walk-7: a question about two named subjects is split by code, one child per subject, and the parent's answer is their findings; after a first answer a node reads on into an unread section while lookups remain; walk-6: search snippets shown with the titles, the sentence check by model size; walk-2: paraphrases refused; walk-3: questions about "the text" refused, up to maxSentences per finding; walk-4: the article is picked from the search hits, judged sentences remembered across visits; walk-5: the first search tries both terms, the pick is checked only when its source is foreign to the question
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
  const big = /-(8|14|32)B-/i.test(String(modelId));
  return { ...DEFAULT_VARIANTS, ...(big ? { sentence: "check" } : {}) };
}
// When the picked sentence comes from an article that shares no content
// word with the question (the Aral Sea for a Dead Sea question), the pick is
// confirmed with one yes-or-no on that sentence alone. When the source is
// about the question's subject it is not: at 1.7B the check refused the
// Aral Sea's own reason for shrinking (node evals and the walk-4 benchmark),
// and a wrong pick about the right subject costs less than a lost answer.
export const CHECK_FOREIGN = true;
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
export function searchTerm(question) {
  const { base, focus, others } = focusOf(question);
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

// The sentences a node can choose between: its resolved children's findings
// (each already a cited sentence), then the excerpts it has observed, newest
// first. Every candidate carries the evidence it rests on.
export function candidates(run, node) {
  const out = [];
  for (const child of children(run, node.id)) {
    if (child.status === "resolved" && child.finding) out.push({ text: child.finding, evidence: [...child.evidence], from: "child", source: child.id });
  }
  for (const id of [...node.observed].reverse()) {
    const record = run.evidence.find((candidate) => candidate.id === id);
    if (!record) continue;
    for (const text of splitSentences(record.text)) out.push({ text, evidence: [id], from: "excerpt", source: record.title });
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
  const answer = async (askName, input, status) => {
    const definition = ASKS[askName].variants[variants[askName]];
    const meta = { ask: askName, variant: variants[askName], status };
    if (definition.run) return (await definition.run((call) => send(call, meta), input)).answer;
    const outputs = [];
    for (const call of definition.calls(input)) outputs.push((await send(call, meta)).text);
    return definition.combine(outputs, input);
  };

  const visible = () => [...new Set([...node.observed, ...children(run, node.id).filter((child) => child.status === "resolved").flatMap((child) => child.evidence)])];
  const lookup = async (query, readOn = null, { chosen = false } = {}) => {
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
      let chosen = await answer("article", { question: node.question, titles }, "Choosing an article");
      const fallback = chosen === "none" ? titles.find((title) => !isForeign(title, node.question)) ?? null : null;
      trace(run, "article_chosen", { node: node.id, query, titles, article: chosen, ...(fallback ? { readInstead: fallback } : {}) });
      if (fallback) chosen = fallback;
      if (chosen === "none") outcome = { ok: false, error: { kind: "no_match", message: `None of the articles found for “${query}” is about the question: ${titles.join(", ")}.` } };
      else if (chosen !== outcome.title) {
        outcome = await wiki(chosen, { signal });
        signal?.throwIfAborted();
        trace(run, "tool_result", { node: node.id, query: chosen, result: outcome });
      }
    }
    if (outcome.ok && node.observed.some((id) => run.evidence.find((record) => record.id === id)?.title === outcome.title)) {
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
    const { focus } = focusOf(node.question);
    const terms = [...new Set([searchTerm(node.question), focus ? focus.replace(/^the /, "") : String(node.question).trim()])];
    if (variants.article === "off" || !wiki.length || terms.length < 2) return lookup(terms[0]);
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
        applyResult(run, node.id, { action: "decompose", questions: subjects.map((subject) => `${String(node.question).trim()}${FOCUS}${subject}`) }, visible());
        onUpdate(node.id, "Split into one question per subject");
        return true;
      }
    }
    if (node.split && children(run, node.id).length) {
      const found = children(run, node.id).filter((child) => child.status === "resolved" && child.finding);
      if (found.length) {
        applyResult(run, node.id, { action: "resolved", finding: found.map((child) => child.finding).join(" "), evidence: [...new Set(found.flatMap((child) => child.evidence))] }, visible());
        onUpdate(node.id, "Findings gathered");
      } else {
        applyResult(run, node.id, { action: "blocked", reason: "Neither part of the question could be answered." }, visible());
        onUpdate(node.id, "Blocked");
      }
      return true;
    }
    // Nothing read and nothing found by children: the first lookup searches
    // for the question minus its question words and for the question itself
    // — neither term is right every time ("sky blue" finds the colour; the
    // raw Dead Sea question finds the Aral Sea) — and the article is picked
    // from every title both found.
    if (!node.observed.length && !children(run, node.id).length && lookups < run.limits.maxLookups) {
      if ((await firstLookup()) === "declined") return true;
    }
    if (!judgedByNode.has(node)) judgedByNode.set(node, new Set());
    const judged = judgedByNode.get(node);
    // Sentences picked and checked so far this visit; the finding is their
    // text, verbatim, in the order found. After a pick the walk asks again
    // over what remains until it says none or maxSentences is reached.
    const gathered = [];
    const resolveWith = () => {
      applyResult(run, node.id, { action: "resolved", finding: gathered.map((candidate) => candidate.text).join(" "), evidence: [...new Set(gathered.flatMap((candidate) => candidate.evidence))] }, visible());
      onUpdate(node.id, "Finding recorded");
      return true;
    };
    // A first answer is rarely the whole answer to a why-question: the Dead
    // Sea lead says it is receding, the section says why. While the finding
    // has room, lookups remain and the article has unread sections, the walk
    // reads one more (the model picks the heading) and asks again over it.
    const readOn = async () => {
      if (gathered.length >= (run.limits.maxSentences ?? 1) || lookups >= run.limits.maxLookups || passes >= run.limits.maxPasses) return false;
      const unread = unreadSections(run, node)[0];
      if (!unread) return false;
      const section = await answer("section", { question: node.question, article: unread.article, sections: unread.headings }, "Reading on");
      trace(run, "section_chosen", { node: node.id, article: unread.article, section, readOn: true });
      return (await lookup(`${unread.article} / ${section}`, { article: unread.article, section })) === "captured";
    };
    while (true) {
      signal?.throwIfAborted();
      const pool = candidates(run, node).filter((candidate) => !judged.has(candidate.text));
      if (pool.length && passes < run.limits.maxPasses && gathered.length < (run.limits.maxSentences ?? 1)) {
        const window = pool.slice(0, WINDOW);
        passes++;
        const pick = await answer("sentence", { question: node.question, sentences: window.map((candidate) => candidate.text), titles: window.map((candidate) => (candidate.from === "child" ? "a finding below" : String(candidate.source).split(" § ")[0])) }, gathered.length ? "Reading for more" : "Reading");
        trace(run, "sentence_picked", { node: node.id, pick, shown: window.length, gathered: gathered.length });
        if (pick !== "none") {
          const index = Number(pick) - 1;
          const chosen = window[index];
          if (!chosen) throw new Error(`The model picked sentence ${pick} of ${window.length}.`);
          if (CHECK_FOREIGN && variants.sentence !== "check" && chosen.from === "excerpt" && isForeign(chosen.source, node.question)) {
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
          continue;
        }
        if (gathered.length) {
          for (const candidate of window) judged.add(candidate.text);
          if (await readOn()) continue;
          return resolveWith();
        }
        for (const candidate of window) judged.add(candidate.text);
        continue;
      }
      if (gathered.length) {
        if (await readOn()) continue;
        return resolveWith();
      }
      // Nothing left to judge. A parent whose children answered resolves with
      // what they found: the answer to a decomposed question is its parts.
      const found = children(run, node.id).filter((child) => child.status === "resolved" && child.finding);
      if (found.length) {
        applyResult(run, node.id, { action: "resolved", finding: found.map((child) => child.finding).join(" "), evidence: [...new Set(found.flatMap((child) => child.evidence))] }, visible());
        onUpdate(node.id, "Findings gathered");
        return true;
      }
      if (lookups < run.limits.maxLookups && passes < run.limits.maxPasses) {
        const unread = unreadSections(run, node)[0];
        if (unread) {
          const section = await answer("section", { question: node.question, article: unread.article, sections: unread.headings }, "Choosing a section");
          trace(run, "section_chosen", { node: node.id, article: unread.article, section });
          if ((await lookup(`${unread.article} / ${section}`, { article: unread.article, section })) === "declined") return true;
          continue;
        }
        const search = await answer("missing", { question: node.question, sentences: readSentences() }, "Deciding what to look up");
        const tried = (node.failedLookups ?? []).some((entry) => normalise(entry.query) === normalise(search));
        const known = node.observed.some((id) => normalise(run.evidence.find((record) => record.id === id)?.article) === normalise(search));
        if (!tried && !known) {
          if ((await lookup(search)) === "declined") return true;
          continue;
        }
        recordFailedLookup(run, node.id, search, { kind: "no_match", message: known ? "Already read." : "Already tried." });
        lookups = run.limits.maxLookups; // nothing new to read here
      }
      const questionsAllowed = node.depth < run.limits.maxDepth ? Math.max(0, run.limits.maxNodes - run.nodes.length) : 0;
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
