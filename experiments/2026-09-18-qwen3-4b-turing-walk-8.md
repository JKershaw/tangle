# live run · Qwen3-4B-q4f16_1-MLC · Tell me about Alan Turing and elaborate on the impact of his work.

- date: 2026-09-18T14:21:16.284Z
- commit: 51c12c0 (docs/index.html as served; the page loaded at run start)
- machine: Apple M1 Max, 32 GB, darwin 25.6.0
- browser: 153.0.8010.50
- run wall time: 35 s · retries used: 0
- machine during the run: {"samples":3,"gpuPercent":{"min":0,"max":98,"mean":65.3},"vramGiB":{"min":0.57,"max":4.13,"mean":2.8},"load":{"min":23.41,"max":26.59,"mean":24.6},"memoryFreePercent":{"min":73,"max":84,"mean":77.3},"throttledSamples":0,"worstSpeedLimit":100}

## Driver log

- 2026-09-18T14:21:10.954Z opened http://127.0.0.1:8765/ in 153.0.8010.50 (darwin arm64, Apple M1 Max)
- page versions: {"prompt":"tangle-pocket-10","schema":"per-action-7","walk":"walk-8","asks":"asks-3","variants":{"sentence":"list","section":"list","missing":"search","question":"one","article":"snippets","confirm":"yesno"},"runtime":"@mlc-ai/web-llm@0.2.84","page":"0.2.0"}
- device: WebGPU adapter found · secure context · cache: cache · storage headroom: 10.00 GiB
- 2026-09-18T14:21:11.061Z loading: Checking this device before downloading…
- 2026-09-18T14:21:16.064Z loading: Ready. Inference runs on this device.
- model Qwen3-4B-q4f16_1-MLC: Ready. Inference runs on this device. (5 s)
- wiki recording: 466 responses loaded from evals/wiki-cache
- seed: Tell me about Alan Turing and elaborate on the impact of his work. · limits {"maxNodes":40,"maxVisits":60,"maxDepth":6,"maxLookups":2,"maxPasses":6,"revisitSettled":true,"walk":true,"maxSentences":3,"maxFindingChars":6000,"maxSections":6}
- machine at start: gpu 91% · vram 0.57 GiB · load 23.41 · mem 84% free (normal) · no throttling recorded
- 2026-09-18T14:21:51.180Z run stopped: Root resolved
- machine during the run: gpu 65.3% mean, 98% peak · vram up to 4.13 GiB · load up to 26.59 · no throttling in 3 samples
- wiki recording: 7 hits, 0 misses, 0 new responses saved

## Summary

```
live run · seed: Tell me about Alan Turing and elaborate on the impact of his work.
model Qwen3-4B-q4f16_1-MLC · prompt walk-8/asks-3/sentence:list,section:list,missing:search,question:one,article:snippets,confirm:yesno · created 2026-09-18T14:21:16.284Z · exported 2026-09-18T14:21:51.283Z
nodes 4 · visits 5 · model calls 18 · lookups 4 · evidence 4 · tokens 7762
statuses {"resolved":4} · outcome: root resolved

n1 [resolved v2] Tell me about Alan Turing and elaborate on the impact of his work. → He was highly influential in the development of theoretical computer science, providing a 
  n2 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. — about University and work on computability → His dissertation, On the Gaussian error function, written during his senior year and deliv
  n3 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. — about Early computers and the Turing test → He presented a paper on 19 February 1946, which was the first detailed design of a stored-
  n4 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. — about Pattern formation and mathematical biology → He suggested that a system of chemicals reacting with each other and diffusing across spac

model latency ms: median 1919 · max 2924 · n 18
nothing flagged
```

## Observations

(the three strangest things in the trace, quoting node questions and raw model output)
