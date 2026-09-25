# WebMCP natural-language evaluation cases

This is the canonical home of the versioned Greek shopper prompt datasets for the
contextual tools in [`../src/contracts.js`](../src/contracts.js):

- [`natural-language-cases.v12.json`](natural-language-cases.v12.json) — current, 47 cases: 11.0.0
  graded against contract 1.9 at registration revision 2026-09-25.12 by [`dataset-v12.js`](dataset-v12.js)
  (offer `offset` and `limit` up to 12, single-filter removal, `show_chart`, `show_offer` without
  `merchant_id`; `load_more` and `show_chart` admitted `false` only in extra reads); evidence in
  [`runs.v12.json`](runs.v12.json). See [`QUALIFICATION.md`](QUALIFICATION.md).
- [`natural-language-cases.v11.json`](natural-language-cases.v11.json) — frozen, 47 cases: 10.0.0
  graded against contract 1.9 as revised on 2026-09-25 (revisions .7 to .9) by
  [`dataset-v11.js`](dataset-v11.js) (search constraints, digits-only product ids, `get_product_details`
  admitted as a read only); evidence in [`runs.v11.json`](runs.v11.json).
- [`natural-language-cases.v10.json`](natural-language-cases.v10.json) — frozen, 47 cases: 9.0.0
  graded against WebMCP contract 1.9 as first published by [`dataset-v10.js`](dataset-v10.js)
  (`get_product_details` admitted as an extra read); evidence in [`runs.v10.json`](runs.v10.json).
- [`natural-language-cases.v9.json`](natural-language-cases.v9.json) — frozen, 47 cases: 8.0.0
  graded against WebMCP contract 1.8 by [`dataset-v9.js`](dataset-v9.js) (argument rules and admitted
  reads of the 1.8 contract, and the four search cases grade its structured result); evidence in
  [`runs.v9.json`](runs.v9.json).
- `natural-language-cases.v4.json` … `v8.json` — frozen corrections of 3.0.0 (`dataset-v4.js` …
  `dataset-v8.js`), graded against contract 1.6, each with its own `runs.v<N>.json`.
- [`natural-language-cases.v3.json`](natural-language-cases.v3.json) — frozen, 47 cases, derived by
  [`dataset-v3.js`](dataset-v3.js) from v2 and the published contract 1.6 (argument rules generated
  from `src/contracts.js`, admitted extra read-only calls, concrete starting pages); evidence in
  [`runs.v3.json`](runs.v3.json)
- [`natural-language-cases.v2.json`](natural-language-cases.v2.json) — frozen, 47 cases
  covering all 14 contextual tools of its time, including the item-page `show_offer` action verb.
- [`natural-language-cases.v1.json`](natural-language-cases.v1.json) — frozen import, 43
  cases covering the 13 tools of its time. It is never rewritten; v2 carries every v1
  case unchanged so old run evidence keeps its case text.

Every case's `runs` array is **empty by contract**: a definition is frozen once published, and
recording what an agent actually did must never require editing it. Execution evidence is appended to
[`runs.v2.json`](runs.v2.json) instead, one record per run, referencing the case id, the dataset
version, the implementation revision it was observed against, the real agent/model/browser, the
execution modality (`evidenceLayer: "native"`), the outcome (`passed` / `failed` / `refused` /
`blocked`) and an evidence artifact. `run-evidence.js` validates records; the dataset test exercises
the validator in both directions so an empty evidence file cannot hide a broken check. Publishing the
dataset does not mean its agent evaluations have passed.

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
   unit tests are not natural-language agent evaluations. Anything this layer records
   (for example `node webmcp/evals/driver.js --mode=demo --record`) lands in the
   quarantined `webmcp/evals/demo/` store, never in `artifacts/` or `runs.v2.json`.
2. **Agent selection in a browser.** On production BestPrice pages, use a compatible
   browser agent with Chrome's WebMCP tooling or Model Context Tool Inspector. Feed
   the case's `prompt_el`, record the actual tool sequence and arguments, and evaluate
   the case's pass criterion. A visible tool inventory or a manually selected tool call is
   not an agent run.

Record results per case in `runs.v2.json` with the record schema above — never inside a case
definition. Keep the imported v1 file unchanged; version subsequent datasets and preserve the
association between each case and its run evidence. Never fabricate or infer run logs from
deterministic tests.

