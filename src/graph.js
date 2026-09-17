// The harness owns the graph. Models propose findings, evidence references and
// child questions; this module validates them and persists graph mutations.
// Nothing in here touches the DOM or the network.

export const FORMAT = "tangle-pocket-1";
export const VERSION = "0.2.0";
export const DEFAULT_LIMITS = Object.freeze({
  maxNodes: 40,
  maxVisits: 60,
  maxDepth: 6,
  maxLookups: 2,
  maxPasses: 4,
});
export const ACTIONS = Object.freeze(["wiki", "decompose", "resolved", "blocked"]);
export const NODE_STATUSES = Object.freeze(["open", "waiting", "working", "resolved", "blocked", "error"]);
export const EXCERPT_LIMIT = 700;

export const clone = (value) => JSON.parse(JSON.stringify(value));
export const isText = (value, max = 1000) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeNode(id, parent, depth, question) {
  return { id, parent, depth, question, status: "open", visits: 0, finding: "", evidence: [], observed: [], failedLookups: [], reason: "" };
}

export function createRun(seed, mode = "simulation", limits = {}) {
  assert(isText(seed, 400), "Give the seed a question of 1–400 characters.");
  return {
    format: FORMAT,
    version: VERSION,
    promptVersion: null,
    created: new Date().toISOString(),
    mode,
    seed,
    limits: { ...DEFAULT_LIMITS, ...limits },
    nodes: [makeNode("n1", null, 0, seed)],
    evidence: [],
    trace: [],
    visits: 0,
    modelCalls: 0,
    tokens: 0,
    lookups: 0,
    stopReason: null,
  };
}

export function trace(run, event, data = {}) {
  run.trace.push({ seq: run.trace.length + 1, time: new Date().toISOString(), event, ...data });
}

export function getNode(run, id) {
  return run.nodes.find((node) => node.id === id);
}

export function children(run, parentId) {
  return run.nodes.filter((node) => node.parent === parentId);
}

// Deterministic depth-first choice: the first open node, or the first waiting
// node whose children have all resolved. Children are tried before their parent,
// so a parent is only revisited once nothing below it can run.
export function nextRunnable(run) {
  function visit(node) {
    for (const child of children(run, node.id)) {
      const found = visit(child);
      if (found) return found;
    }
    const runnable =
      node.status === "open" ||
      (node.status === "waiting" && children(run, node.id).every((child) => child.status === "resolved"));
    return runnable ? node : null;
  }
  return visit(run.nodes[0]);
}

// A lookup that found nothing is still an observation: the node remembers it so
// a later pass or visit is not tempted to repeat the same query.
export function recordFailedLookup(run, nodeId, query, error) {
  const node = getNode(run, nodeId);
  node.failedLookups ??= [];
  node.failedLookups.push({ query, error: String(error?.message || error || "Lookup failed.").slice(0, 300) });
  trace(run, "lookup_failed", { node: nodeId, query, error: node.failedLookups.at(-1).error });
}

export function captureEvidence(run, nodeId, evidence) {
  assert(isText(evidence.text, 16000), "Evidence must contain captured text.");
  const record = { ...evidence, id: "e" + (run.evidence.length + 1), capturedAt: new Date().toISOString(), node: nodeId };
  run.evidence.push(record);
  getNode(run, nodeId).observed.push(record.id);
  trace(run, "evidence_captured", { node: nodeId, evidence: record.id, kind: record.kind });
  return record;
}

