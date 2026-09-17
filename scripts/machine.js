// What this machine is doing while a model runs. macOS exposes no die
// temperature without root, so this reports the two signals that actually
// change a reading: how hard the GPU is working, and whether the system has
// started throttling or leaning on memory. Pure parsers, shelled-out sources.
import { execFileSync } from "node:child_process";
import os from "node:os";

const run = (command, args) => {
  try {
    return execFileSync(command, args, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};

// ioreg prints each accelerator's PerformanceStatistics as one flat dict. This
// machine has a single GPU, but a machine with more would print several, so
// take the busiest and add up the memory. The numbers are instantaneous: a
// sample between two model calls reads 0%, which is why runs are sampled
// repeatedly rather than once.
export function parseGpu(text) {
  const devices = [...String(text ?? "").matchAll(/"PerformanceStatistics"\s*=\s*\{([^}]*)\}/g)].map((match) => {
    const read = (key) => {
      const found = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*=\\s*(\\d+)`).exec(match[1]);
      return found ? Number(found[1]) : null;
    };
    return { devicePercent: read("Device Utilization %"), rendererPercent: read("Renderer Utilization %"), inUseBytes: read("In use system memory"), allocatedBytes: read("Alloc system memory") };
  });
  if (!devices.length) return null;
  const busiest = devices.reduce((best, device) => ((device.devicePercent ?? -1) > (best.devicePercent ?? -1) ? device : best));
  const total = (key) => devices.reduce((sum, device) => sum + (device[key] ?? 0), 0);
  const bytes = total("inUseBytes");
  return {
    devices: devices.length,
    devicePercent: busiest.devicePercent,
    rendererPercent: busiest.rendererPercent,
    inUseBytes: bytes,
    allocatedBytes: total("allocatedBytes"),
    inUseGiB: Number((bytes / 1024 ** 3).toFixed(2)),
  };
}

// `pmset -g therm` prints notes when nothing has been recorded, and CPU_Speed_Limit
// and friends once the system has throttled. A limit below 100 is the throttle.
export function parseThermal(text) {
  const values = {};
  for (const [, key, value] of (text ?? "").matchAll(/^\s*(CPU_[A-Za-z_]+)\s*=\s*(\d+)/gm)) values[key] = Number(value);
  const recorded = Object.keys(values).length > 0;
  const speedLimit = values.CPU_Speed_Limit ?? null;
  return { recorded, speedLimit, throttled: speedLimit !== null && speedLimit < 100, values };
}

// `memory_pressure -Q` reports free percentage; the sysctl reports the level
// the kernel is in (1 normal, 2 warning, 4 critical).
export function parseMemory(pressureText, levelText) {
  const free = /free percentage:\s*(\d+)/.exec(pressureText ?? "");
  const level = /:\s*(\d+)/.exec(levelText ?? "");
  const levels = { 1: "normal", 2: "warning", 4: "critical" };
  const value = level ? Number(level[1]) : null;
  return { freePercent: free ? Number(free[1]) : null, level: value, levelName: levels[value] ?? "unknown" };
}

export function sample() {
  const gpu = parseGpu(run("ioreg", ["-r", "-d", "1", "-w", "0", "-c", "IOAccelerator"]));
  const thermal = parseThermal(run("pmset", ["-g", "therm"]));
  const memory = parseMemory(run("memory_pressure", ["-Q"]), run("sysctl", ["kern.memorystatus_vm_pressure_level"]));
  const [one, five, fifteen] = os.loadavg();
  return { time: new Date().toISOString(), gpu, thermal, memory, load: { one: Number(one.toFixed(2)), five: Number(five.toFixed(2)), fifteen: Number(fifteen.toFixed(2)) } };
}

export const formatSample = (reading) =>
  [
    `gpu ${reading.gpu?.devicePercent ?? "?"}%`,
    `vram ${reading.gpu?.inUseGiB ?? "?"} GiB`,
    `load ${reading.load.one}`,
    `mem ${reading.memory.freePercent ?? "?"}% free (${reading.memory.levelName})`,
    reading.thermal.throttled ? `THROTTLED to ${reading.thermal.speedLimit}%` : reading.thermal.recorded ? `cpu limit ${reading.thermal.speedLimit}%` : "no throttling recorded",
  ].join(" · ");

// Roll a series of samples into the few numbers an experiment note wants.
export function summariseSamples(samples) {
  if (!samples.length) return null;
  const numbers = (pick) => samples.map(pick).filter((value) => Number.isFinite(value));
  const stat = (values) => (values.length ? { min: Math.min(...values), max: Math.max(...values), mean: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) } : null);
  return {
    samples: samples.length,
    gpuPercent: stat(numbers((reading) => reading.gpu?.devicePercent)),
    vramGiB: stat(numbers((reading) => reading.gpu?.inUseGiB)),
    load: stat(numbers((reading) => reading.load.one)),
    memoryFreePercent: stat(numbers((reading) => reading.memory.freePercent)),
    throttledSamples: samples.filter((reading) => reading.thermal.throttled).length,
    worstSpeedLimit: Math.min(...samples.map((reading) => reading.thermal.speedLimit ?? 100)),
  };
}

// A sampler a driver can start and stop around a run.
export function startSampling(intervalMs = 15000) {
  const samples = [sample()];
  const timer = setInterval(() => samples.push(sample()), intervalMs);
  timer.unref?.();
  return { samples, stop: () => (clearInterval(timer), summariseSamples(samples)) };
}

if (process.argv[1]?.endsWith("machine.js")) {
  const every = Number(process.argv[2] ?? 0);
  console.log(formatSample(sample()));
  if (every > 0) setInterval(() => console.log(formatSample(sample())), every * 1000);
}
