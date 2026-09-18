# Node eval results

One row per model and ask variant; the JSON named in the row holds every raw output. Pass rates are over the cases in evals/node/<ask>.json at that commit. Newest last.

| date | commit | ask | variant | model | passed | median ms | calls | failed cases |
|---|---|---|---|---|---|---|---|---|
| 2026-09-18 | f571e0b | sentence | json | qwen3-0.6b | 11/20 | 253 | 20 | dead-sea-lead-how-salty, dead-sea-receding-why, dead-sea-receding-rate, dead-sea-extraction-who, rayleigh-blue, lba-theories, lba-when, photosynthesis-none, diffuse-sky-processes |
| 2026-09-18 | f571e0b | sentence | list | qwen3-0.6b | 9/20 | 245 | 20 | dead-sea-lead-why-none, dead-sea-lead-how-salty, dead-sea-lead-area, dead-sea-receding-rate, dead-sea-extraction-who, rayleigh-blue, coral-leading-cause, lba-theories, lba-when, photosynthesis-none, diffuse-sky-processes |
| 2026-09-18 | f571e0b | sentence | strict | qwen3-0.6b | 9/20 | 266 | 20 | dead-sea-lead-tributary, dead-sea-lead-how-salty, dead-sea-receding-why, dead-sea-receding-rate, dead-sea-extraction-who, water-cycle-drives, water-cycle-ocean-share-long, rayleigh-blue, lba-theories, lba-when, diffuse-sky-processes |
| 2026-09-18 | f571e0b | sentence | yesno | qwen3-0.6b | 0/20 | 790 | 154 | dead-sea-lead-why-none, dead-sea-lead-tributary, dead-sea-lead-how-salty, dead-sea-lead-area, dead-sea-receding-why, dead-sea-receding-rate, dead-sea-extraction-who, dead-sea-salinity-none, water-cycle-drives, water-cycle-ocean-share, water-cycle-ocean-share-long, rayleigh-blue, evaporation-sun, evaporation-humidity, coral-leading-cause, coral-cause-none, lba-theories, lba-when, photosynthesis-none, diffuse-sky-processes |
| 2026-09-18 | f571e0b | sentence | json | qwen3-1.7b | 15/20 | 479 | 20 | dead-sea-lead-why-none, dead-sea-extraction-who, dead-sea-salinity-none, coral-cause-none, photosynthesis-none |
| 2026-09-18 | f571e0b | sentence | list | qwen3-1.7b | 17/20 | 481 | 20 | dead-sea-lead-why-none, dead-sea-salinity-none, coral-cause-none |
| 2026-09-18 | f571e0b | sentence | strict | qwen3-1.7b | 17/20 | 522 | 20 | dead-sea-lead-why-none, dead-sea-salinity-none, coral-cause-none |
| 2026-09-18 | f571e0b | sentence | yesno | qwen3-1.7b | 15/20 | 1427 | 154 | dead-sea-lead-tributary, dead-sea-extraction-who, dead-sea-salinity-none, water-cycle-drives, lba-theories |
| 2026-09-18 | f571e0b | sentence | json | qwen3-0.6b | 11/20 | 249 | 20 | dead-sea-lead-how-salty, dead-sea-receding-why, dead-sea-receding-rate, dead-sea-extraction-who, rayleigh-blue, lba-theories, lba-when, photosynthesis-none, diffuse-sky-processes |
| 2026-09-18 | f571e0b | sentence | list | qwen3-0.6b | 9/20 | 246 | 20 | dead-sea-lead-why-none, dead-sea-lead-how-salty, dead-sea-lead-area, dead-sea-receding-rate, dead-sea-extraction-who, rayleigh-blue, coral-leading-cause, lba-theories, lba-when, photosynthesis-none, diffuse-sky-processes |
| 2026-09-18 | f571e0b | sentence | strict | qwen3-0.6b | 9/20 | 266 | 20 | dead-sea-lead-tributary, dead-sea-lead-how-salty, dead-sea-receding-why, dead-sea-receding-rate, dead-sea-extraction-who, water-cycle-drives, water-cycle-ocean-share-long, rayleigh-blue, lba-theories, lba-when, diffuse-sky-processes |
| 2026-09-18 | f571e0b | sentence | zero | qwen3-0.6b | 13/20 | 265 | 20 | dead-sea-lead-why-none, dead-sea-extraction-who, dead-sea-salinity-none, water-cycle-drives, rayleigh-blue, photosynthesis-none, diffuse-sky-processes |
| 2026-09-18 | f571e0b | sentence | check | qwen3-0.6b | 9/20 | 362 | 33 | dead-sea-lead-why-none, dead-sea-lead-how-salty, dead-sea-lead-area, dead-sea-receding-rate, dead-sea-extraction-who, rayleigh-blue, coral-leading-cause, lba-theories, lba-when, photosynthesis-none, diffuse-sky-processes |
| 2026-09-18 | f571e0b | sentence | yesno | qwen3-0.6b | 0/20 | 788 | 154 | dead-sea-lead-why-none, dead-sea-lead-tributary, dead-sea-lead-how-salty, dead-sea-lead-area, dead-sea-receding-why, dead-sea-receding-rate, dead-sea-extraction-who, dead-sea-salinity-none, water-cycle-drives, water-cycle-ocean-share, water-cycle-ocean-share-long, rayleigh-blue, evaporation-sun, evaporation-humidity, coral-leading-cause, coral-cause-none, lba-theories, lba-when, photosynthesis-none, diffuse-sky-processes |
| 2026-09-18 | f571e0b | sentence | json | qwen3-1.7b | 15/20 | 478 | 20 | dead-sea-lead-why-none, dead-sea-extraction-who, dead-sea-salinity-none, coral-cause-none, photosynthesis-none |
| 2026-09-18 | f571e0b | sentence | list | qwen3-1.7b | 17/20 | 483 | 20 | dead-sea-lead-why-none, dead-sea-salinity-none, coral-cause-none |
| 2026-09-18 | f571e0b | sentence | strict | qwen3-1.7b | 17/20 | 525 | 20 | dead-sea-lead-why-none, dead-sea-salinity-none, coral-cause-none |
| 2026-09-18 | f571e0b | sentence | zero | qwen3-1.7b | 17/20 | 487 | 20 | dead-sea-lead-why-none, dead-sea-salinity-none, coral-cause-none |
| 2026-09-18 | f571e0b | sentence | check | qwen3-1.7b | 15/20 | 730 | 39 | dead-sea-lead-tributary, dead-sea-extraction-who, dead-sea-salinity-none, water-cycle-drives, lba-theories |
| 2026-09-18 | f571e0b | sentence | yesno | qwen3-1.7b | 15/20 | 1439 | 154 | dead-sea-lead-tributary, dead-sea-extraction-who, dead-sea-salinity-none, water-cycle-drives, lba-theories |
| 2026-09-18 | f571e0b | sentence | json | qwen3-4b | 17/20 | 1148 | 20 | dead-sea-lead-why-none, dead-sea-salinity-none, coral-cause-none |
| 2026-09-18 | f571e0b | sentence | list | qwen3-4b | 18/20 | 1181 | 20 | dead-sea-lead-why-none, dead-sea-salinity-none |
| 2026-09-18 | f571e0b | sentence | strict | qwen3-4b | 18/20 | 1215 | 20 | dead-sea-lead-why-none, dead-sea-salinity-none |
| 2026-09-18 | f571e0b | sentence | zero | qwen3-4b | 17/20 | 1235 | 20 | dead-sea-lead-why-none, dead-sea-salinity-none, coral-cause-none |
| 2026-09-18 | f571e0b | sentence | check | qwen3-4b | 18/20 | 1674 | 38 | dead-sea-extraction-who, evaporation-humidity |
| 2026-09-18 | f571e0b | sentence | yesno | qwen3-4b | 15/20 | 3101 | 154 | dead-sea-lead-why-none, dead-sea-receding-why, dead-sea-salinity-none, evaporation-humidity, lba-when |
| 2026-09-18 | f571e0b | sentence | json | qwen3-8b | 18/20 | 1902 | 20 | dead-sea-lead-why-none, dead-sea-salinity-none |
| 2026-09-18 | f571e0b | sentence | list | qwen3-8b | 18/20 | 1912 | 20 | dead-sea-lead-why-none, dead-sea-salinity-none |
| 2026-09-18 | f571e0b | sentence | strict | qwen3-8b | 19/20 | 2032 | 20 | dead-sea-lead-why-none |
| 2026-09-18 | f571e0b | sentence | zero | qwen3-8b | 18/20 | 1916 | 20 | dead-sea-lead-why-none, dead-sea-salinity-none |
| 2026-09-18 | f571e0b | sentence | check | qwen3-8b | 20/20 | 2791 | 38 | — |
| 2026-09-18 | f571e0b | sentence | yesno | qwen3-8b | 15/20 | 5140 | 154 | dead-sea-receding-why, dead-sea-salinity-none, water-cycle-drives, coral-leading-cause, lba-when |
| 2026-09-18 | f571e0b | section | json | qwen3-0.6b | 8/15 | 214 | 15 | dead-sea-shrinking, dead-sea-salty, dead-sea-sinkholes, water-cycle-energy, water-cycle-residence, lba-sea-peoples, ccd-mites |
| 2026-09-18 | f571e0b | section | list | qwen3-0.6b | 12/15 | 200 | 15 | dead-sea-sinkholes, water-cycle-energy, lba-sea-peoples |
| 2026-09-18 | f571e0b | section | json | qwen3-1.7b | 14/15 | 347 | 15 | dead-sea-salty |
| 2026-09-18 | f571e0b | section | list | qwen3-1.7b | 14/15 | 379 | 15 | lba-sea-peoples |
| 2026-09-18 | f571e0b | section | json | qwen3-4b | 14/15 | 761 | 15 | water-cycle-energy |
| 2026-09-18 | f571e0b | section | list | qwen3-4b | 14/15 | 856 | 15 | water-cycle-energy |
| 2026-09-18 | f571e0b | section | json | qwen3-8b | 14/15 | 1275 | 15 | lba-sea-peoples |
| 2026-09-18 | f571e0b | section | list | qwen3-8b | 14/15 | 1401 | 15 | water-cycle-energy |
| 2026-09-18 | f571e0b | missing | search | qwen3-0.6b | 7/9 | 168 | 9 | bees-cold, water-cycle-after-lead |
| 2026-09-18 | f571e0b | missing | fact | qwen3-0.6b | 5/9 | 323 | 9 | dead-sea-cold, bees-cold, evaporation-cold, water-cycle-after-lead |
| 2026-09-18 | f571e0b | missing | search | qwen3-1.7b | 9/9 | 276 | 9 | — |
| 2026-09-18 | f571e0b | missing | fact | qwen3-1.7b | 4/9 | 362 | 9 | dead-sea-cold, sky-cold, lba-cold, evaporation-cold, dead-sea-after-lead |
| 2026-09-18 | f571e0b | missing | search | qwen3-4b | 9/9 | 533 | 9 | — |
| 2026-09-18 | f571e0b | missing | fact | qwen3-4b | 5/9 | 703 | 9 | dead-sea-cold, lba-cold, evaporation-cold, dead-sea-after-lead |
| 2026-09-18 | f571e0b | missing | search | qwen3-8b | 9/9 | 905 | 9 | — |
| 2026-09-18 | f571e0b | missing | fact | qwen3-8b | 5/9 | 831 | 9 | dead-sea-cold, bees-cold, lba-cold, evaporation-cold |
