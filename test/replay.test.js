// The replay (ROADMAP milestone 5a): the model's responses recorded by their
// exact context and served back without the model. A rerun with no code
// change replays every call; a change to one ask misses only that ask's calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replayAdapter, replayKey } from "../src/replay.js";
import { entryPath, readRecording, writeEntry } from "../scripts/recording.mjs";
import { openNodeLab } from "../scripts/node-lab.mjs";
import { SCRIPTED } from "../src/scripted.js";

const RECORDING = new URL("../evals/wiki-cache", import.meta.url).pathname;
const messages = [{ role: "system", content: "Pick." }, { role: "user", content: "1. a\n2. b" }];
const schema = { type: "object", properties: { answer: { enum: ["1", "2", "none"] } }, required: ["answer"], additionalProperties: false };
const options = { schema, maxTokens: 24, temperature: 0.2, seed: 1 };

// A fake adapter with the surface of src/endpoint.js: remembers every call.
function fakeAdapter(answer = '{"answer":"2"}') {
  const calls = [];
  let modelId = null;
  return {
    calls,
    get modelId() {
      return modelId;
    },
    async load(id) {
      modelId = id;
      this.loadedThrough = this;
    },
    async unload() {
      modelId = null;
    },
    interrupt() {
      calls.push("interrupt");
    },
    stats: () => ({ calls: calls.length }),
    async generate(sent, sentOptions) {
      calls.push({ messages: sent, options: sentOptions });
      return { text: typeof answer === "function" ? answer(sent, sentOptions) : answer, tokens: 35, usage: { total_tokens: 35 } };
    },
  };
}

test("the replay key is the exact context: model, messages, schema, token cap and sampling, in a canonical order", () => {
  const key = replayKey("qwen3:1.7b", messages, options);
  assert.equal(key, replayKey("qwen3:1.7b", messages, { seed: 1, temperature: 0.2, maxTokens: 24, schema }), "option order does not matter");
  assert.equal(key, replayKey("qwen3:1.7b", messages, { ...options, signal: new AbortController().signal, onDelta: () => {} }), "what is not context is not in the key");
  assert.notEqual(key, replayKey("qwen3:4b", messages, options));
  assert.notEqual(key, replayKey("qwen3:1.7b", [messages[0], { role: "user", content: "1. a\n2. c" }], options));
  assert.notEqual(key, replayKey("qwen3:1.7b", messages, { ...options, schema: { ...schema, properties: { answer: { enum: ["1", "2"] } } } }));
  assert.notEqual(key, replayKey("qwen3:1.7b", messages, { ...options, maxTokens: 25 }));
  assert.notEqual(key, replayKey("qwen3:1.7b", messages, { ...options, temperature: 0 }));
  assert.notEqual(key, replayKey("qwen3:1.7b", messages, { ...options, seed: 2 }));
  assert.ok(JSON.parse(key).messages, "the key is readable JSON, so an entry can be read as the ask it answered");
  const tools = [{ type: "function", function: { name: "search" } }];
  assert.notEqual(key, replayKey("qwen3:1.7b", messages, { ...options, tools }), "tools offered are context");
  assert.equal(key, replayKey("qwen3:1.7b", messages, { ...options, tools: [] }), "and none offered is the walk's key, unchanged");
});

test("a replayed tool call comes back as the model made it", async () => {
  const inner = fakeAdapter();
  inner.generate = async () => ({ text: "", tokens: 30, usage: null, toolCalls: [{ id: "c1", name: "search", arguments: { term: "x" } }] });
  const adapter = replayAdapter(inner);
  await adapter.load("qwen3:1.7b");
  const tools = [{ type: "function", function: { name: "search" } }];
  const first = await adapter.generate(messages, { ...options, tools });
  assert.deepEqual(first.toolCalls, [{ id: "c1", name: "search", arguments: { term: "x" } }]);
  assert.deepEqual(adapter.replay.dump()[0].options.tools, tools);
  const again = await adapter.generate(messages, { ...options, tools });
  assert.deepEqual(again, { ...first, replayed: true });
});

test("the replay answers a recorded context without the model, records a miss, and delegates everything else to the adapter", async () => {
  const inner = fakeAdapter();
  const adapter = replayAdapter(inner);
  await adapter.load("qwen3:1.7b");
  assert.equal(adapter.modelId, "qwen3:1.7b", "the model id reads through");
  assert.equal(adapter.loadedThrough, adapter, "the adapter's own methods run with the wrapper as their receiver");

  const first = await adapter.generate(messages, { ...options, signal: new AbortController().signal });
  assert.deepEqual(first, { text: '{"answer":"2"}', tokens: 35, usage: { total_tokens: 35 }, replayed: false });
  assert.equal(inner.calls.length, 1);
  assert.deepEqual(adapter.replay.stats(), { hits: 0, misses: 1, entries: 1 });

  const second = await adapter.generate(messages, options);
  assert.deepEqual(second, { text: '{"answer":"2"}', tokens: 35, usage: { total_tokens: 35 }, replayed: true });
  assert.equal(inner.calls.length, 1, "a hit never reaches the model");
  assert.deepEqual(adapter.replay.stats(), { hits: 1, misses: 1, entries: 1 });

  await adapter.generate([messages[0], { role: "user", content: "1. c\n2. d" }], options);
  assert.equal(inner.calls.length, 2, "a different context is a miss");

  const entries = adapter.replay.dump();
  assert.equal(entries.length, 2);
  const entry = entries[0];
  assert.equal(entry.key, replayKey("qwen3:1.7b", messages, options));
  assert.equal(entry.model, "qwen3:1.7b");
  assert.deepEqual(entry.messages, messages);
  assert.deepEqual(entry.options, { schema, maxTokens: 24, temperature: 0.2, seed: 1 });
  assert.equal(entry.text, '{"answer":"2"}');
  assert.equal(entry.tokens, 35);
  assert.ok(entry.recordedAt);

  adapter.interrupt();
  assert.equal(inner.calls.at(-1), "interrupt");
  assert.deepEqual(adapter.stats(), { calls: 3 });
});

