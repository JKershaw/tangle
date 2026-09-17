// Everything that touches the on-device model: capability probes and a thin
// adapter over WebLLM. The adapter takes the webllm module as a parameter so
// tests can pass a fake and the graph code never imports the runtime.

const GiB = 1024 ** 3;

export const RUNTIME = "@mlc-ai/web-llm@0.2.84";
export const CONTEXT_WINDOW = 4096;
export const GENERATION_TIMEOUT_MS = 120000;
export const MAX_ACTION_TOKENS = 420;
// Fixed sampling so repeated runs on one commit differ only in what we change.
// Recorded on every live run; GPU kernels may still introduce small nondeterminism.
export const SAMPLING = Object.freeze({ temperature: 0.2, seed: 1 });

export const MODELS = Object.freeze([
  { id: "Qwen3-0.6B-q4f16_1-MLC", label: "Qwen3 0.6B · tiny · ~0.4 GB download", downloadBytes: 0.4 * GiB },
  { id: "Qwen3-1.7B-q4f16_1-MLC", label: "Qwen3 1.7B · small · ~1 GB download", downloadBytes: 1 * GiB },
  { id: "Qwen3-4B-q4f16_1-MLC", label: "Qwen3 4B · medium · ~2.5 GB download · desktop GPU", downloadBytes: 2.5 * GiB },
  { id: "Qwen3-8B-q4f16_1-MLC", label: "Qwen3 8B · large · ~5 GB download · desktop GPU", downloadBytes: 5 * GiB },
  { id: "Qwen3-0.6B-q4f32_1-MLC", label: "Qwen3 0.6B · float32 compatibility · ~0.5 GB download", downloadBytes: 0.5 * GiB },
]);

export const downloadBytes = (modelId) => MODELS.find((model) => model.id === modelId)?.downloadBytes ?? null;

// Grammar-constrained decoding: the model can only emit an object of this shape.
// The harness validator still decides whether the content is acceptable.
export const RESPONSE_SCHEMA_VERSION = "per-action-2";
// One variant per action, built per call from the evidence the model was shown:
// decompose must carry 1–3 questions, wiki a query, blocked a reason, and
// resolved may only cite IDs that are in context — with no evidence in context
// there is no resolved variant at all, so the grammar itself refuses a finding
// without inspected sources. The first two live runs (experiments/2026-09-17-*)
// show why: a flat schema let a 0.6B model put its questions in `reason`, then
// answer from memory with evidence it wrote itself.
const variant = (action, properties, required) =>
  Object.freeze({ type: "object", properties: { action: { const: action }, ...properties }, required: ["action", ...required], additionalProperties: false });
export function responseSchema(evidenceIds = []) {
  const ids = [...new Set(evidenceIds)];
  return Object.freeze({
    anyOf: [
      variant("wiki", { query: { type: "string", minLength: 1, maxLength: 180 } }, ["query"]),
      variant("decompose", { questions: { type: "array", items: { type: "string", minLength: 1, maxLength: 300 }, minItems: 1, maxItems: 3 } }, ["questions"]),
      ...(ids.length
        ? [variant("resolved", { finding: { type: "string", minLength: 1, maxLength: 1400 }, evidence: { type: "array", items: { enum: ids }, minItems: 1, maxItems: Math.min(8, ids.length) } }, ["finding", "evidence"])]
        : []),
      variant("blocked", { reason: { type: "string", minLength: 1, maxLength: 1000 } }, ["reason"]),
    ],
  });
}
// The schema before anything has been read: no resolved variant.
export const RESPONSE_SCHEMA = responseSchema([]);

