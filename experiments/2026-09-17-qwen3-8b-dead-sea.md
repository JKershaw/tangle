# live run · Qwen3-8B-q4f16_1-MLC · Why is the Dead Sea shrinking?

- date: 2026-09-17T19:40:07.950Z
- commit: 3dab6f0 (sections by name, prompt tangle-pocket-7, grammar per-action-6)
- machine / GPU: Apple M1 Max (24-core GPU), 32 GB, macOS 26 (Darwin 25.6), WebGPU via Chrome; 5 GB download in 95 s over Ethernet
- browser: 152.0.7977.83
- run wall time: 91 s · retries used: 0

## Driver log

- 2026-09-17T19:40:07.849Z opened http://127.0.0.1:8765/ in 152.0.7977.83 (darwin arm64, Apple M1 Max)
- device: WebGPU adapter found · secure context · cache: cache · storage headroom: 10.00 GiB
- 2026-09-17T19:40:07.994Z loading: Checking this device before downloading…
- 2026-09-17T19:40:38.010Z loading: Fetching param cache[31/113]: 1297MB fetched. 29% completed, 27 secs elapsed. It can take a while when we first visit this page to populate the cache. Later refreshes will become faster.
- 2026-09-17T19:41:08.024Z loading: Fetching param cache[75/113]: 3097MB fetched. 70% completed, 56 secs elapsed. It can take a while when we first visit this page to populate the cache. Later refreshes will become faster.
- 2026-09-17T19:41:38.038Z loading: Loading model from cache[32/113]: 1615MB loaded. 36% completed, 87 secs elapsed.
- 2026-09-17T19:41:43.044Z loading: Ready. Inference runs on this device.
- model Qwen3-8B-q4f16_1-MLC: Ready. Inference runs on this device. (95 s)
- 2026-09-17T19:43:14.328Z run stopped: Root resolved

## Summary

```
live run · seed: Why is the Dead Sea shrinking?
model Qwen3-8B-q4f16_1-MLC · prompt tangle-pocket-7 · created 2026-09-17T19:40:07.950Z · exported 2026-09-17T19:43:14.331Z
nodes 1 · visits 1 · model calls 3 · lookups 2 · evidence 2 · tokens 2347
statuses {"resolved":1} · outcome: root resolved

n1 [resolved] Why is the Dead Sea shrinking? → The Dead Sea is shrinking primarily due to the diversion of water from the Jordan River to

model latency ms: median 33016 · max 33346 · n 3
nothing flagged
```

## Observations

First 8B run. Root resolved in one node, three model calls, and the first finding today that is both correct and fully supported for a question no lead section answers.

1. **It asked for the section before it had the article.** First query: `"Dead Sea / Receding shoreline"` — with nothing yet in context. *Correction, later the same evening:* that string is the prompt's own example of the section syntax (tangle-pocket-7 and -8), so this was not knowledge of the article; 0.6B copied the same string, and then copied it again as its finding. The prompt example is neutral from tangle-pocket-9 and the 8B run needs repeating. The runner had no such article in context, so it searched for "Dead Sea" and captured the lead (1,683 chars, thirty headings). The model repeated the same query; now the article was known, so the runner read § Receding shoreline (1,689 chars).

2. **A correct, specific, supported finding.** "The Dead Sea is shrinking primarily due to the diversion of water from the Jordan River to the north as part of the National Water Carrier scheme, which was completed in 1964. Additionally, the southern end of the Dead Sea is fed by a canal maintained by the Dead Sea Works, which further contributes to the shrinking of the lake." Both excerpts cited. The summariser's absent-words check flags nothing: every content word is in the cited text. Compare 4B, which knew the same answer and cited a lead that did not contain it.

3. **No decomposition** — the seed was answerable from one article once the right section was reachable. Latencies 23 s, 33 s, 33 s are three grammar compiles; the 8B model's own generation is hidden inside them.

One node is not a graph. The next seeds need answers that span articles.
