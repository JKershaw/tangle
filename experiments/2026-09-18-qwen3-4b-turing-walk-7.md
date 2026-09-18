# live run · Qwen3-4B-q4f16_1-MLC · Tell me about Alan Turing and elaborate on the impact of his work.

- date: 2026-09-18T14:03:21.264Z
- commit: 0738bb5 (docs/index.html as served; the page loaded at run start)
- machine: Apple M1 Max, 32 GB, darwin 25.6.0
- browser: 153.0.8010.50
- run wall time: 8 s · retries used: 0
- machine during the run: {"samples":1,"gpuPercent":{"min":0,"max":0,"mean":0},"vramGiB":{"min":0.43,"max":0.43,"mean":0.4},"load":{"min":24.54,"max":24.54,"mean":24.5},"memoryFreePercent":{"min":85,"max":85,"mean":85},"throttledSamples":0,"worstSpeedLimit":100}

## Driver log

- 2026-09-18T14:03:15.955Z opened http://127.0.0.1:8765/ in 153.0.8010.50 (darwin arm64, Apple M1 Max)
- page versions: {"prompt":"tangle-pocket-10","schema":"per-action-7","walk":"walk-7","asks":"asks-2","variants":{"sentence":"list","section":"list","missing":"search","question":"one","article":"snippets","confirm":"yesno"},"runtime":"@mlc-ai/web-llm@0.2.84","page":"0.2.0"}
- device: WebGPU adapter found · secure context · cache: cache · storage headroom: 10.00 GiB
- 2026-09-18T14:03:16.068Z loading: Checking this device before downloading…
- 2026-09-18T14:03:21.073Z loading: Ready. Inference runs on this device.
- model Qwen3-4B-q4f16_1-MLC: Ready. Inference runs on this device. (5 s)
- wiki recording: 438 responses loaded from evals/wiki-cache
- seed: Tell me about Alan Turing and elaborate on the impact of his work. · limits {"maxNodes":40,"maxVisits":60,"maxDepth":6,"maxLookups":2,"maxPasses":6,"revisitSettled":true,"walk":true,"maxSentences":3}
- machine at start: gpu 80% · vram 0.43 GiB · load 24.54 · mem 85% free (normal) · no throttling recorded
- 2026-09-18T14:03:29.124Z run stopped: Root resolved
- machine during the run: gpu 0% mean, 0% peak · vram up to 0.43 GiB · load up to 24.54 · no throttling in 1 samples
- wiki recording: 4 hits, 0 misses, 0 new responses saved

## Summary

```
live run · seed: Tell me about Alan Turing and elaborate on the impact of his work.
model Qwen3-4B-q4f16_1-MLC · prompt walk-7/asks-2/sentence:list,section:list,missing:search,question:one,article:snippets,confirm:yesno · created 2026-09-18T14:03:21.264Z · exported 2026-09-18T14:03:29.219Z
nodes 1 · visits 1 · model calls 4 · lookups 1 · evidence 1 · tokens 1778
statuses {"resolved":1} · outcome: root resolved

n1 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. → He was highly influential in the development of theoretical computer science, providing a 

model latency ms: median 1758 · max 1763 · n 4
nothing flagged
```

## Observations

(the three strangest things in the trace, quoting node questions and raw model output)