## What a verdict means

`journey.js` is the one grader every layer uses (the deterministic driver, `native-run.mjs` and the
ledger adjudicator), so a case cannot mean one thing in a scripted run and another in the ledger:

- A case with `sequence_mode: 'ordered'` and more than one expected tool is a **journey**: every
  expected tool must be observed **in order**, and the run must record a **terminal** — an answer, a
  refusal or a clarifying question. A first-step-only trace is `blocked`, never `passed`; that is the
  defect found in the committed `multi-001` evidence, where one `search_bestprice` call was graded
  `passed` against a four-step task.
- Navigation is a **transition**, not a verdict. A call that navigates is recorded with its
  destination and the run continues; the destination is never a pass by itself.
- A refusal-expected case (the `negative` group, `expected_tools: []`, or a case the dataset lists)
  ends in `refused` when the page refuses, and `failed` when the page allows what it should not.
- `blocked` is an **incompleteness** — an unfinished journey or an interrupted harness — and is
  reported separately from a failure and from a safety violation.

### The release predicate

There is exactly one target rule, in `release-policy.js`, and both of its thresholds are always
applied:

```
verified runs >= minimumSamples (default 5)   AND   passes / verified runs >= targetPassRate (default 0.6)
```

`3/5` meets a 60% target and fails a 95% target; `3/100` fails a 60% target. The rule this replaces —
`totalRuns >= 5 ? passed >= 3 : …` — accepted 3/100 and ignored a configured fraction once five runs
existed. Three of five is a minimum *experiment* rule, not an excellence claim.

- **A cohort is the unit.** A pass is evidence about the implementation revision, browser family,
  model and language it was observed on. A run recorded against a different revision does not approve
  the current one: it stays visible in the report (`releasePolicy.outOfCohort`) and is not counted.
- **Blocked runs are excluded from the fraction** and counted separately; a safety violation is never
  averaged away and blocks the release outright.
- **History stays visible.** `casesSummary[].historical` is what the ledger published, `historicalCorrected`
  re-scores it through the corrections below, and `totalRuns` counts every record.

### Corrections are appended, never edited

The ledger is append-only in the literal sense, and that includes its own mistakes. A published
verdict that the current grader re-adjudicates differently gets a **correction record** — a new
`corrections[]` entry that references the run and the artifact it corrects — while the original record
and the original artifact bytes stay exactly as published:

```bash
node webmcp/evals/corrections.js --run=run-2026-09-13-multi-001-16be8cfc
```

A correction is not an execution: it carries no `evidenceLayer`, `agent`, `model` or `browser`, it
adds no run to any count, it can never promote a published non-pass to `passed`, and once appended it
is as immutable as a run (a later correction supersedes an earlier one by naming it in `supersedes`).
The two `multi-001` records that round 4 found graded `passed` on a first-step-only trace are
corrected to `blocked`, with the reason recorded; both original records and both original artifacts are
byte-for-byte unchanged, and `webmcp/test/journey.test.js` asserts that.

## What counts as native evidence

A record in `runs.v2.json` is **native evidence** only when a real agent drove a real browser engine
on a real page. That is not a matter of opinion, so it is a required field and a rejection:

- `evidenceLayer` must be exactly `"native"`. It is in the ledger's `requiredFields`, and a record
  that omits it or declares anything else (`"demo"`, `"deterministic"`, `"in-memory"`, …) is rejected
  before any other check can accept it.
- `browser` must name a real browser engine **and its version** — `Chromium 144`, `Google Chrome
  141`, `Microsoft Edge 140`, `Firefox 143`, `Safari 18`. A host that names an in-memory adapter,
  Node.js, jsdom, a simulation or a fixture (`/in-?memory|node\.?js|jsdom|simulat|deterministic|test
  driver|fixture/i`) is not a browser and cannot appear in the ledger.
- `agent` must name the real tool or host that ran the agent (for example `Model Context Tool
  Inspector`), and `model` the model that chose the tools. Placeholders such as `Test Driver` are
  rejected, and so is any `agent`/`model`/`browser` value that declares a deterministic execution.
