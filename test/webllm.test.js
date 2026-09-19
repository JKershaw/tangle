import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngineAdapter, probeDevice } from "../src/webllm.js";

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

const SCHEMA = { type: "object", properties: { action: { enum: ["blocked"] }, reason: { type: "string" } }, required: ["action", "reason"], additionalProperties: false };

test("the adapter loads with a 4k context, resets chat per call, and constrains output to the schema it is given", async () => {
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
  const result = await adapter.generate([{ role: "user", content: "hi" }], { seed: 7, schema: SCHEMA });
  assert.equal(result.text, '{"action":"blocked","reason":"x"}');
  assert.equal(result.tokens, 42);
  assert.equal(calls.resets, 1);
  const request = calls.requests[0];
  assert.equal(request.seed, 7);
  assert.equal(request.temperature, 0.2);
  assert.deepEqual(request.extra_body, { enable_thinking: false });
  assert.deepEqual(JSON.parse(request.response_format.schema), SCHEMA);
  assert.equal(adapter.stats().decodeTokensPerSecond, 9);
  assert.equal(adapter.stats().totalTokens, 42);
  await adapter.generate([{ role: "user", content: "hi" }], {});
  assert.equal("response_format" in calls.requests[1], false, "no schema, no grammar");
  await adapter.unload();
  assert.equal(calls.unloads, 1);
  assert.equal(adapter.modelId, null);
});

test("cancellation interrupts generation and surfaces the partial text", async () => {
  const already = new AbortController();
  already.abort();
  const { webllm } = fakeWebllm([{ choices: [{ delta: { content: "{" } }] }]);
  const adapter = createEngineAdapter(webllm);
  await adapter.load("m");
  await assert.rejects(adapter.generate([], { signal: already.signal }), (error) => error.name === "AbortError", "a signal already aborted rejects before any request");
  // Abort before the second chunk is consumed.
  const late = fakeWebllm([{ choices: [{ delta: { content: "{" } }] }]);
  const adapter2 = createEngineAdapter(late.webllm);
  await adapter2.load("m");
  const ctrl = new AbortController();
  const pending = adapter2.generate([], { signal: ctrl.signal, onDelta: () => ctrl.abort() });
  await assert.rejects(pending, (error) => error.name === "AbortError" && error.partialText === "{");
  assert.equal(late.calls.interrupts, 1);
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

test("the adapter bounds the whitespace XGrammar allows between JSON elements, even though WebLLM creates the compiler lazily", async () => {
  const { boundJsonWhitespace, MAX_JSON_WHITESPACE } = await import("../src/webllm.js");
  const calls = [];
  const pipeline = { grammarCompiler: undefined };
  assert.equal(boundJsonWhitespace(pipeline), true);
  // WebLLM assigns the compiler on the first grammar-constrained call.
  pipeline.grammarCompiler = { compileJSONSchema: async (...args) => calls.push(args) && "compiled" };
  assert.equal(await pipeline.grammarCompiler.compileJSONSchema('{"type":"object"}'), "compiled");
  assert.deepEqual(calls, [['{"type":"object"}', true, 2, undefined, true, MAX_JSON_WHITESPACE]]);
  // Explicit arguments still win, and wrapping is idempotent.
  await pipeline.grammarCompiler.compileJSONSchema("{}", false, -1, undefined, true, 3);
  assert.deepEqual(calls[1], ["{}", false, -1, undefined, true, 3]);
  const compiler = pipeline.grammarCompiler;
  pipeline.grammarCompiler = compiler;
  assert.equal(pipeline.grammarCompiler.boundedWhitespace, MAX_JSON_WHITESPACE);
  assert.equal(boundJsonWhitespace(null), false);

  // Through the adapter: the loaded engine's pipeline gets the bound.
  const { webllm } = fakeWebllm();
  const pipelines = new Map();
  class EngineWithPipeline extends webllm.MLCEngine {
    loadedModelIdToPipeline = pipelines;
    async reload(id, options) {
      pipelines.set(id, { grammarCompiler: undefined });
      return super.reload(id, options);
    }
  }
  const adapter = createEngineAdapter({ ...webllm, MLCEngine: EngineWithPipeline });
  await adapter.load("Qwen3-0.6B-q4f16_1-MLC");
  pipelines.get("Qwen3-0.6B-q4f16_1-MLC").grammarCompiler = { compileJSONSchema: async (...args) => args };
  assert.equal((await pipelines.get("Qwen3-0.6B-q4f16_1-MLC").grammarCompiler.compileJSONSchema("{}")).at(-1), MAX_JSON_WHITESPACE);
});
