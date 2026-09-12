# WebMCP natural-language evaluation cases

This is the canonical home of the versioned Greek shopper prompt datasets for the
contextual tools in [`../src/contracts.js`](../src/contracts.js):

- [`natural-language-cases.v2.json`](natural-language-cases.v2.json) — current, 47 cases
  covering all 14 contextual tools, including the item-page `show_offer` action verb.
- [`natural-language-cases.v1.json`](natural-language-cases.v1.json) — frozen import, 43
  cases covering the 13 tools of its time. It is never rewritten; v2 carries every v1
  case unchanged so old run evidence keeps its case text.

Every case's `runs` array is **empty by contract**: a definition is frozen once published, and
recording what an agent actually did must never require editing it. Execution evidence is appended to
[`runs.v2.json`](runs.v2.json) instead, one record per run, referencing the case id, the dataset
version, the implementation revision it was observed against, the real agent/model/browser, the
outcome (`passed` / `failed` / `refused` / `blocked`) and an evidence artifact. `run-evidence.js`
validates records; the dataset test exercises the validator in both directions so an empty evidence
file cannot hide a broken check. Publishing the dataset does not mean its agent evaluations have
passed.

| Group | v2 cases | v1 cases | Focus |
| --- | ---: | ---: | --- |
| `homepage` | 6 | 6 | Search, ambiguity, input length and off-topic prompts |
| `listing` | 12 | 12 | Visible products, filters, sorting and search reset |
| `product` | 12 | 10 | Facts, offers, one-offer focus, specifications, history and unknown shipping |
| `multi_step` | 8 | 7 | Ordered journeys and current page state |
| `negative` | 9 | 8 | Non-visible IDs, an absent merchant, cross-origin navigation, merchant URLs, checkout, bulk extraction and untrusted page text |

Each case includes the prompt, starting page, expected tool sequence, argument
constraints, required result properties, prohibited behavior and pass criterion.
Replace placeholder product IDs with IDs actually returned by the current page.
Do not turn examples into assertions about changing catalog prices or availability.

## Two required evaluation layers

1. **Deterministic tool isolation.** Serve the repository locally with
   `python3 -m http.server 4173`, open `/webmcp/demo/`, and exercise the case's tool
   behavior through the demo evaluator. All applicable deterministic checks must
   pass. The `npm test` suite checks the tool implementation and this dataset's shape;
   unit tests are not natural-language agent evaluations.
2. **Agent selection in a browser.** On production BestPrice pages, use a compatible
   browser agent with Chrome's WebMCP tooling or Model Context Tool Inspector. Feed
   the case's `prompt_el`, record the actual tool sequence and arguments, and evaluate
   the case's pass criterion. A case must pass at least three of five repeated runs.
   A visible tool inventory or a manually selected tool call is not an agent run.

Record results per case in `runs.v2.json` with the record schema above — never inside a case
definition. Keep the imported v1 file unchanged; version subsequent datasets and preserve the
association between each case and its run evidence. A safety-negative violation blocks a release
regardless of the aggregate pass rate. Never fabricate or infer run logs from deterministic tests.

Four evidence layers, never summed into one number: deterministic contract tests, real-DOM state
transition tests, native-browser WebMCP integration, and real-agent natural-language runs. Only the
last one answers "does an agent choose the right tool and finish the shopper's task?" — and "three of
five attempts passed" is a distribution to report per case, not an excellence verdict.

Tool execution remains bounded to the open page. Unknown shipping stays `null`;
offers expose no merchant click-through URL. Evaluation must not manufacture
merchant clicks, purchases or conversion evidence.
