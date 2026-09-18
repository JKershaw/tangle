# live run · Qwen3-8B-q4f16_1-MLC · Tell me about Alan Turing and elaborate on the impact of his work.

- date: 2026-09-18T14:02:45.243Z
- commit: 0738bb5 (docs/index.html as served; the page loaded at run start)
- machine: Apple M1 Max, 32 GB, darwin 25.6.0
- browser: 153.0.8010.50
- run wall time: 20 s · retries used: 0
- machine during the run: {"samples":2,"gpuPercent":{"min":0,"max":98,"mean":49},"vramGiB":{"min":0.4,"max":5.5,"mean":3},"load":{"min":16.55,"max":16.92,"mean":16.7},"memoryFreePercent":{"min":69,"max":85,"mean":77},"throttledSamples":0,"worstSpeedLimit":100}

## Driver log

- 2026-09-18T14:02:34.913Z opened http://127.0.0.1:8765/ in 153.0.8010.50 (darwin arm64, Apple M1 Max)
- page versions: {"prompt":"tangle-pocket-10","schema":"per-action-7","walk":"walk-7","asks":"asks-2","variants":{"sentence":"list","section":"list","missing":"search","question":"one","article":"snippets","confirm":"yesno"},"runtime":"@mlc-ai/web-llm@0.2.84","page":"0.2.0"}
- device: WebGPU adapter found · secure context · cache: cache · storage headroom: 10.00 GiB
- 2026-09-18T14:02:35.021Z loading: Checking this device before downloading…
- 2026-09-18T14:02:45.028Z loading: Ready. Inference runs on this device.
- model Qwen3-8B-q4f16_1-MLC: Ready. Inference runs on this device. (10 s)
- wiki recording: 434 responses loaded from evals/wiki-cache
- seed: Tell me about Alan Turing and elaborate on the impact of his work. · limits {"maxNodes":40,"maxVisits":60,"maxDepth":6,"maxLookups":2,"maxPasses":6,"revisitSettled":true,"walk":true,"maxSentences":3}
- machine at start: gpu 15% · vram 0.38 GiB · load 16.55 · mem 85% free (normal) · no throttling recorded
- 2026-09-18T14:03:04.845Z run stopped: Root resolved
- machine during the run: gpu 49% mean, 98% peak · vram up to 5.5 GiB · load up to 16.92 · no throttling in 2 samples
- wiki recording: 1 hits, 4 misses, 4 new responses saved

## Summary

```
live run · seed: Tell me about Alan Turing and elaborate on the impact of his work.
model Qwen3-8B-q4f16_1-MLC · prompt walk-7/asks-2/sentence:check,section:list,missing:search,question:one,article:snippets,confirm:yesno · created 2026-09-18T14:02:45.243Z · exported 2026-09-18T14:03:04.939Z
nodes 1 · visits 1 · model calls 8 · lookups 2 · evidence 2 · tokens 2292
statuses {"resolved":1} · outcome: root resolved

n1 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. → He was highly influential in the development of theoretical computer science, providing a 

model latency ms: median 2646 · max 2977 · n 8
nothing flagged
```

## Observations

(the three strangest things in the trace, quoting node questions and raw model output)
