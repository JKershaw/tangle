// The tool control (ROADMAP milestone 5b): the same model, the same four
// source requests as tools, one context, driving itself, matched to the
// graph's row on calls and tokens. It is the control the graph has to beat:
// what people actually run with a small model. Two variants. Composing:
// the model writes its answer and is graded on what it names; its evidence
// is everything it read, so "supported" there means "named and read", not
// cited. Cited: the answer is cut to the sentences that appear word for
// word in what was read, each cited to its record, and graded as the graph
// is. The context window is the walk's (CONTEXT_WINDOW tokens); when the
// transcript outgrows it the oldest tool results are dropped, and the run
// says how many. Node only; the page never offers the model a tool.
import { NO_THINK, unitsOf } from "../src/asks.js";
import { CONTEXT_WINDOW } from "../src/webllm.js";

export const TOOLS_VERSION = "tools-1";
// About four characters a token for English prose under Qwen's tokeniser;
// the answer needs room at the end.
export const CONTEXT_CHARS = CONTEXT_WINDOW * 3;
export const RESULT_CHARS = 2400;
export const DEFAULT_BUDGET = Object.freeze({ question: { calls: 8, tokens: 20000 }, brief: { calls: 40, tokens: 60000 } });
const DROPPED = "[dropped to fit the context window]";

const parameters = (properties) => ({ type: "object", properties, required: Object.keys(properties) });
export const TOOL_DEFINITIONS = Object.freeze([
  { type: "function", function: { name: "search", description: "Search the source. Returns up to five titles, each with a line from it.", parameters: parameters({ term: { type: "string", description: "what to search for" } }) } },
  { type: "function", function: { name: "read", description: "Read the opening of an article and the list of its section headings.", parameters: parameters({ title: { type: "string", description: "an exact title from a search" } }) } },
  { type: "function", function: { name: "section", description: "Read one section of an article.", parameters: parameters({ title: { type: "string" }, heading: { type: "string", description: "a heading from the article's list" } }) } },
  { type: "function", function: { name: "about", description: "Read the part of an article that is about a phrase.", parameters: parameters({ title: { type: "string" }, phrase: { type: "string" } }) } },
]);

const SYSTEM = {
  question: "Answer the question using the tools. Read before you answer. When you have what you need, answer in two or three sentences from what you read, naming the specific causes, places, processes or people involved.",
  brief: "Write a short profile answering the brief using the tools. Read before you write. When you have what you need, write several short paragraphs from what you read, naming the specific works, events, places, people and consequences involved.",
};
const CITED = " Use only sentences copied word for word from what you read.";
const answerSchema = (kind) => ({ type: "object", properties: { answer: { type: "string", maxLength: kind === "brief" ? 6000 : 900 } }, required: ["answer"], additionalProperties: false });
const answerTokens = (kind) => (kind === "brief" ? 1500 : 320);

const clip = (text, limit) => (String(text ?? "").length > limit ? String(text).slice(0, limit) + " […]" : String(text ?? ""));
const chars = (messages) => messages.reduce((total, message) => total + String(message.content ?? "").length + (message.tool_calls ? JSON.stringify(message.tool_calls).length : 0), 0);
const normal = (text) => String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
// A sentence is verbatim without its closing punctuation: the record may
// carry on where the model's sentence stopped.
const wanted = (sentence) => normal(sentence).replace(/[.!?;:,]+$/, "");

// Runs one tool against the source driver. Returns what the model is shown
// and, for a read, the evidence record to capture.
export async function runTool(wiki, call, { signal, resultChars = RESULT_CHARS } = {}) {
  const args = call.arguments ?? {};
  const text = (value) => String(value ?? "").trim();
  const failed = (found, what) => `Nothing found for ${what}${found?.error?.message ? `: ${found.error.message}` : found?.message ? `: ${found.message}` : "."}`;
  try {
    if (call.name === "search") {
      const term = text(args.term);
      if (!term) return { shown: "search needs a term." };
      const found = await wiki(term, { signal, searchOnly: true });
      if (!found?.ok) return { shown: failed(found, `"${term}"`) };
      return { shown: found.hits.map((title, index) => `${index + 1}. ${title}${found.snippets?.[index] ? ` — ${clip(found.snippets[index], 160)}` : ""}`).join("\n") };
    }
    if (!["read", "section", "about"].includes(call.name)) return { shown: `No tool named ${call.name}.` };
    const title = text(args.title);
    if (!title) return { shown: `${call.name} needs a title.` };
    let found;
    if (call.name === "read") found = await wiki(title, { signal });
    else if (call.name === "section") found = await wiki(title, { signal, readOn: { article: title, section: text(args.heading) || 1 } });
    else found = await wiki(title, { signal, readOn: { article: title, section: 0, about: text(args.phrase) } });
    if (!found?.ok || !found.text) return { shown: failed(found, `"${title}"`) };
    const headings = call.name === "read" && found.headings?.length ? `\n\nSections: ${found.headings.join("; ")}` : "";
    const evidence = { kind: call.name, tool: found.tool ?? "wiki", article: found.article ?? found.title, title: found.title, text: found.text, url: found.url ?? null, ...(found.lines ? { lines: true } : {}) };
    return { shown: `${found.title}\n\n${clip(found.text, resultChars)}${headings}`, evidence };
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") throw error;
    return { shown: `The tool failed: ${error?.message ?? error}` };
  }
}