- Everything else in [How a record is checked](#how-a-record-is-checked) still has to hold: a real
  commit and manifest fingerprint, the frozen case digest, a committed artifact whose bytes hash to
  `evidenceDigest`, and an execution the artifact identifies separately.

`driver.js --mode=demo` (and every other non-native mode) produces the opposite of that: a scripted
adapter under Node with no browser and no model. Such runs are **quarantined**, never validated as
evidence, and never committed:

- they declare `evidenceLayer: "demo"` and write to `webmcp/evals/demo/` (artifacts plus a
  `runs.demo.json` ledger); that directory is git-ignored, so a `git add -A` cannot stage them;
- the driver refuses to write to `artifacts/` or `runs.v2.json` in a non-native mode even when
  pointed there explicitly;
- `run-evidence.js` rejects them on modality with a message naming the layer, and `--strict` prints
  the modality tally (`Evidence Modality: NOT NATIVE`) and blocks the release.

A green deterministic suite is a signal about the tools. It is never evidence about agent behaviour,
and it must never be promoted into `webmcp/evals/artifacts/`.

## How a record is checked

A record is evidence only if it can be tied to a specific execution, a specific case text and a
specific implementation, and if the store it lives in cannot be quietly rewritten. `run-evidence.js`
enforces all four, and `npm test` runs the same check on the checked-in ledger:

| Field | What it is bound to |
| --- | --- |
| `evidenceLayer` | the execution modality: `native` and nothing else. A deterministic, in-memory, simulated or fixture-driven run is not evidence and is rejected here |
| `caseDigest` | sha256 of the case's frozen definition in the referenced dataset (its empty `runs` excluded) |
| `implementationRevision` / `implementationFingerprint` | the revision the run names, and the sha256 manifest of `webmcp/src/contracts.js` + `webmcp/src/storefront-catalog.js` + `webmcp/src/runtime.js` (the catalog since contract 1.8); a record naming the revision currently checked out must carry that revision's manifest |
| `startedAt` / `date` | the instant of the execution (ISO-8601 UTC) and its calendar day |
| `evidence` / `evidenceDigest` | a committed file under `webmcp/evals/artifacts/` and the sha256 of its exact bytes |
| `agent` / `model` / `browser` | the real tool/host, model and versioned browser engine that ran; `browser` must match `/^(Chromium\|Chrome\|Google Chrome\|Microsoft Edge\|Firefox\|Safari)\b.*\d/u` |
| `runId` | unique in the ledger; a copy of a record is not a second run |
| `language` | optional: the prompt language the run was observed in (`el`/`en`). A run in one language is not evidence about another, so it scopes the release cohort |
| `cohort` | optional: the sha256-derived cohort key of `(revision, fingerprint, dataset, language, model, browser family)` a record was recorded under. A correction or an audit compares against this when it is present |

The artifact is a JSON file with `artifactVersion: 1` and an `executions` array. Each execution
repeats the record's identity fields (including `evidenceLayer`), so the file itself says which runs
it evidences:

```json
{
  "artifactVersion": 1,
  "executions": [
    {
      "runId": "run-2026-09-12-product-011-1",
      "caseId": "product-011",
      "datasetVersion": "2.0.0",
      "evidenceLayer": "native",
      "agent": "Model Context Tool Inspector",
      "model": "example-agent-1",
      "browser": "Chromium 144",
      "implementationRevision": "0123456789abcdef0123456789abcdef01234567",
      "implementationFingerprint": "…64 hex…",
      "caseDigest": "…64 hex…",
      "startedAt": "2026-09-12T08:14:21.000Z",
      "date": "2026-09-12",
      "outcome": "passed"
    }
  ]
}
```

One artifact file may hold several executions (a session trace, several repeats of one case), so
sharing a file is allowed — as long as each run it evidences is identified separately. The same
execution copied under a new `runId` is not a second run, and an artifact that does not name the
record's `runId` is not evidence for it.

The ledger is append-only in the literal sense: existing records keep their order and their content.
A corrected result is a new record, never an edit. `git-baseline.js` reads the copy the merged branch
already published at the merge base (`git show <merge-base>:<path>`), and both the ledger and the two
frozen case files are compared against it — the working tree is never its own baseline, so deleting
or rewriting published evidence fails CI. Artifacts are committed bytes and are excluded from
formatting: rewriting them would break the recorded digest.

## Running a native case (real browser, real agent)

`webmcp/evals/native-run.mjs` runs the frozen cases against a real browser through the browser's own
WebMCP implementation. It simulates neither half and refuses when either is missing:

```bash
node webmcp/evals/native-run.mjs \
  --agent-command '<command that turns a case prompt into one tool call>' \
  --browser-command 'node /Users/gp/www/bestprice.gr/tools/scripts/webmcp-native-runner.mjs' \
  --agent-name 'Model Context Tool Inspector' --agent-model '<the model you actually used>' \
  --product-url 'https://www.bestprice.gr/item/<id>/<slug>.html'   # needed by the 17 item cases
```

* **agent** — reads `{caseId, prompt_el, prompt_en, url, tools, allowed_args, criteria}` on stdin and
  answers `{"tool": …, "arguments": …}`. The tool list is what the page *actually registered*, read
  from `document.modelContext.getTools()`, so the agent chooses from the real surface.
* **browser** — reads `{url, calls}` and executes each call with
  `document.modelContext.executeTool(tool, JSON.stringify(arguments))`, answering with the tool's own
  payload plus the browser identity. The reference implementation lives with the storefront, where a
  browser is already a dependency: `bestprice.gr/tools/scripts/webmcp-native-runner.mjs`.

Each case is judged mechanically against its frozen definition (`expected_tools`,
`required_result_properties`, refusal-only cases) by `journey.js`, **on one transcript**: the agent is
asked for one call per turn until it records a terminal, the page is re-probed each turn so a
navigation is followed, and the whole transcript is graded once (a `--max-steps` budget bounds the
loop, and exceeding it is `blocked` with that reason). Infrastructure failures — a browser that cannot
be probed, an agent command that exits non-zero — are recorded as `blocked`, not as model failures.
The artifact holds every step, the terminal, the expected chain and the reason. `--dry-run` judges and
prints without writing. Then:

```bash
node webmcp/evals/run-evidence.js --strict     # must print Release Ready: YES
```

A run driven by a stub or simulated planner is **rejected by the gate** rather than recorded: the
agent and model names are part of the evidence, and naming a stand-in as if it were an agent is the
one thing this ledger exists to prevent. Verified both ways — a real-browser run with a stub agent
executes correctly and then fails validation on its own name.

Four evidence layers, never summed into one number: deterministic contract tests, real-DOM state
transition tests, native-browser WebMCP integration, and real-agent natural-language runs. Only the
last one answers "does an agent choose the right tool and finish the shopper's task?" — and a pass
fraction over a bounded cohort is a distribution to report per case, not an excellence verdict.

## Contract parity with the storefront

The published surface (`webmcp/src/contracts.js`) and the pages that actually register the tools must
describe the same tools. `webmcp/test/contract-parity.test.js` compares every definition against the
storefront source of truth: the input contract field by field — names, types and bounds, in both
directions — and, since contract 1.8, the title, description, annotations, input field wording and
output schema exactly, plus the tools each page type registers. `webmcp/src/contract-parity.js`
reads the storefront from the sibling `bestprice.gr` checkout (override with
`BESTPRICE_STOREFRONT_ROOT`): each tool's words and output schema from its generated
`extra/mcpDiscovery/webmcp-tools.json`, its input schema and annotations from the page modules that
register it, and the page lists from the manifest its PHP builder renders.

The comparison always runs against the committed snapshot
`webmcp/test/fixtures/storefront-tools.v2.json`, so it cannot silently skip when the sibling checkout
is absent, and it re-reads the live files when the checkout contains the snapshot's source commit, so
the snapshot cannot silently drift. When the storefront changes its surface the digest check fails:
`npm run webmcp:snapshot -- <checkout>` rewrites the snapshot and
`webmcp/src/storefront-catalog.js` (the words and output schemas `contracts.js` publishes), and the
parity test then names every input field or annotation still to change by hand — the moment a
reviewer decides whether the published contract changes with it. `npm run eval:conformance`, the
mandatory release check, holds the live pages, the PHP manifest and the published contract to each
other with no snapshot. Names, counts and version strings are not parity — `show_offer`'s missing
`offer_ref` passed all three of those checks.

Tool execution remains bounded to the open page. Unknown shipping stays `null`;
offers expose no merchant click-through URL. Evaluation must not manufacture
merchant clicks, purchases or conversion evidence.
