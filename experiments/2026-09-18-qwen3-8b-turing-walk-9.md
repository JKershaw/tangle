# live run · Qwen3-8B-q4f16_1-MLC · Tell me about Alan Turing and elaborate on the impact of his work.

- date: 2026-09-18T14:25:19.959Z
- commit: 57a4eb9 (docs/index.html as served; the page loaded at run start)
- machine: Apple M1 Max, 32 GB, darwin 25.6.0
- browser: 153.0.8010.50
- run wall time: 126 s · retries used: 0
- machine during the run: {"samples":9,"gpuPercent":{"min":0,"max":99,"mean":87.8},"vramGiB":{"min":0.35,"max":6.1,"mean":5.1},"load":{"min":22.67,"max":42.19,"mean":32.7},"memoryFreePercent":{"min":66,"max":84,"mean":69.2},"throttledSamples":0,"worstSpeedLimit":100}

## Driver log

- 2026-09-18T14:25:09.569Z opened http://127.0.0.1:8765/ in 153.0.8010.50 (darwin arm64, Apple M1 Max)
- page versions: {"prompt":"tangle-pocket-10","schema":"per-action-7","walk":"walk-9","asks":"asks-3","variants":{"sentence":"list","section":"list","missing":"search","question":"one","article":"snippets","confirm":"yesno"},"runtime":"@mlc-ai/web-llm@0.2.84","page":"0.2.0"}
- device: WebGPU adapter found · secure context · cache: cache · storage headroom: 10.00 GiB
- 2026-09-18T14:25:09.690Z loading: Checking this device before downloading…
- 2026-09-18T14:25:19.715Z loading: Ready. Inference runs on this device.
- model Qwen3-8B-q4f16_1-MLC: Ready. Inference runs on this device. (10 s)
- wiki recording: 470 responses loaded from evals/wiki-cache
- seed: Tell me about Alan Turing and elaborate on the impact of his work. · limits {"maxNodes":40,"maxVisits":60,"maxDepth":6,"maxLookups":2,"maxPasses":6,"revisitSettled":true,"walk":true,"maxSentences":3,"maxFindingChars":6000,"maxSections":6}
- machine at start: gpu 64% · vram 0.35 GiB · load 37.83 · mem 84% free (normal) · no throttling recorded
- 2026-09-18T14:27:26.511Z run stopped: Root resolved
- machine during the run: gpu 87.8% mean, 99% peak · vram up to 6.1 GiB · load up to 42.19 · no throttling in 9 samples
- wiki recording: 12 hits, 6 misses, 6 new responses saved

## Summary

```
live run · seed: Tell me about Alan Turing and elaborate on the impact of his work.
model Qwen3-8B-q4f16_1-MLC · prompt walk-9/asks-3/sentence:check,section:list,missing:search,question:one,article:snippets,confirm:yesno · created 2026-09-18T14:25:19.959Z · exported 2026-09-18T14:27:26.635Z
nodes 7 · visits 8 · model calls 40 · lookups 9 · evidence 9 · tokens 16748
statuses {"resolved":6,"blocked":1} · outcome: root resolved

n1 [resolved v2] Tell me about Alan Turing and elaborate on the impact of his work. → He was highly influential in the development of theoretical computer science, providing a 
  n2 [blocked 1 failed lookup] Tell me about Alan Turing and elaborate on the impact of his work. — about Career and research !! Nothing read states the answer, and no further lookup or question is allowed here.
  n3 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. — about Early computers and the Turing test → He presented a paper on 19 February 1946, which was the first detailed design of a stored-
  n4 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. — about Government apology and pardon → The prime minister, Gordon Brown, acknowledged the petition, releasing a statement on 10 S
  n5 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. — about Homosexuality and indecency conviction → During the investigation, he acknowledged a sexual relationship with Murray. Homosexual ac
  n6 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. — about Cryptanalysis → During the Second World War, Turing was a leading participant in the breaking of German ci
  n7 [resolved] Tell me about Alan Turing and elaborate on the impact of his work. — about Pattern formation and mathematical biology → When Turing was 39 years old in 1951, he turned to mathematical biology, finally publishin

model latency ms: median 3306 · max 5440 · n 40
worth a look:
- n2 lookup found nothing: “Alan Turing” (Already read.)
- n2 blocked: Nothing read states the answer, and no further lookup or question is allowed here.
```

## Observations

(the three strangest things in the trace, quoting node questions and raw model output)
