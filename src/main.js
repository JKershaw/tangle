// UI wiring for the pocket lab. All graph logic lives in graph.js and
// episode.js; this file only renders state and forwards user intent.

import * as webllm from "@mlc-ai/web-llm";
import { clone, createRun, nextRunnable, outcomeLabel, trace, validateImport, buildContext, VERSION } from "./graph.js";
import { runEpisode } from "./episode.js";
import { PRESETS, SIMULATION_SEED, simulationDrivers } from "./simulation.js";
import { lookupWikipedia } from "./wiki.js";
import { MODELS, RUNTIME, createEngineAdapter, createLiveGenerator, downloadBytes, probeEnvironment, requestPersistence } from "./webllm.js";
import { GraphMap } from "./map.js";

const $ = (id) => document.getElementById(id);
const make = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
const gib = (bytes) => (bytes == null ? "unknown" : (bytes / 1024 ** 3).toFixed(2) + " GiB");

// ---- state ----
const runs = { simulation: createRun(SIMULATION_SEED, "simulation"), live: createRun(SIMULATION_SEED, "live") };
runs.simulation.preset = PRESETS[0];
let mode = "simulation";
let imported = null;
let selected = "n1";
let activeNode = "n1";
let running = false; // an episode is in flight
let autorun = false; // the Run loop is active
let busy = false; // model load/unload/cache work in progress
let controller = null;
let loadedModel = null;
let approvalResolver = null;
const current = () => imported || runs[mode];
const locked = () => running || autorun || busy;

const engineOptions = { cacheBackend: "cache" };
const adapter = createEngineAdapter(webllm, engineOptions);

const map = new GraphMap($("map"), {
  onSelect: (id) => {
    selected = id;
    map.follow = false;
    $("follow").checked = false;
    if (map.scale < 0.6) {
      map.scale = 0.9;
      map.focus(id);
    }
    render();
  },
  onManualMove: () => {
    $("follow").checked = false;
  },
});

for (const model of MODELS) {
  const option = make("option", model.label);
  option.value = model.id;
  $("model").append(option);
}

const setStatus = (text) => {
  $("status").textContent = text;
};

