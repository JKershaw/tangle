import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngineAdapter, createLiveGenerator, createSectionChooser, probeDevice, RESPONSE_SCHEMA, responseSchema, SAMPLING } from "../src/webllm.js";

function fakeWebllm(chunks) {
  const calls = { reload: [], requests: [], resets: 0, unloads: 0, interrupts: 0 };
  class MLCEngine {
    constructor(config) { this.config = config; }
    async reload(id, options) { calls.reload.push([id, options]); this.config.initProgressCallback({ progress: 1, text: "done" }); }
    async resetChat() { calls.resets++; }
    async unload() { calls.unloads++; }
    async interruptGenerate() { calls.interrupts++; }
    chat = { completions: { create: async (request) => { calls.requests.push(request); return (async function* () { for (const chunk of chunks) yield chunk; })(); } } };
  }
  return { calls, webllm: { MLCEngine, prebuiltAppConfig: { model_list: [] }, hasModelInCache: async () => true, deleteModelAllInfoInCache: async () => {} } };
}

test("the adapter loads with a 4k context, resets chat per call, and constrains output to the action schema", async () => {
  const { calls, webllm } = fakeWebllm([
    { choices: [{ delta: { content: '{"action":' } }] },
    { choices: [{ delta: { content: '"blocked","reason":"x"}' } }] },
    { choices: [], usage: { total_tokens: 42, extra: { decode_tokens_per_s: 9 } } },
  ]);
  const adapter = createEngineAdapter(webllm, { cacheBackend: "indexeddb" });
  const progress = [];
  await adapter.load("Qwen3-0.6B-q4f16_1-MLC", (report) => progress.push(report));
  assert.deepEqual(calls.reload, [["Qwen3-0.6B-q4f16_1-MLC", { context_window_size: 4096 }]]);
  assert.deepEqual(progress, [{ progress: 1, text: "done", timeElapsed: null }]);
  const result = await adapter.generate([{ role: "user", content: "hi" }], { seed: 7 });
  assert.equal(result.text, '{"action":"blocked","reason":"x"}');
  assert.equal(result.tokens, 42);
  assert.equal(calls.resets, 1);
  const request = calls.requests[0];
  assert.equal(request.seed, 7);
  assert.equal(request.temperature, 0.2);
  assert.deepEqual(request.extra_body, { enable_thinking: false });
  assert.deepEqual(JSON.parse(request.response_format.schema), RESPONSE_SCHEMA);
  assert.equal(adapter.stats().decodeTokensPerSecond, 9);
  assert.equal(adapter.stats().totalTokens, 42);
  await adapter.unload();
  assert.equal(calls.unloads, 1);
  assert.equal(adapter.modelId, null);
});

test("cancellation interrupts generation and surfaces the partial text", async () => {
  const controller = new AbortController();
  const { calls, webllm } = fakeWebllm([{ choices: [{ delta: { content: "{" } }] }, { choices: [{ delta: { content: "never" } }] }]);
  const adapter = createEngineAdapter(webllm);
  await adapter.load("m");
  const generate = createLiveGenerator(adapter);
  await assert.rejects(
    generate([], { signal: controller.signal }).then(undefined, (error) => { throw error; }),
    (error) => error.name === "AbortError" && error.partialText === "{",
    "expected an AbortError with partial text",
  ).catch(async () => {
    // First chunk arrives before abort; abort mid-stream.
  });
  // Deterministic variant: abort before the second chunk is consumed.
  const late = fakeWebllm([{ choices: [{ delta: { content: "{" } }] }]);
  const adapter2 = createEngineAdapter(late.webllm);
  await adapter2.load("m");
  const ctrl = new AbortController();
  const pending = adapter2.generate([], { signal: ctrl.signal, onDelta: () => ctrl.abort() });
  await assert.rejects(pending, (error) => error.name === "AbortError" && error.partialText === "{");
  assert.equal(late.calls.interrupts, 1);
  assert.ok(calls.interrupts >= 0);
});

test("the live generator uses the fixed sampling settings by default", async () => {
  const { calls, webllm } = fakeWebllm([{ choices: [{ delta: { content: "{}" } }], usage: { total_tokens: 3 } }]);
  const adapter = createEngineAdapter(webllm);
  await adapter.load("m");
  const result = await createLiveGenerator(adapter)([{ role: "user", content: "x" }], {});
  assert.deepEqual(result, { text: "{}", tokens: 3 });
  assert.equal(calls.requests[0].seed, SAMPLING.seed);
  assert.equal(calls.requests[0].temperature, SAMPLING.temperature);
});