test("a replay loaded from entries serves them, and a replay-only adapter refuses a miss instead of calling the model", async () => {
  const recorded = fakeAdapter();
  const recorder = replayAdapter(recorded);
  await recorder.load("qwen3:1.7b");
  await recorder.generate(messages, options);

  const inner = fakeAdapter('{"answer":"1"}');
  const adapter = replayAdapter(inner, { live: false });
  assert.equal(adapter.replay.load(recorder.replay.dump()), 1);
  await adapter.load("qwen3:1.7b");
  assert.equal(adapter.modelId, "qwen3:1.7b", "replay-only, the name is noted without a server");
  assert.equal(inner.modelId, null);
  const hit = await adapter.generate(messages, options);
  assert.equal(hit.text, '{"answer":"2"}', "the recorded answer, not the live one");
  await assert.rejects(adapter.generate(messages, { ...options, maxTokens: 25 }), /Not in the replay/);
  assert.deepEqual(inner.calls, []);
  assert.deepEqual(adapter.replay.stats(), { hits: 1, misses: 1, entries: 1 });
  assert.equal(adapter.replay.load(recorder.replay.dump()), 1, "loading the same entry again is not a second entry");
});

test("the recording stores a replay entry by its key, as it stores a Wikipedia response by its URL", () => {
  const dir = mkdtempSync(join(tmpdir(), "tangle-replay-"));
  const key = replayKey("qwen3:1.7b", messages, options);
  const entry = { key, model: "qwen3:1.7b", messages, options, text: '{"answer":"2"}', tokens: 35, usage: null, recordedAt: "2026-09-19T00:00:00.000Z" };
  assert.equal(writeEntry(dir, entry), true);
  assert.equal(writeEntry(dir, { ...entry, text: "changed" }), false, "an entry is never overwritten");
  assert.deepEqual(readdirSync(dir), [entryPath(dir, key).split("/").pop()]);
  assert.deepEqual(readRecording(dir), [entry]);
  assert.deepEqual(JSON.parse(readFileSync(entryPath(dir, key), "utf8")).messages, messages);
});

// An OpenAI-compatible server whose answers are the scripted first-choice
// model's, so the walk over the recording grows a real graph.
function scriptedServer() {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, body });
    if (url.endsWith("/models")) return Response.json({ object: "list", data: [{ id: "qwen3:1.7b" }] });
    const answer = SCRIPTED.first({ messages: body.messages, schema: body.response_format.json_schema.schema, maxTokens: body.max_tokens });
    return Response.json({ choices: [{ message: { role: "assistant", content: answer.text } }], usage: { prompt_tokens: 40, completion_tokens: 4, total_tokens: 44 } });
  };
  return { fetchImpl, requests, chats: () => requests.filter((request) => request.url.endsWith("/chat/completions")).length };
}

test("in Node a rerun with no code change replays every call from the model cache, reproduces the graph and labels the run with what was replayed", async () => {
  const cache = mkdtempSync(join(tmpdir(), "tangle-model-cache-"));
  const seed = "Why is the Dead Sea shrinking?";
  const runOnce = async ({ live }) => {
    const server = scriptedServer();
    const lab = await openNodeLab({ endpoint: "http://fake/v1", fetchImpl: server.fetchImpl, modelCache: cache, live, wikiCache: RECORDING, offline: true, note: () => {} });
    await lab.loadModel("qwen3:1.7b");
    lab.newLive(seed);
    const { outcome } = await lab.runToEnd({ retries: 0, note: () => {} });
    const saved = lab.modelSave();
    return { outcome, run: lab.exportRun(), server, saved };
  };
  const first = await runOnce({ live: true });
  assert.equal(first.outcome, "Root resolved");
  assert.ok(first.server.chats() > 0, "the first run calls the model");
  assert.deepEqual(first.run.replay, { hits: 0, misses: first.server.chats() });
  assert.equal(first.saved.added, first.server.chats(), "every call is recorded");
  assert.equal(first.run.tokens, 44 * first.server.chats());

  const second = await runOnce({ live: false });
  assert.equal(second.outcome, "Root resolved");
  assert.equal(second.server.chats(), 0, "the rerun never calls the model");
  assert.deepEqual(second.run.replay, { hits: first.server.chats(), misses: 0 });
  assert.deepEqual(second.saved, { hits: first.server.chats(), misses: 0, added: 0, entries: first.server.chats() });
  assert.equal(second.run.tokens, first.run.tokens, "the cost columns reproduce");
  const shape = (run) => run.nodes.map(({ id, status, finding, evidence }) => ({ id, status, finding, evidence }));
  assert.deepEqual(shape(second.run), shape(first.run));
});