// ---- rendering ----
function render() {
  const run = current();
  $("simMode").setAttribute("aria-pressed", String(mode === "simulation"));
  $("liveMode").setAttribute("aria-pressed", String(mode === "live"));
  $("simMode").disabled = locked();
  $("liveMode").disabled = locked();
  $("simSetup").hidden = mode !== "simulation" || !!imported;
  $("liveSetup").hidden = mode !== "live" || !!imported;
  $("modeNote").textContent = imported
    ? "Imported run · inspection only"
    : mode === "simulation"
      ? "Precomputed responses · no network"
      : "Inference on this device · Wikipedia online";
  $("run").textContent = autorun ? "Pause after node" : mode === "simulation" ? "Run simulation" : "Run local model";
  const canRun = !imported && !busy && (!running || autorun) && !!nextRunnable(run) && !run.stopReason && (mode === "simulation" || !!loadedModel);
  $("run").disabled = !canRun && !autorun;
  $("step").disabled = locked() || !canRun;
  $("stop").disabled = !running && !autorun;
  for (const id of ["reset", "scenario", "newLive", "import", "autoWiki"]) $(id).disabled = locked();
  $("model").disabled = locked() || !!loadedModel;
  $("loadModel").disabled = locked() || !!loadedModel;
  $("unloadModel").disabled = !loadedModel || locked();
  $("checkDevice").disabled = locked();
  $("clearModel").disabled = locked() || !!loadedModel;
  $("testWiki").disabled = locked();

  const resolved = run.nodes.filter((node) => node.status === "resolved").length;
  $("metrics").replaceChildren(
    ...[
      [run.nodes.length, "nodes"],
      [run.visits, "visits"],
      [run.modelCalls, mode === "simulation" ? "scripted calls" : "model calls"],
      [resolved, "resolved"],
    ].map(([value, label]) => {
      const span = make("span");
      span.append(make("b", value), document.createTextNode(" " + label));
      return span;
    }),
  );
  map.follow = $("follow").checked;
  map.draw(run, selected, $("follow").checked ? activeNode : null);

  const node = run.nodes.find((candidate) => candidate.id === selected) || run.nodes[0];
  selected = node.id;
  $("nodeId").textContent = node.id + (node.parent ? " · child of " + node.parent : " · seed");
  $("nodeStatus").textContent = node.status;
  $("nodeQuestion").textContent = node.question;
  $("nodeVisits").textContent = `${node.visits} visits · depth ${node.depth} · ${node.observed.length} sources read here`;
  $("finding").replaceChildren();
  if (node.finding) {
    $("finding").append(make("strong", "Finding"), make("p", node.finding));
  } else if (node.reason) {
    $("finding").append(make("strong", node.status === "error" ? "Harness stopped" : "Unresolved"), make("p", node.reason));
  } else {
    $("finding").append(
      make(
        "p",
        node.status === "waiting" ? "Waiting for child findings. A fresh visit must still decide whether this question is resolved." : "No finding yet.",
        "muted",
      ),
    );
  }
  $("evidence").replaceChildren();
  for (const id of [...new Set([...node.evidence, ...node.observed])]) {
    const record = run.evidence.find((candidate) => candidate.id === id);
    if (!record) continue;
    const card = make("div", undefined, "evidence-card");
    card.append(make("strong", record.id + " · " + record.title));
    card.append(
      make(
        "p",
        record.kind === "fixture"
          ? "Illustrative fixture · not a fetched source"
          : (record.exact ? "Wikipedia summary" : "Wikipedia search snippet") + " · captured " + record.capturedAt,
        "muted",
      ),
    );
    card.append(make("blockquote", record.text));
    if (record.url) {
      const link = make("a", "Source article ↗");
      link.href = record.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      card.append(link);
    }
    $("evidence").append(card);
  }
  if (node.failedLookups?.length) {
    const list = make("p", undefined, "small muted");
    list.textContent = "Lookups that found nothing: " + node.failedLookups.map((entry) => `“${entry.query}” (${entry.error})`).join("; ");
    $("evidence").append(list);
  }
  const lastInput = [...run.trace].reverse().find((event) => event.event === "model_input" && event.node === node.id);
  $("context").textContent = JSON.stringify(lastInput?.context || buildContext(run, node), null, 2) + (lastInput ? "" : "\n\nNot yet sent to a model.");
  $("nodeTrace").textContent =
    run.trace.filter((event) => event.node === node.id).map((event) => JSON.stringify(event, null, 2)).join("\n\n") || "No invocations yet.";
  $("retry").hidden = !!imported || !["error", "blocked"].includes(node.status);
  $("retry").disabled = running || busy;
}

function resetView() {
  selected = "n1";
  activeNode = "n1";
  map.active = null;
  map.follow = true;
  $("follow").checked = true;
}

function switchMode(next) {
  if (locked()) return;
  mode = next;
  imported = null;
  resetView();
  render();
  setStatus(outcomeLabel(current()) + ". The " + mode + " graph is kept separate.");
}
$("simMode").onclick = () => switchMode("simulation");
$("liveMode").onclick = () => switchMode("live");

function newRun() {
  if (locked()) return;
  if (current().visits > 0 && !confirm("Start a new graph? Export first if you want to keep this run.")) return;
  try {
    imported = null;
    runs[mode] = createRun(mode === "simulation" ? SIMULATION_SEED : $("seed").value.trim(), mode);
    if (mode === "simulation") runs[mode].preset = $("scenario").value;
    $("autoWiki").checked = false;
    resetView();
    map.scale = 1;
    render();
    setStatus("One seed. Ready to investigate.");
  } catch (error) {
    setStatus(error.message);
  }
}
$("reset").onclick = newRun;
$("newLive").onclick = newRun;
$("scenario").onchange = () => {
  const preset = $("scenario").value;
  newRun();
  if (runs.simulation.preset !== preset) $("scenario").value = runs.simulation.preset;
};

// ---- drivers ----
function pace(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function approveLookup(query, signal) {
  if ($("autoWiki").checked) return true;
  $("approvalQuery").textContent = query;
  $("approval").hidden = false;
  setStatus("Waiting for your Wikipedia approval.");
  return new Promise((resolve) => {
    const settle = (decision) => {
      signal.removeEventListener("abort", onAbort);
      approvalResolver = null;
      $("approval").hidden = true;
      resolve(decision);
    };
    const onAbort = () => settle(false);
    approvalResolver = settle;
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) settle(false);
  });
}
$("allow").onclick = () => approvalResolver?.(true);
$("deny").onclick = () => approvalResolver?.(false);

