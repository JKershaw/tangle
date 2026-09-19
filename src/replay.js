// The replay (ROADMAP milestone 5a): the model's responses recorded by their
// exact context and served back without the model, the way the Wikipedia
// recording serves a page. It wraps either adapter (webllm.js in the page,
// endpoint.js in Node) and changes nothing about what the walk sees except
// that a call whose context was seen before returns in a millisecond, with
// the tokens it cost the first time, marked `replayed`. The benchmark is
// deterministic, so a rerun of unchanged code replays every call; the misses
// after a change are the calls the change touched.

// The context of one call, as readable JSON with the keys in a fixed order.
// Anything that is not context (a signal, a delta callback) is left out.
export function replayKey(model, messages, { schema = null, maxTokens = null, temperature = null, seed = null } = {}) {
  return JSON.stringify({ model, messages, schema, maxTokens, temperature, seed });
}

// The wrapped adapter keeps every method of the one underneath, with the
// wrapper as their receiver (Object.create), and replaces generate. live:
// false makes a miss an error and load a note of the model's name, so a
// run in CI never touches a server or a GPU.
export function replayAdapter(adapter, { live = true } = {}) {
  const entries = new Map();
  const stats = { hits: 0, misses: 0 };
  let offlineModel = null;
  const replay = {
    load(list) {
      for (const entry of list) entries.set(entry.key, entry);
      return entries.size;
    },
    dump: () => [...entries.values()],
    stats: () => ({ ...stats, entries: entries.size }),
  };
  const modelId = () => adapter.modelId ?? offlineModel;
  return Object.create(adapter, {
    replay: { value: replay, enumerable: true },
    modelId: { get: modelId, enumerable: true },
    load: {
      enumerable: true,
      async value(id, ...rest) {
        if (live) return adapter.load.call(this, id, ...rest);
        offlineModel = id;
      },
    },
    generate: {
      enumerable: true,
      async value(messages, options = {}) {
        const key = replayKey(modelId(), messages, options);
        const hit = entries.get(key);
        if (hit) {
          stats.hits++;
          return { text: hit.text, tokens: hit.tokens, usage: hit.usage, replayed: true };
        }
        stats.misses++;
        if (!live) throw new Error(`Not in the replay: ${modelId()} · ${String(messages.at(-1)?.content ?? "").slice(0, 80)}`);
        const output = await adapter.generate(messages, options);
        const { schema = null, maxTokens = null, temperature = null, seed = null } = options;
        entries.set(key, { key, model: modelId(), messages, options: { schema, maxTokens, temperature, seed }, text: output.text, tokens: output.tokens ?? null, usage: output.usage ?? null, recordedAt: new Date().toISOString() });
        return { ...output, replayed: false };
      },
    },
  });
}
