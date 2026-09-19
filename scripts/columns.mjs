// The benchmark's columns (REVIEW.md, step 5): one function per column,
// each turning a seed into an export shaped like a walk's run, so eval.mjs
// grades every column the same way (grade.js gradeRun) and writes one row.
//   tangle       the walk with its default limits
//   flat         the walk on one node, more lookups: the structure control
//   closed       the model alone, no tools: what it knows
//   tools        the same model with the four source requests as tools in
//                one context, composing (scripts/tools.mjs)
//   tools-cited  the same, cut to sentences read word for word
import { FLAT_LIMITS } from "./grade.js";
import { runTools } from "./tools.mjs";

export const COLUMNS = Object.freeze(["tangle", "flat", "closed", "tools", "tools-cited"]);

// The closed-book control: one call, the question, no evidence. The answer is
// a short JSON string so the same grammar path and token cap apply. A brief
// gets room for a profile: the same characters the graph may gather.
export const CLOSED_VERSION = "closed-1";
export const CLOSED_PROFILE_VERSION = "closed-profile-1";
const CLOSED_SYSTEM = "Answer the question in two or three sentences from what you know. Name the specific causes, places, processes or people involved.";
const CLOSED_PROFILE_SYSTEM = "Write a short profile answering the brief from what you know, in several short paragraphs. Name the specific works, events, places, people and consequences involved.";
export const closedCall = (seed) =>
  seed.kind === "brief"
    ? { messages: [{ role: "system", content: CLOSED_PROFILE_SYSTEM }, { role: "user", content: seed.seed }], schema: { type: "object", properties: { answer: { type: "string", maxLength: 6000 } }, required: ["answer"], additionalProperties: false }, maxTokens: 1500 }
    : { messages: [{ role: "system", content: CLOSED_SYSTEM }, { role: "user", content: seed.seed }], schema: { type: "object", properties: { answer: { type: "string", maxLength: 900 } }, required: ["answer"], additionalProperties: false }, maxTokens: 320 };

export const limitsFor = (mode, { matched = null } = {}) => (mode === "flat" ? FLAT_LIMITS : mode === "closed" ? { closed: true } : mode.startsWith("tools") ? { tools: mode, matched } : {});

const answerOf = (raw) => {
  const text = String(raw ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  try {
    return String(JSON.parse(text).answer ?? "");
  } catch {
    return text;
  }
};

// An export shaped like a run for a column that has no graph: one node,
// resolved when it answered, no evidence, its one call traced.
const oneNodeExport = (seed, mode, { text, tokens = 0, replayed = false, error = null, extra = {} }) => ({
  seed: seed.seed,
  mode,
  created: new Date().toISOString(),
  nodes: [{ id: "n1", parent: null, depth: 0, question: seed.seed, status: error ? "error" : text.trim() ? "resolved" : "blocked", finding: text.trim(), evidence: [], observed: [], reason: error ?? (text.trim() ? "" : "No answer.") }],
  evidence: [],
  trace: [{ seq: 1, time: new Date().toISOString(), event: "model_output", node: "n1", ask: mode, raw: text, tokens, replayed }],
  visits: 1,
  modelCalls: error ? 0 : 1,
  lookups: 0,
  tokens,
  stopReason: null,
  ...extra,
});

// Runs one seed in one column. Resolves to { exported, outcome, retriesUsed,
// wallSeconds }; the export carries `replay` from the lab where it can.
export async function runColumn(mode, seed, lab, { retries = 2, runTimeoutMs = 45 * 60000, budget = null, note = () => {} } = {}) {
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 1000);
  if (mode === "closed") {
    let output;
    try {
      output = await lab.ask(closedCall(seed));
    } catch (error) {
      output = { text: "", error: String(error?.message || error) };
    }
    const exported = oneNodeExport(seed, mode, { text: answerOf(output.text), tokens: output.tokens ?? 0, replayed: Boolean(output.replayed), error: output.error ?? null, extra: { raw: output.text ?? "", latencyMs: output.latencyMs ?? null } });
    return { exported, outcome: exported.nodes[0].status === "resolved" ? "answered" : exported.nodes[0].status, retriesUsed: 0, wallSeconds: seconds() };
  }
  if (mode.startsWith("tools")) {
    let exported;
    try {
      exported = await runTools(seed.seed, { generate: lab.generate, wiki: lab.wiki(), kind: seed.kind === "brief" ? "brief" : "question", cited: mode === "tools-cited", budget });
    } catch (error) {
      exported = oneNodeExport(seed, mode, { text: "", error: String(error?.message || error), extra: { stoppedBy: "error", dropped: 0, refused: 0 } });
    }
    return { exported, outcome: exported.nodes[0].status === "resolved" ? "root resolved" : `root ${exported.nodes[0].status}`, retriesUsed: 0, wallSeconds: seconds() };
  }
  await lab.newLive(seed.seed, limitsFor(mode));
  const { outcome, retriesUsed, wallSeconds } = await lab.runToEnd({ retries, runTimeoutMs, note });
  return { exported: await lab.exportRun(), outcome, retriesUsed, wallSeconds };
}