async function liveWiki(query, { signal }) {
  const result = await lookupWikipedia(query, { signal });
  if (!result.ok && result.error?.kind === "unreachable") {
    return {
      ...result,
      upstreamError: result.error,
      error: {
        kind: "unreachable",
        message:
          "Wikipedia lookup did not complete. This browser may be blocking requests from the current origin, or the network/API may be unavailable. Try Test Wiki access, or the served copy of this page. Request details are retained in the trace.",
      },
    };
  }
  return result;
}

function driversFor(run) {
  if (run.mode === "simulation") {
    return { ...simulationDrivers(run.preset), pace: (signal) => pace(320, signal) };
  }
  return { generate: createLiveGenerator(adapter), wiki: liveWiki, approve: approveLookup, pace: null };
}

// ---- running ----
async function step() {
  if (running || imported || busy) return false;
  const run = current();
  if (run.mode === "live" && !loadedModel) {
    setStatus("Load a local model first.");
    return false;
  }
  running = true;
  controller = new AbortController();
  if (run.mode === "live") {
    run.model = loadedModel;
    run.runtime = RUNTIME;
  }
  render();
  const ok = await runEpisode(run, {
    ...driversFor(run),
    signal: controller.signal,
    onUpdate: (nodeId, message) => {
      if (nodeId) {
        activeNode = nodeId;
        if ($("follow").checked) selected = nodeId;
      }
      if (message) setStatus(nodeId + " · " + message);
      render();
    },
  });
  const cancelled = controller.signal.aborted;
  running = false;
  controller = null;
  if (cancelled) setStatus("Stopped. Captured evidence and the raw trace are retained.");
  else if (!ok || !nextRunnable(run) || run.nodes[0].status === "resolved") setStatus(outcomeLabel(run));
  render();
  return ok && !cancelled;
}
$("step").onclick = () => {
  step();
};
$("run").onclick = async () => {
  if (autorun) {
    autorun = false;
    $("run").textContent = "Pausing…";
    $("run").disabled = true;
    return;
  }
  autorun = true;
  render();
  while (autorun) {
    const ok = await step();
    if (!ok || !nextRunnable(current()) || current().stopReason) break;
    await new Promise((resolve) => setTimeout(resolve, mode === "simulation" ? 550 : 50));
  }
  autorun = false;
  render();
};
$("stop").onclick = () => {
  autorun = false;
  controller?.abort(new DOMException("Stopped by user", "AbortError"));
  if (!running) {
    setStatus("Stopped between visits.");
    render();
  }
};
$("retry").onclick = () => {
  const run = current();
  const node = run.nodes.find((candidate) => candidate.id === selected);
  if (!node || running || imported) return;
  node.status = run.nodes.some((candidate) => candidate.parent === node.id) ? "waiting" : "open";
  node.reason = "";
  run.stopReason = null;
  trace(run, "manual_retry", { node: node.id });
  render();
  setStatus("Retry queued. Press One node or Run.");
};

// ---- map controls ----
$("fit").onclick = () => {
  $("follow").checked = false;
  map.follow = false;
  map.fit();
};
$("zoomIn").onclick = () => map.zoom(1.2);
$("zoomOut").onclick = () => map.zoom(1 / 1.2);
$("follow").onchange = () => {
  map.follow = $("follow").checked;
  if (map.follow) map.focus(activeNode);
};

