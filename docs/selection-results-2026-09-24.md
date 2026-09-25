# Claude selection benchmark — 2026-09-24

This is the first complete measured run of the frozen 186-case BestPrice cross-provider selection corpus.

## Result

| Metric | Tools only | Canonical Skill | Delta |
| --- | ---: | ---: | ---: |
| Coverage | 186/186 (100%) | 186/186 (100%) | — |
| Activation accuracy | 179/186 (96.24%) | 181/186 (97.31%) | +1.08 pp |
| Positive activation recall | 139/146 (95.21%) | 142/146 (97.26%) | +2.05 pp |
| False activation | 0/40 (0%) | 1/40 (2.5%) | +2.5 pp |
| Exact route, all cases | 138/186 (74.19%) | 151/186 (81.18%) | **+6.99 pp** |
| Exact route, positive cases | 98/146 (67.12%) | 112/146 (76.71%) | **+9.59 pp** |
| Negative tool leakage | 0/40 (0%) | 1/40 (2.5%) | +2.5 pp |
| Latency p50 | 5,019 ms | 4,876 ms | -143 ms |
| Latency p95 | 9,649 ms | 9,817 ms | +168 ms |

The canonical Skill materially improved exact tool routing and positive activation recall in this Claude Haiku 4.5 model-level experiment, at the cost of one false activation among 40 negative cases. This is a routing benchmark once BestPrice is already available to the model; it is **not** a measurement of Claude Connectors Directory discovery, installation, ranking, or unconfigured-chat discovery.

## Method

- Provider/model: Anthropic API, `claude-haiku-4-5-20251001`.
- Cohorts: matched tools-only and tools + canonical Skill arms.
- Corpus: 186 Greek/English prompts, including 146 positive and 40 negative cases.
- Public tools exposed in both arms: `get_shopping_decision`, `search_products`, `compare_offers`, `get_price_history`.
- Multi-step routes use synthetic read-only tool results to continue the model loop without production shopping calls, merchant clicks, checkout, or purchases.
- Parallel tool use is disabled while keeping tool choice automatic.
- The full run used strict coverage scoring; both arms observed all 186 cases.
- Answer quality, argument accuracy, zero-result recovery, and evidence preservation were deliberately not scored in this run.

## Provenance

- Benchmark revision: `d04407b8541958572f4a506b5678fd4d11517212`
- Corpus SHA-256: `62d9a0422b8c9ac4f130dd7e68ed452303ae3eaa0dbb294667ef86c3175d38fd`
- Tool-contract SHA-256: `2356e4e6a57b8449ce90ca2282475bc422daa534473192632de5809cc1c7d4fa`
- Skill SHA-256: `8624642a770897a1542871eed9365bb5b87efec4b02692582ceb6831e4e5bbbc`
- GitHub Actions run: `TheBestCo/bp-backend-node#36044555510`
- Artifact digest: `sha256:8d8092d785398996d3e54a367dc0cab2707a5f46bc477804e19a8a701ff21fdf`
- Tools-only usage: 436 API turns, 1,432,653 input tokens, 79,470 output tokens.
- Skill usage: 420 API turns, 1,609,110 input tokens, 76,523 output tokens.

The workflow artifact contains the raw per-case records and scorer output. It is retained separately from this repository because it is generated measurement evidence, not a shipped runtime contract.

## Follow-up frozen run — 2026-09-25

After the residual-error review, routing guidance was tightened in a benchmark-blind way: completed shopping decisions and lookup-only searches are terminal for their original intent, while explicit offer/history requests may continue. The 186-case corpus itself was unchanged.

| Metric | Tools only | Canonical Skill | Delta |
| --- | ---: | ---: | ---: |
| Coverage | 186/186 (100%) | 186/186 (100%) | — |
| Activation accuracy | 182/186 (97.85%) | 183/186 (98.39%) | +0.54 pp |
| Positive activation recall | 143/146 (97.95%) | 143/146 (97.95%) | 0 pp |
| False activation | 1/40 (2.5%) | 0/40 (0%) | **-2.5 pp** |
| Exact route, all cases | 142/186 (76.34%) | 157/186 (84.41%) | **+8.06 pp** |
| Exact route, positive cases | 103/146 (70.55%) | 117/146 (80.14%) | **+9.59 pp** |
| Negative tool leakage | 1/40 (2.5%) | 0/40 (0%) | **-2.5 pp** |
| Latency p50 | 5,105 ms | 4,829 ms | -276 ms |
| Latency p95 | 10,220 ms | 9,104 ms | -1,116 ms |

Relative to the previous Skill run, exact positive routing moved from 112/146 (76.71%) to 117/146 (80.14%), exact routing over all cases moved from 151/186 (81.18%) to 157/186 (84.41%), and the previous nicotine-vape false activation disappeared. The fresh Skill residual is 29 positive cases: 22 completed decision routes followed by redundant search calls, 6 multi-step offer/history routes that stopped early, and 1 history route that searched again instead of calling history. By language, the residual is 15 Greek and 14 English cases.

This follow-up is evidence that the general terminal-routing change is directionally useful, not proof that every case transition was caused by it. Across the two Skill runs, 35 individual case traces changed: 17 previously failing cases became exact, 11 previously exact cases became non-exact, and 7 failures changed shape while remaining failures. That run-to-run movement is why no second case-targeted wording change was made from this result alone.

### Follow-up provenance

- Benchmark revision: `8ed03b883952f8073e0cf39fe1a5b40950b77b7b`
- Corpus SHA-256: `62d9a0422b8c9ac4f130dd7e68ed452303ae3eaa0dbb294667ef86c3175d38fd`
- Tool-contract SHA-256: `aa238eb4eb12ba57f89c48052fef4aa3f878c52376360895680c1fc6cea52799`
- Skill SHA-256: `76db775cf9ad517c6ec1464756265a79d22bb7f3b88108fa63d0ee4bc3bd2503`
- GitHub Actions run: `TheBestCo/bp-backend-node#36092530111`
- Artifact digest: `sha256:a9e2964a1b8525610530b9d89be841844268c3eba49bad33e67c5145c506c1b7`
- Tools-only usage: 435 API turns, 1,463,274 input tokens, 81,028 output tokens.
- Skill usage: 410 API turns, 1,633,200 input tokens, 76,599 output tokens.

The same caveat applies: this measures model-level routing once BestPrice is already exposed to Claude. It does not measure directory discovery, installation, ranking, or unconfigured-chat discovery.

