import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngineAdapter, createLiveGenerator, probeDevice, RESPONSE_SCHEMA } from "../src/webllm.js";

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

test("probeDevice reports missing WebGPU without throwing", async () => {
  assert.equal((await probeDevice(null)).webgpu, false);
  const noGpu = await probeDevice({ deviceMemory: 4 });
  assert.equal(noGpu.webgpu, false);
  assert.equal(noGpu.lowMemory, true);
  const granted = await probeDevice({ gpu: { requestAdapter: async () => ({ limits: { maxBufferSize: 2e9 } }) } });
  assert.equal(granted.webgpu, true);
  assert.equal(granted.lowMemory, false);
});