// ---- model management ----
async function checkDevice() {
  $("deviceStatus").textContent = "Checking WebGPU and storage…";
  const report = await probeEnvironment();
  if (report.cache !== "unavailable") engineOptions.cacheBackend = report.cache;
  $("deviceStatus").textContent =
    (report.webgpu ? "WebGPU adapter found" : "WebGPU unavailable: " + report.reason) +
    " · " +
    (report.secure ? "secure context" : "insecure context") +
    " · cache: " +
    report.cache +
    " · storage headroom: " +
    gib(report.storage.freeBytes);
  return report;
}
$("checkDevice").onclick = async () => {
  try {
    await checkDevice();
  } catch (error) {
    $("deviceStatus").textContent = error.message;
  }
};
$("loadModel").onclick = async () => {
  if (busy || running) return;
  busy = true;
  render();
  $("loadStatus").textContent = "Checking this device before downloading…";
  try {
    const report = await checkDevice();
    if (!report.webgpu) throw new Error("No usable WebGPU adapter. Try a compatible browser or the served copy of this page; simulation remains available.");
    if (report.cache === "unavailable") throw new Error("This origin cannot use persistent model storage. Open an HTTPS or localhost copy of this page.");
    const modelId = $("model").value;
    const needed = downloadBytes(modelId);
    if (!(await adapter.isCached(modelId)) && needed && report.storage.freeBytes !== null && report.storage.freeBytes < needed) {
      throw new Error(`Model needs approximately ${gib(needed)} of storage; browser reports ${gib(report.storage.freeBytes)} free.`);
    }
    $("loadProgress").hidden = false;
    await requestPersistence();
    await adapter.load(modelId, (progress) => {
      $("loadProgress").value = progress.progress;
      $("loadStatus").textContent = progress.text || "Loading model…";
    });
    loadedModel = modelId;
    $("modelBadge").textContent = "ready";
    $("loadStatus").textContent = "Ready. Inference runs on this device.";
    $("loadProgress").value = 1;
    $("modelSettings").open = false;
    setStatus("Local model loaded. Start a graph or press Run.");
  } catch (error) {
    $("loadStatus").textContent = "Could not load: " + String(error.message || error) + ". You can retry, free storage, or use simulation.";
    $("modelBadge").textContent = "not loaded";
  } finally {
    busy = false;
    render();
  }
};
$("unloadModel").onclick = async () => {
  busy = true;
  render();
  try {
    await adapter.unload();
    loadedModel = null;
    $("modelBadge").textContent = "not loaded";
    $("loadStatus").textContent = "Model unloaded from memory; cached download kept.";
    $("loadProgress").hidden = true;
  } catch (error) {
    $("loadStatus").textContent = error.message;
  } finally {
    busy = false;
    render();
  }
};
$("clearModel").onclick = async () => {
  if (!confirm("Delete cached weights for the selected model? They will need to download again.")) return;
  busy = true;
  render();
  const ok = await adapter.deleteFromCache($("model").value);
  $("loadStatus").textContent = ok
    ? "Selected model cache removed; it can be downloaded again."
    : "Could not clear the cache. Use this browser’s site-storage controls if necessary.";
  busy = false;
  render();
};
$("testWiki").onclick = async () => {
  if (!confirm("Send the search term “Water cycle” to English Wikipedia to test access?")) return;
  running = true;
  controller = new AbortController();
  render();
  $("wikiTestStatus").textContent = "Testing Wikipedia search and summary…";
  try {
    const result = await liveWiki("Water cycle", { signal: controller.signal });
    $("wikiTestStatus").textContent = result.ok
      ? `Success: ${result.title} (${result.exact ? "article summary" : "search snippet fallback"}). No evidence was added to the graph.`
      : "Failed: " + result.error.message;
  } catch (error) {
    $("wikiTestStatus").textContent = error.message;
  } finally {
    running = false;
    controller = null;
    render();
  }
};

// ---- export / import ----
$("export").onclick = () => {
  const run = clone(current());
  run.exportedAt = new Date().toISOString();
  run.version = VERSION;
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = make("a");
  link.href = url;
  link.download = "tangle-" + run.mode + "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
$("import").onclick = () => $("importFile").click();
$("importFile").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 8e6) throw new Error("Maximum import size is 8 MB.");
    imported = validateImport(await file.text());
    mode = imported.mode;
    resetView();
    render();
    map.fit();
    setStatus("Imported " + file.name + " · inspect-only; your existing runs are unchanged.");
  } catch (error) {
    setStatus("Import rejected: " + error.message);
  } finally {
    event.target.value = "";
  }
};

$("helpButton").onclick = () => {
  const help = $("help");
  help.open = !help.open;
  if (help.open) help.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
};
window.addEventListener("beforeunload", (event) => {
  if (running || busy) {
    event.preventDefault();
    event.returnValue = "";
  }
});

// Exposed for browser-level tests only.
window.__tangle = { current, step, runs: () => runs };
render();
