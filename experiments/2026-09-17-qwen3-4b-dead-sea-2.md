# live run · Qwen3-4B-q4f16_1-MLC · Why is the Dead Sea shrinking?

- date: 2026-09-17T20:11:47.020Z
- commit: b7bc2c9 (docs/index.html as served; the page loaded at run start)
- machine: Apple M1 Max, 32 GB, darwin 25.6.0
- browser: 152.0.7977.83
- run wall time: 57 s · retries used: 0

## Driver log

- 2026-09-17T20:11:46.922Z opened http://127.0.0.1:8765/ in 152.0.7977.83 (darwin arm64, Apple M1 Max)
- device: WebGPU adapter found · secure context · cache: cache · storage headroom: 10.00 GiB
- 2026-09-17T20:11:47.064Z loading: Checking this device before downloading…
- 2026-09-17T20:11:52.069Z loading: Ready. Inference runs on this device.
- model Qwen3-4B-q4f16_1-MLC: Ready. Inference runs on this device. (5 s)
- 2026-09-17T20:12:49.467Z run stopped: Root resolved

## Summary

```
live run · seed: Why is the Dead Sea shrinking?
model Qwen3-4B-q4f16_1-MLC · prompt tangle-pocket-8 · created 2026-09-17T20:11:47.020Z · exported 2026-09-17T20:12:49.470Z
nodes 1 · visits 1 · model calls 2 · lookups 1 · evidence 1 · tokens 1293
statuses {"resolved":1} · outcome: root resolved

n1 [resolved] Why is the Dead Sea shrinking? → The Dead Sea is shrinking due to the diversion of the Jordan River for agriculture and the

model latency ms: median 33551 · max 33551 · n 2
worth a look:
- n1 finding uses words absent from its cited excerpts: shrink, diversion, agriculture, outlet, lead, reduc …
```

## Observations

(the three strangest things in the trace, quoting node questions and raw model output)
