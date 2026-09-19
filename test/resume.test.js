// A run's memory lives in the run (REVIEW.md, step 3): a walk exported half
// way and imported again finishes as the uninterrupted walk did, over the
// recording with the scripted first-choice model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, nextRunnable, validateImport } from "../src/graph.js";
import { runWalk, variantsFor } from "../src/walk.js";
import { wikiDriver } from "../src/wiki.js";
import { SCRIPTED } from "../src/scripted.js";
import { recordingFetch } from "../scripts/recording.mjs";

const RECORDING = new URL("../evals/wiki-cache", import.meta.url).pathname;
const SEED = "Tell me about Alan Turing and elaborate on the impact of his work.";

const drivers = () => ({ ask: SCRIPTED.first, wiki: wikiDriver({ fetchImpl: recordingFetch(RECORDING, { fetchImpl: null }).fetch }), variants: variantsFor("scripted:first"), onUpdate: () => {} });
const shape = (run) => ({ nodes: run.nodes.map(({ id, status, question, finding, evidence }) => ({ id, status, question, finding, evidence })), evidence: run.evidence.map((record) => record.title), trace: run.trace.length, state: run.state });

async function finish(run, steps = Infinity) {
  const walk = drivers();
  for (let step = 0; step < steps && nextRunnable(run); step++) if (!(await runWalk(run, walk))) break;
  return run;
}

test("a run exported half way and imported again finishes as the uninterrupted run did, with its memory in the export", async () => {
  const whole = await finish(createRun(SEED, "live"));
  assert.equal(whole.nodes[0].status, "resolved");
  assert.ok(whole.nodes.length > 5, "a graph worth interrupting");
  assert.ok(whole.state.kept.length > 0 && Object.keys(whole.state.links).length > 0 && Object.keys(whole.state.judged).length > 0, "the memory is in the run");

  const half = await finish(createRun(SEED, "live"), 4);
  assert.ok(nextRunnable(half), "still running at four steps");
  const resumed = await finish(validateImport(JSON.stringify(half), { resume: true }));
  assert.equal(validateImport(JSON.stringify(half)).readOnly, true, "an import is inspect-only unless resumed");
  assert.deepEqual(shape(resumed), shape(whole));

  // An export from before the state existed still opens and runs.
  const { state, ...old } = half;
  const legacy = validateImport(JSON.stringify(old), { resume: true });
  assert.deepEqual(legacy.state, undefined);
  await finish(legacy);
  assert.equal(legacy.nodes[0].status, "resolved");
});