// The exact local context a model invocation receives for one node: the
// question, up to six resolved child findings, and up to five source excerpts
// the node (or its children) actually observed. Nothing about parents or siblings.
export function buildContext(run, node, { lookupsRemaining = null } = {}) {
  const resolved = children(run, node.id).filter((child) => child.status === "resolved");
  const childSummaries = resolved.slice(-6).map((child) => ({
    id: child.id,
    question: child.question,
    finding: child.finding.slice(0, 500),
    evidence: child.evidence,
  }));
  const evidenceIds = [...new Set([...node.observed, ...childSummaries.flatMap((child) => child.evidence)])];
  const excerpts = evidenceIds
    .slice(-5)
    .map((id) => run.evidence.find((record) => record.id === id))
    .filter(Boolean)
    // Excerpts carry a positional label as well as their ID: live mode cites by
    // label so the response grammar is the same for every node (see webllm.js).
    .map((record, index) => ({ id: record.id, label: String(index + 1), title: record.title, text: record.text.slice(0, EXCERPT_LIMIT), kind: record.kind, ...(record.headings?.length ? { sections: record.headings } : {}) }));
  const context = {
    question: node.question,
    children: childSummaries,
    evidence: excerpts,
    omittedChildren: resolved.length - childSummaries.length,
    omittedEvidence: evidenceIds.length - excerpts.length,
    excerptCharacterLimit: EXCERPT_LIMIT,
  };
  if (node.failedLookups?.length) context.failedLookups = node.failedLookups.slice(-5);
  if (lookupsRemaining !== null) context.lookupsRemaining = lookupsRemaining;
  // How many child questions decompose may propose here: none at the depth
  // ceiling, fewer as the node ceiling approaches. Live mode builds its grammar
  // from this, so a ceiling is a choice the model can see rather than a
  // rejection it cannot (experiments/2026-09-17-qwen3-0.6b-water-cycle-3).
  context.questionsAllowed = node.depth < run.limits.maxDepth ? Math.max(0, Math.min(3, run.limits.maxNodes - run.nodes.length)) : 0;
  return context;
}

export function parseModelOutput(text) {
  assert(typeof text === "string", "Model output was not text.");
  let body = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fenced = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) body = fenced[1];
  const result = JSON.parse(body);
  assert(result && typeof result === "object" && !Array.isArray(result), "Expected a JSON object.");
  return result;
}

// visibleEvidenceIds are the excerpt IDs that were actually in the model's
// context. A resolution may only cite those, so a model cannot manufacture evidence.
export function validateResult(run, node, result, visibleEvidenceIds) {
  assert(result && typeof result === "object", "Expected a result object.");
  assert(ACTIONS.includes(result.action), "Unknown action.");
  if (result.action === "wiki") {
    assert(isText(result.query, 180), "Wikipedia query must be 1–180 characters.");
  }
  if (result.action === "decompose") {
    assert(
      Array.isArray(result.questions) && result.questions.length >= 1 && result.questions.length <= 3,
      "Propose 1–3 questions.",
    );
    assert(result.questions.every((question) => isText(question, 300)), "Each question must be 1–300 characters.");
    assert(node.depth < run.limits.maxDepth, "Depth safety limit reached. The node remains unresolved.");
    assert(
      run.nodes.length + result.questions.length <= run.limits.maxNodes,
      "Node safety limit reached. The node remains unresolved.",
    );
  }
  if (result.action === "resolved") {
    assert(isText(result.finding, 1400), "A resolution needs a finding of 1–1,400 characters.");
    assert(
      Array.isArray(result.evidence) && result.evidence.length >= 1 && result.evidence.length <= 8,
      "A resolution needs inspected evidence IDs.",
    );
    assert(
      result.evidence.every((id) => visibleEvidenceIds.includes(id) && run.evidence.some((record) => record.id === id)),
      "Uninspected or invented evidence reference.",
    );
  }
  if (result.action === "blocked") {
    assert(isText(result.reason, 1000), "A blocked node needs a reason.");
  }
}

export function applyResult(run, nodeId, result, visibleEvidenceIds) {
  const node = getNode(run, nodeId);
  assert(node, "Unknown node.");
  assert(["open", "waiting", "working"].includes(node.status), "Node is not runnable.");
  validateResult(run, node, result, visibleEvidenceIds);
  if (result.action === "wiki") throw new Error("Tools do not mutate node outcomes.");
  if (result.action === "decompose") {
    node.status = "waiting";
    for (const question of result.questions) {
      run.nodes.push(makeNode("n" + (run.nodes.length + 1), nodeId, node.depth + 1, question.trim()));
    }
  } else if (result.action === "resolved") {
    node.status = "resolved";
    node.finding = result.finding.trim();
    node.evidence = [...new Set(result.evidence)];
  } else {
    node.status = "blocked";
    node.reason = result.reason;
  }
  trace(run, "node_" + result.action, { node: nodeId, result: clone(result) });
}

