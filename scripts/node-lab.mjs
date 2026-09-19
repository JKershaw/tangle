// The Node runtime: the same walk, the same recording, a model over an
// OpenAI-compatible endpoint (src/endpoint.js), no browser. Presents what
// scripts/eval.mjs and scripts/run.mjs need in the shape lab.mjs's
// browserLab presents the page, so a suite runs in either runtime by one
// flag. Retries after an error do what the page's Retry button does.
import { clone, createRun, nextRunnable, outcomeLabel, trace, VERSION } from "../src/graph.js";
import { ASK_VERSION } from "../src/asks.js";
import { DEFAULT_VARIANTS, WALK_VERSION, runWalk, variantsFor, subjectIgnore } from "../src/walk.js";
import { wikiDriver } from "../src/wiki.js";
import { fileDriver } from "../src/files.js";
import { readCorpus } from "./corpus.mjs";
import { normalise } from "../src/text.js";
import { SAMPLING } from "../src/webllm.js";
import { DEFAULT_ENDPOINT, createEndpointAdapter } from "../src/endpoint.js";
import { replayAdapter } from "../src/replay.js";
import { USER_AGENT, modelCacheDir, readRecording, recordingFetch, writeEntry } from "./recording.mjs";
import { stamp } from "./lab.mjs";

const timed = async (work) => {
  const started = performance.now();
  const output = await work();
  return { ...output, latencyMs: Math.round(performance.now() - started) };
};

