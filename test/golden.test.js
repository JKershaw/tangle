// The golden graph (REVIEW.md, step 1): walk-15 at 1.7B on one seed of each
// kind, replayed from the model cache and the Wikipedia recording with no
// model and no network, must grow exactly the graph it grew when the row
// was recorded. A shape that moves is a change in code, since every call is
// replayed; the replay's miss count says whether an ask's context moved.
// Regenerate the fixture after a deliberate change: GOLDEN=update npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openNodeLab } from "../scripts/node-lab.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const GOLDEN = resolve(ROOT, "test/fixtures/golden.json");
const MODEL = "qwen3:1.7b";
const CASES = [
  { suite: "seeds", id: "dead-sea" },
  { suite: "seeds-profile", id: "turing" },
  { suite: "seeds-code", id: "persist" },
];

export function shapeOf(run) {
  const titles = (ids) => ids.map((id) => run.evidence.find((record) => record.id === id)?.title ?? id);
  const statuses = {};
  for (const node of run.nodes) statuses[node.status] = (statuses[node.status] || 0) + 1;
  return {
    nodes: run.nodes.length,
    statuses,
    questions: run.nodes.map((node) => node.question),
    cited: titles(run.nodes[0].evidence),
    read: run.evidence.map((record) => record.title),
    findingChars: run.nodes[0].finding.length,
    calls: run.modelCalls,
    tokens: run.tokens,
  };
}

const golden = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, "utf8")) : {};
const updating = process.env.GOLDEN === "update";

for (const entry of CASES) {
  test(`golden graph: ${entry.id} at ${MODEL} replays from the cache to the recorded shape`, async (t) => {
    const file = JSON.parse(readFileSync(resolve(ROOT, `evals/${entry.suite}.json`), "utf8"));
    const seed = file.seeds.find((candidate) => candidate.id === entry.id);
    const source = file.source ? { ...file.source, root: resolve(ROOT, file.source.root) } : null;
    if (source && !existsSync(source.root)) return t.skip(`no corpus at ${source.root}`);
    const lab = await openNodeLab({ live: false, modelCache: resolve(ROOT, "evals/model-cache"), wikiCache: resolve(ROOT, "evals/wiki-cache"), offline: true, source, note: () => {} });
    await lab.loadModel(MODEL);
    lab.newLive(seed.seed);
    const { outcome } = await lab.runToEnd({ retries: 0, note: () => {} });
    const run = lab.exportRun();
    assert.equal(run.replay.misses, 0, `every call replayed (${outcome})`);
    const shape = shapeOf(run);
    if (updating || !golden[entry.id]) {
      golden[entry.id] = { model: MODEL, walk: run.schema, ...shape };
      writeFileSync(GOLDEN, JSON.stringify(golden, null, 2) + "\n");
      return;
    }
    const { model, walk, ...expected } = golden[entry.id];
    assert.equal(run.schema, walk, "the walk and asks versions the fixture was recorded at");
    assert.deepEqual(shape, expected);
  });
}
