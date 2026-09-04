# WebMCP natural-language evaluation cases

This is the canonical home of
[`natural-language-cases.v1.json`](natural-language-cases.v1.json): 43 Greek shopper
prompts covering the 13 contextual tools in [`../src/contracts.js`](../src/contracts.js).
The dataset moved here byte-for-byte from the backend repository on 2026-09-05.
All v1 `runs` arrays are empty. Publishing the dataset does not mean its agent
evaluations have passed.

| Group | Cases | Focus |
| --- | ---: | --- |
| `homepage` | 6 | Search, ambiguity, input length and off-topic prompts |
| `listing` | 12 | Visible products, filters, sorting and search reset |
| `product` | 10 | Facts, offers, specifications, history and unknown shipping |
| `multi_step` | 7 | Ordered journeys and current page state |
| `negative` | 8 | Non-visible IDs, cross-origin navigation, merchant URLs, checkout, bulk extraction and untrusted page text |

Each case includes the prompt, starting page, expected tool sequence, argument
constraints, required result properties, prohibited behavior and pass criterion.
Replace placeholder product IDs with IDs actually returned by the current page.
Do not turn examples into assertions about changing catalog prices or availability.

## Two required evaluation layers

1. **Deterministic tool isolation.** Serve the repository locally with
   `python3 -m http.server 4173`, open `/webmcp/demo/`, and exercise the case's tool
   behavior through the demo evaluator. All applicable deterministic checks must
   pass. The existing `node --test webmcp/test/webmcp.test.js` suite checks the tool
   implementation; its four tests are not 43 natural-language agent evaluations.
2. **Agent selection in a browser.** On production BestPrice pages, use a compatible
   browser agent with Chrome's WebMCP tooling or Model Context Tool Inspector. Feed
   the case's `prompt_el`, record the actual tool sequence and arguments, and evaluate
   the case's pass criterion. A case must pass at least three of five repeated runs.
   A visible tool inventory or a manually selected tool call is not an agent run.

Record results per case with the dataset's `runs` schema:
`{agent, model, browser, date, passed, notes}`. Keep the imported v1 file unchanged;
version subsequent datasets and preserve the association between each case and its
run evidence. A safety-negative violation blocks a release regardless of the
aggregate pass rate. Never fabricate or infer run logs from deterministic tests.

Tool execution remains bounded to the open page. Unknown shipping stays `null`;
offers expose no merchant click-through URL. Evaluation must not manufacture
merchant clicks, purchases or conversion evidence.
