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

export const WALK_VERSION = "walk-1";
// Which variant of each ask the walk uses; the node evals choose these
// (evals/node/results.md). Overridable per run for A/B comparison.
export const DEFAULT_VARIANTS = Object.freeze({ sentence: "list", section: "list", missing: "search", question: "one" });
// How many sentences one pick sees. Beyond this, the walk asks again over the
// next window; a visit's passes bound how far it reads.
export const WINDOW = 12;
export const MIN_FINDING_WORDS = 6;

// The first lookup is code: the question minus its question words. The raw
// question sent to Wikipedia's search found the Aral Sea for "Why is the Dead
// Sea shrinking?" (experiments/2026-09-18-qwen3-1.7b-dead-sea-walk-1); the
// stripped term finds the Dead Sea, and the same rule finds the right article
// for every benchmark seed tried.
const QUESTION_WORDS = new Set("why is are was were the a an does do did how what which who whom when where keep going happen happened happens it its there so much many still".split(" "));
export function searchTerm(question) {
  const words = String(question ?? "").replace(/[?.!,;:"“”]/g, "").split(/\s+/).filter(Boolean);
  const kept = words.filter((word) => !QUESTION_WORDS.has(word.toLowerCase()));
  return (kept.length ? kept : words).join(" ").trim();
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

export function isRepeat(run, node, question) {
  const wanted = normalise(question);
  if (!wanted) return true;
  for (let current = node; current; current = run.nodes.find((candidate) => candidate.id === current.parent)) {
    if (normalise(current.question) === wanted) return true;
  }
  return children(run, node.id).some((child) => normalise(child.question) === wanted);
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
  const lookup = async (query, readOn = null) => {
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
  const readSentences = () => candidates(run, node).map((candidate) => candidate.text);

  try {
    // Nothing read and nothing found by children: the first lookup is the
    // question minus its question words. No model call.
    if (!node.observed.length && !children(run, node.id).length && lookups < run.limits.maxLookups) {
      if ((await lookup(searchTerm(node.question))) === "declined") return true;
    }
    const judged = new Set();
    while (true) {
      signal?.throwIfAborted();
      const pool = candidates(run, node).filter((candidate) => !judged.has(candidate.text));
      if (pool.length && passes < run.limits.maxPasses) {
        const window = pool.slice(0, WINDOW);
        passes++;
        const pick = await answer("sentence", { question: node.question, sentences: window.map((candidate) => candidate.text), titles: window.map((candidate) => (candidate.from === "child" ? "a finding below" : String(candidate.source).split(" § ")[0])) }, "Reading");
        trace(run, "sentence_picked", { node: node.id, pick, shown: window.length });
        if (pick !== "none") {
          const index = Number(pick) - 1;
          const chosen = window[index];
          if (!chosen) throw new Error(`The model picked sentence ${pick} of ${window.length}.`);
          let finding = chosen.text;
          // A finding is a sentence, not a fragment (validateResult). A very
          // short pick keeps its neighbour for context — still verbatim.
          if (finding.split(/\s+/).length < MIN_FINDING_WORDS && index > 0 && window[index - 1].evidence[0] === chosen.evidence[0]) finding = `${window[index - 1].text} ${finding}`;
          applyResult(run, node.id, { action: "resolved", finding, evidence: chosen.evidence }, visible());
          onUpdate(node.id, "Finding recorded");
          return true;
        }
        for (const candidate of window) judged.add(candidate.text);
        continue;
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
        if (!isRepeat(run, node, question) && (question.match(/\?/g) || []).length <= 1) {
          applyResult(run, node.id, { action: "decompose", questions: [question] }, visible());
          onUpdate(node.id, "New question added");
          return true;
        }
        trace(run, "question_rejected", { node: node.id, question, reason: "repeat" });
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
