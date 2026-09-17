# Eval results

One row per suite run; the JSON next to each holds every graded output. Newest last.

| date | commit | suite | model | prompt · grammar | passed | detail | latency |
|---|---|---|---|---|---|---|---|
| 2026-09-17 | 9f8bc21 | visits | qwen3-0.6b | tangle-pocket-9 · per-action-6 | **8/24** | not fully passing: degenerate output 0/1, memory over evidence 0/1, grounded resolution 0/1, section by name 0/4, resolve when supported 0/3, synthesis 0/2, specific finding 0/1, section pick 0/3 | median 2103 ms |
| 2026-09-17 | 9f8bc21 | visits | qwen3-1.7b | tangle-pocket-9 · per-action-6 | **12/24** | not fully passing: grounded resolution 0/1, section by name 0/4, resolve when supported 0/3, synthesis 0/2, specific finding 0/1, repeat question 0/1 | median 2176 ms |
| 2026-09-17 | 41c9a63 | visits | qwen3-4b | tangle-pocket-9 · per-action-6 | **11/24** | not fully passing: degenerate output 0/1, grounded resolution 0/1, section by name 0/4, resolve when supported 0/3, synthesis 0/2, specific finding 0/1, repeat question 0/1 | median 9119 ms |
| 2026-09-17 | f34bf71 | visits | qwen3-8b | tangle-pocket-10 · per-action-7 | **20/24** | not fully passing: degenerate output 0/1, grounded resolution 0/1, synthesis 0/2 | median 10917 ms |
