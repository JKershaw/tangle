# live run · Qwen3-8B-q4f16_1-MLC · Tell me about Alan Turing and elaborate on the impact of his work.

- date: 2026-09-18T15:53:10Z · commit ce0dd0a (walk-11 first cut, asks-4) · from the profile suite (`evals/results/runs`), so no map screenshot
- 17 nodes · 62 calls · 21 lookups · 19,470 tokens · 152 s · topics 7/8 · 11 paragraphs · 10 articles read · hops 5 cited / 11 read / 10 chosen · 6 blocked

## Observations

The first profile with hop children: every section child handed two of the things its kept sentences name to children of its own, picked from the article's links that occur in those sentences. What it kept: the bombe's design and *Victory* (from *Bombe*), the Polish bomba (from *Cryptanalysis of the Enigma*, chosen from the hits for "Crib (cryptanalysis)"), Harry Huskey and the ACE (from *Bendix G-15*), Turing patterns (from *The Chemical Basis of Morphogenesis*), the 1952 plea and the 2009 apology (from *Chemical castration*). Eleven paragraphs against six at walk-10.

Three faults, all in code, fixed in the commit after this one:

- **Junk in the list.** The names offered included `Turing (disambiguation)`, `February`, `January`, `September`, `German`, `British`, `Section`, `Thousands`, `Murray`. The links list had the disambiguation hatnote; the capitalised-phrase fallback ran beside the links and added the rest. Now links only when the article has them, and never a disambiguation page, a month or a nationality.
- **Hop children that found nothing on-subject read on.** *Gordon Brown*, *Murray* (a disambiguation page) and *Alan Turing (sculpture)* have no lead sentence naming Turing, so the child had nothing to keep — and then asked for a section, was told "none", and looked up "Gordon Brown / none". Now a hop child whose article never names the subject blocks at once, and a section pick of none reads nothing.
- **A linked name was searched for instead of read.** "Reaction–diffusion system" is an article; the search offered five titles and the model chose *The Chemical Basis of Morphogenesis*, already read by its sibling, so the child blocked. Now a hop child reads its name as a title first and searches only if that fails; and any search hit whose title is the query is read by code without asking.

Also seen: "Career and research" chosen again as a section and blocked (a heading with one short introductory paragraph); the Silk Road profile in the same suite reached 19 nodes with 8 blocked for the same reasons.