// ask: a scripted model in place of the endpoint (src/scripted.js), for
// parity. offline: a Wikipedia response not in the recording is an error.
// source: { root, include?, exclude?, name? } reads a directory as the
// corpus (scripts/corpus.mjs, src/files.js) in place of Wikipedia.
// modelCache: a directory of recorded model responses (src/replay.js), one
// subdirectory per model, replayed and added to; live: false replays only,
// and a call not in the cache is an error rather than a request.
export async function openNodeLab({ endpoint = DEFAULT_ENDPOINT, fetchImpl = globalThis.fetch, wikiCache = null, modelCache = null, live = true, ask: scripted = null, offline = false, source = null, onUpdate = null, note = console.log } = {}) {
  const adapter = replayAdapter(createEndpointAdapter({ url: endpoint, fetchImpl }), { live });
  let modelDir = null;
  let saved = { hits: 0, misses: 0 };
  const replayStats = () => adapter.replay.stats();
  const corpus = source ? readCorpus(source.root, source) : null;
  if (corpus) {
    subjectIgnore.add(normalise(corpus.name));
    note(`${stamp()} corpus ${corpus.name}: ${corpus.size} files, ${corpus.declared.size} declared names, ${corpus.hash}`);
  }
  const runtime = scripted ? "scripted" : `node ${process.version} · ${endpoint}`;
  const network = offline ? null : (url, init = {}) => fetch(url, { ...init, headers: { ...(init.headers ?? {}), "user-agent": USER_AGENT } });
  let recording = wikiCache && !corpus ? recordingFetch(wikiCache, { fetchImpl: network }) : null;
  const wiki = corpus ? fileDriver(corpus) : wikiDriver({ fetchImpl: (url, init) => (recording ? recording.fetch(url, init) : network(url, init)) });
  const ask = scripted ?? ((call, { signal } = {}) => adapter.generate(call.messages, { signal, schema: call.schema, maxTokens: call.maxTokens, seed: SAMPLING.seed, temperature: SAMPLING.temperature }));
  let loadedModel = null;
  let run = null;
  note(`${stamp()} node runtime ${runtime}`);
  return {
    kind: "node",
    runtime,
    version: () => `node ${process.version}`,
    versions: () => ({ prompt: null, schema: null, walk: WALK_VERSION, asks: ASK_VERSION, variants: loadedModel ? variantsFor(loadedModel) : { ...DEFAULT_VARIANTS }, runtime, page: VERSION }),
    async loadModel(model) {
      const started = Date.now();
      if (!scripted) await adapter.load(model);
      loadedModel = model;
      if (modelCache && !scripted) note(`${stamp()} model cache ${modelCacheDir(modelCache, model)}: ${this.modelLoad(modelCacheDir(modelCache, model))} responses loaded`);
      const seconds = Math.round((Date.now() - started) / 1000);
      note(`model ${model}: ${scripted ? "scripted" : live ? `served by ${endpoint}` : "replayed from the cache only"} (${seconds} s)`);
      return seconds;
    },
    newLive(seed, limits = {}) {
      run = createRun(seed, "live", limits);
      return clone(run.limits);
    },
    current: () => run,
    async runToEnd({ retries = 2, runTimeoutMs = 45 * 60000, note: log = note } = {}) {
      if (!run) throw new Error("No run: call newLive first.");
      if (!loadedModel) throw new Error("Load a model first.");
      const started = Date.now();
      Object.assign(run, { model: loadedModel, runtime, sampling: { ...SAMPLING }, schema: `${WALK_VERSION}/${ASK_VERSION}`, ...(corpus ? { source: { kind: "files", name: corpus.name, root: corpus.root, files: corpus.size, hash: corpus.hash } } : {}) });
      const drivers = { ask, wiki, source: corpus ? "files" : "wiki", variants: variantsFor(loadedModel), onUpdate: (nodeId, message) => onUpdate?.(nodeId, message) };
      let retriesUsed = 0;
      let outcome;
      const before = replayStats();
      for (;;) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), runTimeoutMs);
        try {
          for (;;) {
            const ok = await runWalk(run, { ...drivers, signal: controller.signal });
            if (controller.signal.aborted) throw new Error(`The run did not finish within ${runTimeoutMs / 60000} minutes.`);
            if (!ok || !nextRunnable(run) || run.stopReason) break;
          }
        } finally {
          clearTimeout(timer);
        }
        outcome = outcomeLabel(run);
        log(`${stamp()} run stopped: ${outcome}`);
        if (!outcome.startsWith("Paused on error") || retriesUsed >= retries) break;
        const errored = run.nodes.find((node) => node.status === "error");
        log(`retry ${retriesUsed + 1}: ${errored.id} ${errored.reason}`);
        errored.status = run.nodes.some((node) => node.parent === errored.id) ? "waiting" : "open";
        errored.reason = "";
        run.stopReason = null;
        trace(run, "manual_retry", { node: errored.id });
        retriesUsed++;
      }
      const after = replayStats();
      run.replay = { hits: after.hits - before.hits, misses: after.misses - before.misses };
      return { outcome, retriesUsed, wallSeconds: Math.round((Date.now() - started) / 1000) };
    },
    exportRun: () => ({ ...clone(run), exportedAt: new Date().toISOString() }),
    ask: (call) => {
      if (!loadedModel) throw new Error("Load a model first.");
      return timed(() => (scripted ? scripted(call) : adapter.generate(call.messages, { schema: call.schema, maxTokens: call.maxTokens, seed: SAMPLING.seed, temperature: SAMPLING.temperature })));
    },
    wikiLoad(dir) {
      if (corpus) return 0;
      recording = recordingFetch(dir, { fetchImpl: network });
      return recording.entries.size;
    },
    corpus: () => corpus,
    // For the tool control (scripts/tools.mjs): the adapter's generate with
    // the fixed sampling, and the source driver as the walk gets it.
    generate: (messages, options = {}) => {
      if (!loadedModel) throw new Error("Load a model first.");
      return adapter.generate(messages, { ...options, seed: SAMPLING.seed, temperature: SAMPLING.temperature });
    },
    wiki: () => wiki,
    // Node records as it goes; saving reports what happened.
    wikiSave: () => recording?.stats() ?? { hits: 0, misses: 0, added: 0, entries: 0 },
    // The model cache: loading reads a directory of recorded responses into
    // the replay and remembers where to save; saving writes what was recorded
    // since the last save and reports the hits and misses since then.
    modelLoad(dir) {
      modelDir = dir;
      return adapter.replay.load(readRecording(dir));
    },
    modelSave(dir = modelDir) {
      let added = 0;
      if (dir) for (const entry of adapter.replay.dump()) if (writeEntry(dir, entry)) added++;
      const now = replayStats();
      const report = { hits: now.hits - saved.hits, misses: now.misses - saved.misses, added, entries: now.entries };
      saved = now;
      return report;
    },
    close: () => adapter.unload(),
  };
}