export function outcomeLabel(run) {
  if (run.nodes[0].status === "resolved") return "Root resolved";
  if (run.stopReason) return run.stopReason;
  return nextRunnable(run) ? "Ready" : "No runnable nodes · root unresolved";
}

// Imported runs are inspect-only. Everything is bounds-checked because the file
// came from outside; evidence URLs must be HTTPS Wikipedia so rendering a link is safe.
export function validateImport(text) {
  assert(typeof text === "string" && text.length < 8e6, "Import is too large (8 MB maximum).");
  const run = JSON.parse(text);
  assert(run && run.format === FORMAT, "Not a Tangle Pocket Lab export.");
  assert(["simulation", "live"].includes(run.mode) && isText(run.seed, 400), "Invalid run metadata.");
  assert(Array.isArray(run.nodes) && run.nodes.length >= 1 && run.nodes.length <= 150, "Invalid node count.");
  assert(Array.isArray(run.evidence) && run.evidence.length <= 300, "Invalid evidence count.");
  assert(Array.isArray(run.trace) && run.trace.length <= 5000, "Invalid trace count.");
  const evidenceIds = new Set();
  for (const record of run.evidence) {
    assert(
      /^e\d+$/.test(record.id) && !evidenceIds.has(record.id) && isText(record.text, 16000) && isText(record.title, 300),
      "Invalid evidence.",
    );
    evidenceIds.add(record.id);
    assert(["wiki", "fixture"].includes(record.kind), "Unknown evidence kind.");
    if (record.url) {
      const url = new URL(record.url);
      assert(
        url.protocol === "https:" && url.hostname === "en.wikipedia.org" && !url.username && !url.password,
        "Unsafe evidence URL.",
      );
    }
  }
  const nodeIds = new Set();
  for (const node of run.nodes) {
    assert(/^n\d+$/.test(node.id) && !nodeIds.has(node.id), "Invalid or duplicate node ID.");
    nodeIds.add(node.id);
    assert(isText(node.question, 400) && NODE_STATUSES.includes(node.status), "Invalid node.");
    assert(
      typeof node.finding === "string" && node.finding.length <= 1400 && typeof node.reason === "string" && node.reason.length <= 4000,
      "Invalid node text.",
    );
    assert(Number.isInteger(node.visits) && node.visits >= 0 && node.visits <= 10000, "Invalid visits.");
    for (const key of ["evidence", "observed"]) {
      assert(
        Array.isArray(node[key]) && node[key].length <= 300 && node[key].every((id) => evidenceIds.has(id)),
        "Missing evidence reference.",
      );
    }
    node.failedLookups ??= [];
    assert(
      Array.isArray(node.failedLookups) &&
        node.failedLookups.length <= 50 &&
        node.failedLookups.every((entry) => isText(entry?.query, 180) && isText(entry?.error, 300)),
      "Invalid failed lookups.",
    );
  }
  assert(run.nodes[0].id === "n1" && run.nodes[0].parent === null, "Invalid root.");
  for (const node of run.nodes) {
    let current = node;
    let depth = 0;
    const seen = new Set();
    while (current.parent !== null) {
      assert(!seen.has(current.id), "Cycle in parent references.");
      seen.add(current.id);
      current = run.nodes.find((candidate) => candidate.id === current.parent);
      assert(current, "Missing parent.");
      depth++;
    }
    assert(current.id === "n1" && depth === node.depth, "Disconnected node or invalid depth.");
    if (node.status === "working") {
      node.status = "error";
      node.reason = "Exported while in progress; inspect only.";
    }
  }
  for (const key of ["visits", "modelCalls", "tokens", "lookups"]) {
    assert(Number.isFinite(run[key]) && run[key] >= 0, "Invalid counters.");
  }
  run.readOnly = true;
  return run;
}