// Drops the oldest tool results until the transcript fits. Returns how many.
export function trimToFit(messages, contextChars) {
  let dropped = 0;
  while (chars(messages) > contextChars) {
    const oldest = messages.find((message) => message.role === "tool" && message.content !== DROPPED);
    if (!oldest) break;
    oldest.content = DROPPED;
    dropped++;
  }
  return dropped;
}

// The cited variant's cut: each sentence of the answer that some record
// holds word for word, in the answer's order and paragraphs, cited to the
// first record that holds it.
export function citedCut(answer, records) {
  const normalised = records.map((record) => normal(record.text));
  const evidence = [];
  const paragraphs = [];
  for (const paragraph of String(answer ?? "").split(/\n\s*\n/)) {
    const kept = [];
    for (const sentence of unitsOf(paragraph)) {
      const needle = wanted(sentence);
      if (needle.length < 12) continue;
      const index = normalised.findIndex((text) => text.includes(needle));
      if (index < 0) continue;
      kept.push(sentence.trim());
      if (!evidence.includes(records[index].id)) evidence.push(records[index].id);
    }
    if (kept.length) paragraphs.push(kept.join(" "));
  }
  return { finding: paragraphs.join("\n\n"), evidence };
}

// One run. generate(messages, options) is the adapter's; wiki the source
// driver. Resolves to an export shaped like a walk's, so gradeRun reads it.
export async function runTools(seed, { generate, wiki, kind = "question", cited = false, budget = null, contextChars = CONTEXT_CHARS, resultChars = RESULT_CHARS, signal = null, onUpdate = null } = {}) {
  const limits = { ...DEFAULT_BUDGET[kind === "brief" ? "brief" : "question"], ...(budget ?? {}) };
  const created = new Date().toISOString();
  const trace = [];
  const evidence = [];
  const messages = [
    { role: "system", content: SYSTEM[kind === "brief" ? "brief" : "question"] + (cited ? CITED : "") + NO_THINK },
    { role: "user", content: String(seed) },
  ];
  let modelCalls = 0;
  let tokens = 0;
  let lookups = 0;
  let dropped = 0;
  let answer = "";
  let stoppedBy = "answer";
  const log = (event, detail) => trace.push({ seq: trace.length + 1, time: new Date().toISOString(), event, node: "n1", ...detail });
  for (;;) {
    signal?.throwIfAborted();
    const last = limits.calls - modelCalls <= 1 || tokens >= limits.tokens;
    if (last) stoppedBy = tokens >= limits.tokens ? "tokens" : "calls";
    const options = last ? { schema: answerSchema(kind), maxTokens: answerTokens(kind) } : { tools: [...TOOL_DEFINITIONS], maxTokens: 400 };
    log("model_input", { ask: last ? "answer" : "tools", messages: messages.length, chars: chars(messages) });
    const started = performance.now();
    const output = await generate(messages, { ...options, signal });
    modelCalls++;
    if (Number.isFinite(output.tokens)) tokens += output.tokens;
    log("model_output", { ask: last ? "answer" : "tools", raw: output.text, toolCalls: output.toolCalls ?? null, tokens: output.tokens ?? null, latencyMs: Math.round(performance.now() - started), replayed: output.replayed ?? false });
    if (!last && output.toolCalls?.length) {
      messages.push({ role: "assistant", content: output.text || "", tool_calls: output.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) } })) });
      for (const call of output.toolCalls) {
        onUpdate?.("n1", `${call.name} ${JSON.stringify(call.arguments ?? {})}`);
        const result = await runTool(wiki, call, { signal, resultChars });
        lookups++;
        if (result.evidence) {
          const record = { ...result.evidence, id: "e" + (evidence.length + 1), capturedAt: new Date().toISOString(), node: "n1" };
          evidence.push(record);
          log("evidence_captured", { evidence: record.id, kind: record.kind, title: record.title });
        }
        log("tool_result", { tool: call.name, arguments: call.arguments ?? {}, evidence: result.evidence ? evidence.at(-1).id : null, shown: result.shown.length });
        messages.push({ role: "tool", tool_call_id: call.id, content: result.shown });
      }
      const trimmed = trimToFit(messages, contextChars);
      if (trimmed) {
        dropped += trimmed;
        log("context_trimmed", { dropped: trimmed });
      }
      continue;
    }
    if (last) {
      try {
        answer = String(JSON.parse(String(output.text ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim()).answer ?? "");
      } catch {
        answer = String(output.text ?? "");
      }
    } else answer = String(output.text ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    break;
  }
  const cut = cited ? citedCut(answer, evidence) : { finding: answer.trim(), evidence: evidence.map((record) => record.id) };
  const resolved = Boolean(cut.finding);
  const root = { id: "n1", parent: null, depth: 0, question: String(seed), status: resolved ? "resolved" : "blocked", finding: resolved ? cut.finding : "", evidence: resolved ? cut.evidence : [], observed: evidence.map((record) => record.id), reason: resolved ? "" : cited ? "Nothing in the answer appears word for word in what was read." : "No answer." };
  return { seed: String(seed), mode: cited ? "tools-cited" : "tools", kind, created, limits, nodes: [root], evidence, trace, visits: modelCalls, modelCalls, lookups, tokens, stopReason: null, answer, stoppedBy, dropped, transcript: messages };
}
