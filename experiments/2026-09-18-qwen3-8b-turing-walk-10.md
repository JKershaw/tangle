# live run · Qwen3-8B-q4f16_1-MLC · Tell me about Alan Turing and elaborate on the impact of his work.

- date: 2026-09-18T14:37:59.169Z
- commit: 29d44c2 (docs/index.html as served; the page loaded at run start)
- machine: Apple M1 Max, 32 GB, darwin 25.6.0
- browser: 153.0.8010.50
- run wall time: 111 s · retries used: 0
- machine during the run: {"samples":8,"gpuPercent":{"min":0,"max":99,"mean":86.5},"vramGiB":{"min":0.32,"max":5.84,"mean":4.8},"load":{"min":12.6,"max":20.96,"mean":16.1},"memoryFreePercent":{"min":68,"max":85,"mean":71},"throttledSamples":0,"worstSpeedLimit":100}

## Driver log

- 2026-09-18T14:37:48.798Z opened http://127.0.0.1:8765/ in 153.0.8010.50 (darwin arm64, Apple M1 Max)
- page versions: {"prompt":"tangle-pocket-10","schema":"per-action-7","walk":"walk-10","asks":"asks-3","variants":{"sentence":"list","section":"list","missing":"search","question":"one","article":"snippets","confirm":"yesno"},"runtime":"@mlc-ai/web-llm@0.2.84","page":"0.2.0"}
- device: WebGPU adapter found · secure context · cache: cache · storage headroom: 10.00 GiB
- 2026-09-18T14:37:48.909Z loading: Checking this device before downloading…
- 2026-09-18T14:37:58.931Z loading: Ready. Inference runs on this device.
- model Qwen3-8B-q4f16_1-MLC: Ready. Inference runs on this device. (10 s)
- wiki recording: 476 responses loaded from evals/wiki-cache
- seed: Tell me about Alan Turing and elaborate on the impact of his work. · limits {"maxNodes":40,"maxVisits":60,"maxDepth":6,"maxLookups":2,"maxPasses":6,"revisitSettled":true,"walk":true,"maxSentences":3,"maxFindingChars":6000,"maxSections":6}
- machine at start: gpu 15% · vram 0.18 GiB · load 20.96 · mem 85% free (normal) · no throttling recorded
- 2026-09-18T14:39:50.397Z run stopped: Root resolved
- machine during the run: gpu 86.5% mean, 99% peak · vram up to 5.84 GiB · load up to 20.96 · no throttling in 8 samples
- wiki recording: 18 hits, 0 misses, 0 new responses saved

## Summary

```
live run · seed: Tell me about Alan Turing and elaborate on the impact of his work.
model Qwen3-8B-q4f16_1-MLC · prompt walk-10/asks-3/sentence:check,section:list,missing:search,question:one,article:snippets,confirm:yesno · created 2026-09-18T14:37:59.169Z · exported 2026-09-18T14:39:50.508Z
nodes 7 · visits 8 · model calls 37 · lookups 9 · evidence 8 · tokens 15205
statuses {"resolved":6,"blocked":1} · outcome: root resolved

n1 [resolved v2] Tell me about Alan Turing and elaborate on the impact of his work. → He was highly influential in the development of theoretical computer science, providing a 
  n2 [blocked 1 failed lookup] Tell me about Alan Turing and elaborate on the impact of his work. — about Career and research !! Nothing read states the answer, and no further lookup or question is allowed here.
  n3 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. — about Cryptanalysis → During the Second World War, Turing was a leading participant in the breaking of German ci
  n4 [resolved 1 failed lookup] Tell me about Alan Turing and elaborate on the impact of his work. — about Early computers and the Turing test → He presented a paper on 19 February 1946, which was the first detailed design of a stored-
  n5 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. — about Pattern formation and mathematical biology → When Turing was 39 years old in 1951, he turned to mathematical biology, finally publishin
  n6 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. — about Homosexuality and indecency conviction → During the investigation, he acknowledged a sexual relationship with Murray. Homosexual ac
  n7 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. — about Government apology and pardon → The prime minister, Gordon Brown, acknowledged the petition, releasing a statement on 10 S

model latency ms: median 3239 · max 5081 · n 37
worth a look:
- n2 lookup found nothing: “Alan Turing” (Already read.)
- n4 lookup found nothing: “Turing test” (Already read: “Alan Turing”.)
- n2 blocked: Nothing read states the answer, and no further lookup or question is allowed here.
```

## Observations

(the three strangest things in the trace, quoting node questions and raw model output)