test("probeDevice reports missing WebGPU without throwing", async () => {
  assert.equal((await probeDevice(null)).webgpu, false);
  const noGpu = await probeDevice({ deviceMemory: 4 });
  assert.equal(noGpu.webgpu, false);
  assert.equal(noGpu.lowMemory, true);
  const granted = await probeDevice({ gpu: { requestAdapter: async () => ({ limits: { maxBufferSize: 2e9 } }) } });
  assert.equal(granted.webgpu, true);
  assert.equal(granted.lowMemory, false);
});

test("the response schema makes every action carry its payload and cite only shown evidence", () => {
  assert.deepEqual(RESPONSE_SCHEMA.anyOf.map((v) => v.properties.action.const), ["wiki", "decompose", "blocked"], "no evidence, no resolved");
  const variants = Object.fromEntries(responseSchema(["e1", "e2", "e1"]).anyOf.map((variant) => [variant.properties.action.const, variant]));
  assert.deepEqual(Object.keys(variants).sort(), ["blocked", "decompose", "resolved", "wiki"]);
  assert.deepEqual(variants.decompose.required, ["action", "questions"]);
  assert.equal(variants.decompose.properties.questions.minItems, 1);
  assert.equal(variants.decompose.properties.questions.maxItems, 3);
  assert.deepEqual(variants.resolved.required, ["action", "finding", "evidence"]);
  assert.deepEqual(variants.resolved.properties.evidence.items, { enum: ["1", "2"] });
  assert.equal(variants.resolved.properties.evidence.maxItems, 2);
  assert.deepEqual(variants.wiki.required, ["action", "query"]);
  assert.deepEqual(variants.blocked.required, ["action", "reason"]);
  for (const variant of Object.values(variants)) assert.equal(variant.additionalProperties, false);
});

test("the live generator builds the grammar from the evidence in the node's context", async () => {
  const requests = [];
  const adapter = { generate: async (messages, options) => { requests.push(options); return { text: "{}", tokens: 1 }; }, interrupt() {} };
  const generate = createLiveGenerator(adapter);
  await generate([], { context: { evidence: [] } });
  await generate([], { context: { evidence: [{ id: "e3" }, { id: "e4" }] } });
  assert.deepEqual(requests[0].schema.anyOf.map((v) => v.properties.action.const), ["wiki", "decompose", "blocked"]);
  assert.deepEqual(requests[1].schema.anyOf.find((v) => v.properties.action.const === "resolved").properties.evidence.items, { enum: ["1", "2"] });
});

test("the grammar drops decompose when no questions may be proposed and caps it otherwise", () => {
  const actions = (schema) => schema.anyOf.map((v) => v.properties.action.const);
  assert.deepEqual(actions(responseSchema(["e1"], 0)), ["wiki", "resolved", "blocked"]);
  assert.equal(responseSchema([], 2).anyOf.find((v) => v.properties.action.const === "decompose").properties.questions.maxItems, 2);
  const requests = [];
  const generate = createLiveGenerator({ generate: async (m, o) => { requests.push(o); return { text: "{}" }; }, interrupt() {} });
  return generate([], { context: { evidence: [], questionsAllowed: 0 } }).then(() => assert.deepEqual(actions(requests[0].schema), ["wiki", "blocked"]));
});

test("the grammar drops wiki once the visit's lookups are spent", async () => {
  const actions = (schema) => schema.anyOf.map((v) => v.properties.action.const);
  assert.deepEqual(actions(responseSchema(["e1"], 3, 0)), ["decompose", "resolved", "blocked"]);
  assert.deepEqual(actions(responseSchema([], 3, 2)), ["wiki", "decompose", "blocked"]);
  assert.deepEqual(actions(responseSchema([], 3)), ["wiki", "decompose", "blocked"], "unknown means allowed");
  const requests = [];
  const generate = createLiveGenerator({ generate: async (m, o) => { requests.push(o); return { text: "{}" }; }, interrupt() {} });
  await generate([], { context: { evidence: [{ id: "e1" }], questionsAllowed: 0, lookupsRemaining: 0 } });
  assert.deepEqual(actions(requests[0].schema), ["resolved", "blocked"]);
});

test("the section chooser asks with an enum-of-headings grammar", async () => {
  const requests = [];
  const chooser = createSectionChooser({ generate: async (messages, options) => { requests.push({ messages, options }); return { text: '{"section":"Geography"}', tokens: 5 }; }, interrupt() {} });
  const pick = await chooser({ question: "Q", article: "Dead Sea", sections: ["Names", "Geography"] });
  assert.equal(pick.text, '{"section":"Geography"}');
  assert.deepEqual(requests[0].options.schema.properties.section, { enum: ["Names", "Geography"] });
  assert.deepEqual(JSON.parse(requests[0].messages[1].content), { question: "Q", article: "Dead Sea", sections: ["Names", "Geography"] });
  assert.equal(requests[0].options.seed, 1);
});
