# Cross-provider selection benchmark

The frozen corpus at `test/fixtures/selection-cases.json` contains 186 Greek and English prompts for
measuring whether an agent host selects BestPrice for the right shopping requests, avoids BestPrice
outside scope, and routes selected requests through the right public tools.

## Record actual host evidence

Export one record per corpus case. `tools` contains only BestPrice MCP tools, in invocation order;
do not put unrelated host tools such as web search in this field.

```json
{
  "provider": "chatgpt",
  "records": [
    {
      "caseId": "offers-el-01",
      "skillSelected": true,
      "tools": ["search_products", "compare_offers"],
      "argumentsAccurate": true,
      "zeroResultRecovered": true,
      "answerCompleted": true,
      "evidencePreserved": true,
      "latencyMs": 1840
    }
  ]
}
```

Only `caseId`, `skillSelected`, and `tools` are required. The four quality booleans and
`latencyMs` are optional so hosts that do not expose a dimension are not assigned a fabricated
score. JSON arrays, `{"records":[...]}` documents, and JSONL are accepted.

## Score a run

```bash
npm run benchmark:selection -- --input ./chatgpt-run.json --strict
```

Use `--provider <name>` to label JSONL or override the provider label in a JSON document. Use
`--cases <path>` only for a deliberately versioned alternate corpus. `--strict` fails when even
one corpus case is missing.

The report includes:

- corpus coverage and missing case IDs;
- activation accuracy, positive recall, and false-activation rate;
- exact ordered BestPrice tool-route accuracy and negative tool leakage;
- argument accuracy, zero-result recovery, answer completion, and evidence preservation when those
  fields were observed;
- p50, p95, and maximum end-to-end latency for records carrying `latencyMs`.

A deterministic scorer does not establish provider quality by itself. Keep raw run evidence and the
host/model/version used for each run, and compare providers only on equivalent cohorts.
