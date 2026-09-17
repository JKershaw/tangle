# live run · Qwen3-8B-q4f16_1-MLC · Why is the Dead Sea shrinking?

- date: 2026-09-17T20:16:10.140Z
- commit: 774159e (docs/index.html as served; the page loaded at run start)
- machine: Apple M1 Max, 32 GB, darwin 25.6.0
- browser: 152.0.7977.83
- run wall time: 95 s · retries used: 0

## Driver log

- 2026-09-17T20:16:10.024Z opened http://127.0.0.1:8765/ in 152.0.7977.83 (darwin arm64, Apple M1 Max)
- device: WebGPU adapter found · secure context · cache: cache · storage headroom: 10.00 GiB
- 2026-09-17T20:16:10.184Z loading: Checking this device before downloading…
- 2026-09-17T20:16:20.217Z loading: Ready. Inference runs on this device.
- model Qwen3-8B-q4f16_1-MLC: Ready. Inference runs on this device. (10 s)
- 2026-09-17T20:17:55.000Z run stopped: Root resolved

## Summary

```
live run · seed: Why is the Dead Sea shrinking?
model Qwen3-8B-q4f16_1-MLC · prompt tangle-pocket-9 · created 2026-09-17T20:16:10.140Z · exported 2026-09-17T20:17:55.003Z
nodes 1 · visits 1 · model calls 3 · lookups 2 · evidence 2 · tokens 2417
statuses {"resolved":1} · outcome: root resolved

n1 [resolved] Why is the Dead Sea shrinking? → The Dead Sea is shrinking primarily due to the diversion of water from the Jordan River to

model latency ms: median 33667 · max 35187 · n 3
nothing flagged
```

## Observations

Second 8B run, first with the neutral prompt example (tangle-pocket-9); the earlier 8B run had the answer's section named in its prompt. Root resolved, three model calls.

1. **Without the hint, it still found the section.** First query `"Dead Sea"` → the lead with thirty headings. Second query `"Dead Sea / Receding shoreline"` — chosen from the listed headings, this time on its own. Then resolved.

2. **A correct, specific, fully supported finding.** "The Dead Sea is shrinking primarily due to the diversion of water from the Jordan River to the north as part of the National Water Carrier scheme, which was completed in 1964. This has led to a significant decrease in the water level, with the Dead Sea's surface dropping from 395 m (1,296 ft) below sea level in 1970 to 439 m (1,440 ft) below sea level by 2025." Both excerpts cited; nothing flagged. The figures are from § Receding shoreline.

This is the run the first 8B run should have been. Latencies are three grammar compiles.