export async function probeDevice(navigator = globalThis.navigator) {
  const report = { webgpu: false, reason: null, deviceMemoryGb: null, maxBufferBytes: null, lowMemory: false };
  if (!navigator) {
    report.reason = "No navigator object is available in this environment.";
    return report;
  }
  if (typeof navigator.deviceMemory === "number") report.deviceMemoryGb = navigator.deviceMemory;
  if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== "function") {
    report.reason = "This browser does not expose WebGPU (navigator.gpu is missing).";
    report.lowMemory = report.deviceMemoryGb !== null && report.deviceMemoryGb <= 4;
    return report;
  }
  let adapter = null;
  try {
    adapter = await navigator.gpu.requestAdapter();
  } catch (error) {
    report.reason = `Requesting a WebGPU adapter failed: ${error?.message || error}`;
    return report;
  }
  if (!adapter) {
    report.reason = "WebGPU is present but no GPU adapter was granted (often a headless, virtualised or blocklisted GPU).";
    return report;
  }
  report.webgpu = true;
  const maxBuffer = adapter.limits?.maxBufferSize;
  if (typeof maxBuffer === "number" && Number.isFinite(maxBuffer)) report.maxBufferBytes = maxBuffer;
  const smallRam = report.deviceMemoryGb !== null && report.deviceMemoryGb <= 4;
  const smallBuffer = report.maxBufferBytes !== null && report.maxBufferBytes < 1e9;
  report.lowMemory = smallRam || smallBuffer;
  return report;
}

export async function probeStorage(navigator = globalThis.navigator) {
  const report = { supported: false, usageBytes: null, quotaBytes: null, freeBytes: null, persisted: null, reason: null };
  const storage = navigator?.storage;
  if (!storage || typeof storage.estimate !== "function") {
    report.reason = "This browser does not expose navigator.storage.estimate().";
    return report;
  }
  try {
    const estimate = await storage.estimate();
    report.supported = true;
    if (typeof estimate?.usage === "number" && Number.isFinite(estimate.usage)) report.usageBytes = estimate.usage;
    if (typeof estimate?.quota === "number" && Number.isFinite(estimate.quota)) report.quotaBytes = estimate.quota;
    if (report.usageBytes !== null && report.quotaBytes !== null) report.freeBytes = Math.max(0, report.quotaBytes - report.usageBytes);
  } catch (error) {
    report.reason = `navigator.storage.estimate() failed: ${error?.message || error}`;
    return report;
  }
  try {
    if (typeof storage.persisted === "function") report.persisted = !!(await storage.persisted());
  } catch {}
  return report;
}

export async function requestPersistence(navigator = globalThis.navigator) {
  const storage = navigator?.storage;
  if (!storage || typeof storage.persist !== "function") return null;
  try {
    if (typeof storage.persisted === "function" && (await storage.persisted())) return true;
    return !!(await storage.persist());
  } catch {
    return null;
  }
}

// WebLLM stores weights in the Cache API, falling back to IndexedDB. file://
// origins often have neither, in which case a model cannot be kept between visits.
export async function probeCache({ caches = globalThis.caches, indexedDB = globalThis.indexedDB } = {}) {
  try {
    const probe = await caches.open("tangle-probe");
    await probe.put("https://tangle.invalid/probe", new Response("ok"));
    await caches.delete("tangle-probe");
    return { backend: "cache", reason: "" };
  } catch {}
  try {
    await new Promise((resolve, reject) => {
      if (!indexedDB) throw new Error("IndexedDB is not available.");
      const request = indexedDB.open("tangle-cache-probe", 1);
      const timer = setTimeout(() => reject(new Error("IndexedDB check timed out")), 3000);
      request.onsuccess = () => {
        clearTimeout(timer);
        request.result.close();
        indexedDB.deleteDatabase("tangle-cache-probe");
        resolve();
      };
      request.onerror = () => {
        clearTimeout(timer);
        reject(request.error);
      };
    });
    return { backend: "indexeddb", reason: "" };
  } catch (error) {
    return { backend: "unavailable", reason: String(error?.message || error) };
  }
}

export async function probeEnvironment() {
  const [device, storage, cache] = await Promise.all([probeDevice(), probeStorage(), probeCache()]);
  return {
    ...device,
    storage,
    cache: cache.backend,
    cacheReason: cache.reason,
    secure: globalThis.isSecureContext,
    protocol: globalThis.location?.protocol ?? null,
  };
}

