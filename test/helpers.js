import { createRun, nextRunnable } from "../src/graph.js";
import { runEpisode } from "../src/episode.js";
import { simulationDrivers, SIMULATION_SEED } from "../src/simulation.js";

// Run a simulation preset to a terminal state, exactly as the UI's Run button does.
export async function runSimulation(preset, limits = {}) {
  const run = createRun(SIMULATION_SEED, "simulation", limits);
  run.preset = preset;
  const drivers = simulationDrivers(preset);
  let steps = 0;
  while (steps < 500) {
    const ok = await runEpisode(run, drivers);
    steps++;
    if (!ok || !nextRunnable(run) || run.stopReason) break;
  }
  return { run, steps };
}

export function statusCounts(run) {
  const counts = {};
  for (const node of run.nodes) counts[node.status] = (counts[node.status] || 0) + 1;
  return counts;
}

// Every evidence ID a resolved node cites must have appeared in that node's own model input.
export function provenanceViolations(run) {
  const violations = [];
  for (const node of run.nodes.filter((candidate) => candidate.status === "resolved")) {
    const seen = new Set(
      run.trace
        .filter((event) => event.event === "model_input" && event.node === node.id)
        .flatMap((event) => event.context.evidence.map((excerpt) => excerpt.id)),
    );
    for (const id of node.evidence) if (!seen.has(id)) violations.push({ node: node.id, evidence: id });
  }
  return violations;
}

// A scripted live-style generator: hands out the given actions in order.
export function scriptedGenerate(actions) {
  const queue = [...actions];
  return async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("Script exhausted.");
    return { text: typeof next === "string" ? next : JSON.stringify(next), tokens: 10 };
  };
}
