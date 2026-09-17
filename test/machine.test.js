// The health parsers read real macOS output; the fixtures below are verbatim
// from this machine (an M1 Max under a model run) and from the throttled shape
// pmset prints once a limit has been recorded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSample, parseGpu, parseMemory, parseThermal, summariseSamples } from "../scripts/machine.js";

const IOREG = `  +-o IOGPU  <class AGXAcceleratorG13X>
      "PerformanceStatistics" = {"In use system memory (driver)"=0,"Alloc system memory"=4428201984,"Tiler Utilization %"=62,"recoveryCount"=0,"Renderer Utilization %"=62,"TiledSceneBytes"=950272,"Device Utilization %"=94,"SplitSceneCount"=0,"In use system memory"=2541387776}
      "IOClass" = "AGXAcceleratorG13X"`;

test("GPU statistics come out of ioreg's flat dict, with bytes converted", () => {
  const gpu = parseGpu(IOREG);
  assert.deepEqual(gpu, { devices: 1, devicePercent: 94, rendererPercent: 62, inUseBytes: 2541387776, allocatedBytes: 4428201984, inUseGiB: 2.37 });
  assert.equal(parseGpu("nothing here"), null);
  assert.equal(parseGpu(undefined), null);
});

test("with more than one accelerator, the busiest sets the percentage and the memory adds up", () => {
  const two = IOREG + `\n  +-o IOGPU2  <class AGXAcceleratorG13X>\n      "PerformanceStatistics" = {"Device Utilization %"=12,"Renderer Utilization %"=8,"In use system memory"=1073741824,"Alloc system memory"=2147483648}`;
  const gpu = parseGpu(two);
  assert.equal(gpu.devices, 2);
  assert.equal(gpu.devicePercent, 94);
  assert.equal(gpu.inUseBytes, 2541387776 + 1073741824);
  assert.equal(gpu.inUseGiB, 3.37);
});

test("thermal: notes mean nothing was recorded; a speed limit below 100 is a throttle", () => {
  const quiet = parseThermal("Note: No thermal warning level has been recorded\nNote: No CPU power status has been recorded");
  assert.deepEqual(quiet, { recorded: false, speedLimit: null, throttled: false, values: {} });
  const hot = parseThermal("CPU_Scheduler_Limit \t= 100\nCPU_Available_CPUs \t= 10\nCPU_Speed_Limit \t= 63");
  assert.equal(hot.recorded, true);
  assert.equal(hot.speedLimit, 63);
  assert.equal(hot.throttled, true);
  assert.equal(hot.values.CPU_Available_CPUs, 10);
  assert.equal(parseThermal("CPU_Speed_Limit \t= 100").throttled, false);
});

test("memory: free percentage and the kernel's pressure level are named", () => {
  const reading = parseMemory("The system has 34359738368 (2097152 pages with a page size of 16384).\nSystem-wide memory free percentage: 80%", "kern.memorystatus_vm_pressure_level: 1");
  assert.deepEqual(reading, { freePercent: 80, level: 1, levelName: "normal" });
  assert.equal(parseMemory("", "kern.memorystatus_vm_pressure_level: 4").levelName, "critical");
  assert.equal(parseMemory("", "").levelName, "unknown");
});

test("a series rolls up to min, max and mean, and counts throttled samples", () => {
  const reading = (gpu, limit, free) => ({ time: "t", gpu: { devicePercent: gpu, inUseGiB: 2.5 }, thermal: parseThermal(`CPU_Speed_Limit = ${limit}`), memory: { freePercent: free, levelName: "normal" }, load: { one: 4 } });
  const rolled = summariseSamples([reading(94, 100, 80), reading(50, 70, 60), reading(70, 100, 70)]);
  assert.deepEqual(rolled.gpuPercent, { min: 50, max: 94, mean: 71.3 });
  assert.deepEqual(rolled.memoryFreePercent, { min: 60, max: 80, mean: 70 });
  assert.equal(rolled.throttledSamples, 1);
  assert.equal(rolled.worstSpeedLimit, 70);
  assert.equal(rolled.samples, 3);
  assert.equal(summariseSamples([]), null);
});

test("the one-line format names a throttle rather than burying it", () => {
  const base = { gpu: { devicePercent: 94, inUseGiB: 2.37 }, memory: { freePercent: 80, levelName: "normal" }, load: { one: 3.2 } };
  assert.equal(formatSample({ ...base, thermal: parseThermal("Note: none") }), "gpu 94% · vram 2.37 GiB · load 3.2 · mem 80% free (normal) · no throttling recorded");
  assert.match(formatSample({ ...base, thermal: parseThermal("CPU_Speed_Limit = 63") }), /THROTTLED to 63%/);
});
