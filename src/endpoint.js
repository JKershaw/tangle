// The second model adapter: an OpenAI-compatible chat endpoint (Ollama,
// llama.cpp's server, vLLM, OpenRouter) behind the surface of the WebLLM
// adapter in webllm.js — load, generate, stats, interrupt — so the walk runs
// unchanged in Node (scripts/node-lab.mjs). The page never imports this. One
// call is one request carrying the ask's JSON schema, so the server constrains
// the output the way the page's grammar does; the harness still validates
// what comes back, as it does for the page.
import { CONTEXT_WINDOW, GENERATION_TIMEOUT_MS, MAX_ACTION_TOKENS, SAMPLING } from "./webllm.js";

export const DEFAULT_ENDPOINT = "http://127.0.0.1:11434/v1";
// Qwen3 thinks before it answers unless told not to, and the thinking is
// billed against max_tokens: with the soft switch alone (/no_think at the
// end of every ask, asks.js) Ollama 0.34 answered a 24-token sentence pick
// with 24 tokens of reasoning and no content. On its OpenAI route Ollama
// reads reasoning_effort ("none" stops it; `think` is ignored there);
// llama.cpp and vLLM read chat_template_kwargs. A server that does not know
// a field ignores it.
export const NO_THINKING = Object.freeze({ reasoning_effort: "none", chat_template_kwargs: { enable_thinking: false } });

// tools: OpenAI function definitions, for the tool control (scripts/tools.mjs)
// only; the walk never offers the model a tool.
export function requestBody(model, messages, { schema = null, maxTokens = MAX_ACTION_TOKENS, temperature = SAMPLING.temperature, seed = null, tools = null, extra = NO_THINKING } = {}) {
  const body = { model, messages, stream: false, temperature, max_tokens: maxTokens, ...extra };
  if (Number.isInteger(seed)) body.seed = seed;
  if (schema) body.response_format = { type: "json_schema", json_schema: { name: "answer", strict: true, schema } };
  if (tools?.length) body.tools = tools;
  return body;
}

// The tool calls of a response, each with its arguments parsed (or kept as
// the raw string when they are not JSON), in the order the model made them.
export function toolCallsOf(message) {
  return (message?.tool_calls ?? []).map((call, index) => {
    let args = call.function?.arguments ?? {};
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        args = { raw: args };
      }
    }
    return { id: String(call.id ?? `call_${index + 1}`), name: String(call.function?.name ?? ""), arguments: args };
  });
}

// contextWindow is what the server was started with (OLLAMA_CONTEXT_LENGTH):
// the adapter cannot ask, so the caller says, and the replay keys on it.
export function createEndpointAdapter({ url = DEFAULT_ENDPOINT, fetchImpl = globalThis.fetch, apiKey = null, headers = {}, timeoutMs = GENERATION_TIMEOUT_MS, extra = NO_THINKING, contextWindow = CONTEXT_WINDOW } = {}) {
  const base = String(url).replace(/\/+$/, "");
  const inFlight = new Set();
  let modelId = null;
  let lastUsage = null;
  let totalTokens = 0;
  let calls = 0;
  const request = async (path, init = {}) => {
    const response = await fetchImpl(base + path, {
      ...init,
      headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}), ...headers, ...(init.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${base}${path} answered ${response.status}: ${body?.error?.message ?? JSON.stringify(body).slice(0, 200)}`);
    return body;
  };
  return {
    get modelId() {
      return modelId;
    },
    url: base,
    // What shapes every answer besides the call itself (src/replay.js keys on it).
    config: { extra, contextWindow },
    // What the server serves (GET /models), so a typo is an error before a run.
    async models() {
      const body = await request("/models");
      return (body.data ?? []).map((model) => String(model.id));
    },
    async load(id) {
      const served = await this.models();
      if (!served.includes(id)) throw new Error(`${base} does not serve "${id}". It serves: ${served.join(", ") || "nothing"}.`);
      modelId = id;
      lastUsage = null;
      totalTokens = 0;
      calls = 0;
    },
    async unload() {
      this.interrupt();
      modelId = null;
    },
    interrupt() {
      for (const controller of inFlight) controller.abort();
    },
    stats() {
      return { modelId, totalTokens, calls, lastUsage };
    },
    // One completion. Resolves to { text, tokens, usage } and, when tools were
    // offered and used, toolCalls. Rejects with an AbortError when cancelled,
    // like the WebLLM adapter.
    async generate(messages, { signal, maxTokens = MAX_ACTION_TOKENS, temperature = SAMPLING.temperature, seed = null, schema = null, tools = null } = {}) {
      if (!modelId) throw new Error("No model is loaded yet.");
      const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError", partialText: "" });
      if (signal?.aborted) throw abortError();
      const controller = new AbortController();
      inFlight.add(controller);
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const forward = () => controller.abort();
      signal?.addEventListener("abort", forward, { once: true });
      try {
        const body = await request("/chat/completions", { method: "POST", body: JSON.stringify(requestBody(modelId, messages, { schema, maxTokens, temperature, seed, tools, extra })), signal: controller.signal });
        const message = body.choices?.[0]?.message ?? {};
        lastUsage = body.usage ?? null;
        const tokens = lastUsage?.total_tokens ?? null;
        if (tokens) totalTokens += tokens;
        calls++;
        const toolCalls = toolCallsOf(message);
        return { text: String(message.content ?? ""), tokens, usage: lastUsage, ...(toolCalls.length ? { toolCalls } : {}) };
      } catch (error) {
        if (timedOut) throw Object.assign(new Error(`Generation time limit reached (${timeoutMs / 1000} seconds).`), { partialText: "" });
        if (signal?.aborted || error?.name === "AbortError") throw abortError();
        throw error;
      } finally {
        clearTimeout(timer);
        inFlight.delete(controller);
        signal?.removeEventListener("abort", forward);
      }
    },
  };
}