// webllm: the module namespace (MLCEngine, prebuiltAppConfig, hasModelInCache, deleteModelAllInfoInCache).
// options.cacheBackend is read on every call so the UI can set it after probing.
export function createEngineAdapter(webllm, options = {}) {
  let engine = null;
  let modelId = null;
  let lastUsage = null;
  let totalTokens = 0;
  const appConfig = () => ({ ...webllm.prebuiltAppConfig, cacheBackend: options.cacheBackend ?? "cache" });
  return {
    get modelId() {
      return modelId;
    },
    async isCached(id) {
      try {
        return await webllm.hasModelInCache(id, appConfig());
      } catch {
        return false;
      }
    },
    async deleteFromCache(id) {
      try {
        await webllm.deleteModelAllInfoInCache(id, appConfig());
        return true;
      } catch {
        return false;
      }
    },
    async load(id, onProgress) {
      if (engine) await this.unload();
      const candidate = new webllm.MLCEngine({
        appConfig: appConfig(),
        initProgressCallback: (report) => {
          onProgress?.({
            progress: typeof report.progress === "number" ? report.progress : 0,
            text: report.text || "",
            timeElapsed: typeof report.timeElapsed === "number" ? report.timeElapsed : null,
          });
        },
      });
      try {
        await candidate.reload(id, { context_window_size: CONTEXT_WINDOW });
      } catch (error) {
        await candidate.unload().catch(() => {});
        throw error;
      }
      engine = candidate;
      modelId = id;
      lastUsage = null;
      totalTokens = 0;
    },
    async unload() {
      if (engine) await engine.unload();
      engine = null;
      modelId = null;
      lastUsage = null;
      totalTokens = 0;
    },
    interrupt() {
      engine?.interruptGenerate().catch?.(() => {});
    },
    stats() {
      return {
        modelId,
        totalTokens,
        prefillTokensPerSecond: lastUsage?.extra?.prefill_tokens_per_s ?? null,
        decodeTokensPerSecond: lastUsage?.extra?.decode_tokens_per_s ?? null,
      };
    },
    // Streams one completion. Resolves to { text, tokens, usage }. Rejects with an
    // AbortError when cancelled; the partial text is attached as error.partialText.
    async generate(messages, { signal, maxTokens = MAX_ACTION_TOKENS, temperature = 0.2, seed = null, onDelta, schema = RESPONSE_SCHEMA } = {}) {
      if (!engine) throw new Error("No model is loaded yet.");
      const abort = () => this.interrupt();
      const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });
      if (signal?.aborted) throw abortError();
      signal?.addEventListener("abort", abort, { once: true });
      let text = "";
      try {
        await engine.resetChat();
        const request = {
          messages,
          stream: true,
          stream_options: { include_usage: true },
          temperature,
          max_tokens: maxTokens,
          extra_body: { enable_thinking: false },
          response_format: { type: "json_object", schema: JSON.stringify(schema) },
        };
        if (Number.isInteger(seed)) request.seed = seed;
        const stream = await engine.chat.completions.create(request);
        lastUsage = null;
        for await (const chunk of stream) {
          if (signal?.aborted) break;
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            text += delta;
            onDelta?.(delta);
          }
          if (chunk.usage) lastUsage = chunk.usage;
        }
        if (signal?.aborted) throw abortError();
        const tokens = lastUsage?.total_tokens ?? null;
        if (tokens) totalTokens += tokens;
        return { text, tokens, usage: lastUsage };
      } catch (error) {
        error.partialText = text;
        throw error;
      } finally {
        signal?.removeEventListener("abort", abort);
      }
    },
  };
}

// The generate driver the episode runner calls in live mode: one bounded action.
export function createLiveGenerator(adapter, sampling = SAMPLING) {
  return async (messages, { signal, context } = {}) => {
    const schema = responseSchema((context?.evidence ?? []).map((excerpt) => excerpt.id));
    const timer = setTimeout(() => adapter.interrupt(), GENERATION_TIMEOUT_MS);
    const started = performance.now();
    try {
      const result = await adapter.generate(messages, { signal, seed: sampling.seed, temperature: sampling.temperature, schema });
      if (performance.now() - started >= GENERATION_TIMEOUT_MS) {
        throw Object.assign(new Error(`Generation time limit reached (${GENERATION_TIMEOUT_MS / 1000} seconds).`), { partialText: result.text });
      }
      return { text: result.text, tokens: result.tokens };
    } finally {
      clearTimeout(timer);
    }
  };
}
