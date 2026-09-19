import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ENDPOINT, NO_THINKING, createEndpointAdapter, requestBody, toolCallsOf } from "../src/endpoint.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

// A fake OpenAI-compatible server: lists two models, answers every chat call
// with the same JSON, and remembers what it was sent.
function fakeServer({ answer = { sentence: "2" }, status = 200, delayMs = 0 } = {}) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, method: init.method ?? "GET", headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith("/models")) return json({ object: "list", data: [{ id: "qwen3:8b" }, { id: "qwen3:1.7b" }] });
    if (delayMs) await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, delayMs);
      init.signal?.addEventListener("abort", () => (clearTimeout(timer), reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    });
    if (status !== 200) return json({ error: { message: "model is busy" } }, status);
    return json({ choices: [{ message: { role: "assistant", content: JSON.stringify(answer) } }], usage: { prompt_tokens: 30, completion_tokens: 5, total_tokens: 35 } });
  };
  return { fetchImpl, requests };
}

const schema = { type: "object", properties: { sentence: { enum: ["1", "2", "none"] } }, required: ["sentence"], additionalProperties: false };

test("the endpoint adapter checks the model is served, then sends each ask as one schema-constrained request with the fixed sampling", async () => {
  const { fetchImpl, requests } = fakeServer();
  const adapter = createEndpointAdapter({ url: "http://127.0.0.1:11434/v1/", fetchImpl });
  assert.equal(adapter.url, "http://127.0.0.1:11434/v1");
  await assert.rejects(adapter.generate([{ role: "user", content: "hi" }]), /No model is loaded/);
  await assert.rejects(adapter.load("qwen3:32b"), /does not serve "qwen3:32b". It serves: qwen3:8b, qwen3:1.7b/);
  await adapter.load("qwen3:8b");
  assert.equal(adapter.modelId, "qwen3:8b");
  const messages = [{ role: "system", content: "Pick." }, { role: "user", content: "1. a\n2. b" }];
  const result = await adapter.generate(messages, { schema, maxTokens: 24, seed: 1, temperature: 0.2 });
  assert.deepEqual(result, { text: '{"sentence":"2"}', tokens: 35, usage: { prompt_tokens: 30, completion_tokens: 5, total_tokens: 35 } });
  const call = requests.at(-1);
  assert.equal(call.url, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(call.method, "POST");
  assert.equal(call.headers["content-type"], "application/json");
  assert.deepEqual(call.body, { model: "qwen3:8b", messages, stream: false, temperature: 0.2, max_tokens: 24, seed: 1, ...NO_THINKING, response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema } } });
  assert.deepEqual(adapter.stats(), { modelId: "qwen3:8b", totalTokens: 35, calls: 1, lastUsage: result.usage });
  await adapter.unload();
  assert.equal(adapter.modelId, null);
});

test("a server error is an error with the server's message; cancellation is an AbortError; a slow answer hits the time limit", async () => {
  const busy = fakeServer({ status: 503 });
  const adapter = createEndpointAdapter({ url: DEFAULT_ENDPOINT, fetchImpl: busy.fetchImpl });
  await adapter.load("qwen3:1.7b");
  await assert.rejects(adapter.generate([{ role: "user", content: "hi" }], { schema }), /chat\/completions answered 503: model is busy/);

  const slow = fakeServer({ delayMs: 200 });
  const cancellable = createEndpointAdapter({ url: DEFAULT_ENDPOINT, fetchImpl: slow.fetchImpl, timeoutMs: 50 });
  await cancellable.load("qwen3:1.7b");
  await assert.rejects(cancellable.generate([{ role: "user", content: "hi" }], { schema }), /Generation time limit reached \(0.05 seconds\)/);
  const controller = new AbortController();
  const pending = cancellable.generate([{ role: "user", content: "hi" }], { schema, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.equal(cancellable.stats().calls, 0);
});

test("an API key becomes a bearer header, and a request body without a schema carries no response_format", async () => {
  const { fetchImpl, requests } = fakeServer();
  const adapter = createEndpointAdapter({ url: "https://openrouter.ai/api/v1", fetchImpl, apiKey: "k" });
  await adapter.load("qwen3:8b");
  assert.equal(requests[0].headers.authorization, "Bearer k");
  const body = requestBody("m", [{ role: "user", content: "x" }], { extra: {} });
  assert.deepEqual(body, { model: "m", messages: [{ role: "user", content: "x" }], stream: false, temperature: 0.2, max_tokens: 420 });
});

test("with tools offered, the request carries them and the response's tool calls come back parsed, in order", async () => {
  const { fetchImpl, requests } = fakeServer();
  const tools = [{ type: "function", function: { name: "search", description: "Search.", parameters: { type: "object", properties: { term: { type: "string" } }, required: ["term"] } } }];
  const adapter = createEndpointAdapter({ url: "http://127.0.0.1:11434/v1", fetchImpl });
  await adapter.load("qwen3:8b");
  const plain = await adapter.generate([{ role: "user", content: "hi" }], { tools });
  assert.deepEqual(requests.at(-1).body.tools, tools);
  assert.equal("toolCalls" in plain, false, "no tool calls when the model answered in words");
  assert.deepEqual(toolCallsOf({ tool_calls: [{ id: "c1", type: "function", function: { name: "search", arguments: '{"term":"x"}' } }, { function: { name: "read", arguments: "not json" } }] }), [
    { id: "c1", name: "search", arguments: { term: "x" } },
    { id: "call_2", name: "read", arguments: { raw: "not json" } },
  ]);
  assert.equal("tools" in requestBody("m", [], {}), false, "the walk's requests carry no tools");
});
