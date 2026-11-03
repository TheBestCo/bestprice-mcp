# BestPrice for Microsoft 365 Copilot

This folder is a Microsoft 365 app package. It does not run a server. Every surface in it calls the public, keyless MCP endpoint:

```text
https://mcp.bestprice.gr/mcp
```

The package carries two entry points to the same six read-only research tools (`get_shopping_decision`, `search_products`, `compare_offers`, `get_price_history`, `optimize_basket`, `check_deal`):

- A declarative agent (`declarativeAgent.json`) for Microsoft 365 Copilot Chat, Teams, and Copilot in Word. Its action is `ai-plugin.json`, plugin manifest 2.4, runtime `RemoteMCPServer`, auth `None`.
- An agent connector (`agentConnectors[0]`, id `bestprice-shopping`) for Copilot Cowork and the standalone MCP catalog. Its `remoteMcpServer.authorization.type` is `None`, so no `referenceId`.

## Store route

Microsoft closed the legacy "Connectors and Agents for Microsoft Copilot Studio" MCP certification on 31 October 2026. The current path is a Partner Center **Microsoft 365 and Copilot** offer of type "Apps and Agents for Microsoft 365 and Copilot". Microsoft states that an existing Microsoft 365 agent with an MCP server does not need a separate MCP submission. Those servers become available as standalone MCP servers automatically.

References:

- [Certify an MCP server (preview)](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-certification)
- [Build plugins from an MCP server](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins)
- [Cowork plugin development](https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-plugin-development)
- [Validation guidelines for agents](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/review-copilot-validation-guidelines)
- [Publish agents publicly](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/publish-plugin-publicly)
- [Partner Center submission guide](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/add-in-submission-guide)

## Package files

| File | Role |
| --- | --- |
| `manifest.json` | App manifest 1.30: declarative agent, agent connector, `en` default with `el` |
| `en.json`, `el.json` | Localization files. Agent strings use `localizationKeys` |
| `declarativeAgent.json` | Declarative agent schema v1.9. Bilingual instructions, five starters |
| `ai-plugin.json` | Plugin manifest 2.4, runtime `RemoteMCPServer`, auth `None` |
| `mcptools.json` | `tools/list` shape for the agent connector |
| `tools.snapshot.json` | Same tools, used by the test as the source of truth |
| `color.png` | 192×192 color icon, cropped from `assets/bestprice-mcp-logo-1024.png` |
| `outline.png` | 32×32 white outline on a transparent background |

The app id `8484c9ac-b5d2-52d2-8fe5-7f87fb484e22` is the UUID5 of the MCP URL. Keep it stable across updates. Bump `version` with every resubmission.

`manifest.json`, `ai-plugin.json`, and `mcptools.json` stay ASCII-only. Greek strings live in `el.json`, and the agent instructions, which are not localizable, carry an English and a Greek section.

## Annotations

Microsoft 365 Copilot and Cowork treat an MCP tool without annotations as destructive and ask for confirmation when `readOnlyHint` is false or `destructiveHint` is true.

Checked against `tools/list` on 2 November 2026 (server 1.8.5). All four tools return `title`, `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: true`. The input schemas no longer have the empty `anyOf` branch.

Refresh after a server release:

```sh
node scripts/refresh-copilot-plugin.mjs
node --test test/microsoft-copilot.test.js
```

## Validate

```sh
npx -p @microsoft/m365agentstoolkit-cli atk validate --manifest-file distribution/microsoft-copilot/manifest.json
```

That runs the schema and local rules. `atk validate --package-file bestprice-shopping.zip` also runs the store rules, but it needs a Microsoft 365 sign-in. `wiqd plugin validate --mode deep` runs the same App Validation Library as upload, after a person accepts the wiqd EULA.

## Build the zip

Put the files at the archive root. A nested folder makes upload fail.

```sh
cd distribution/microsoft-copilot
zip -r bestprice-shopping.zip manifest.json en.json el.json declarativeAgent.json ai-plugin.json mcptools.json color.png outline.png
```

Do not commit the zip. Rebuild it after any manifest change.

## Sideload into a test tenant

The tenant needs custom app upload and a Copilot license. An admin turns upload on in the Microsoft 365 admin center under **Settings > Org settings > Services > Microsoft 365 Copilot > Copilot extensibility**, or the equivalent Teams custom-app policy.

Upload `bestprice-shopping.zip` at [https://dev.teams.microsoft.com/apps](https://dev.teams.microsoft.com/apps), or open the folder in Visual Studio Code with Microsoft 365 Agents Toolkit 6.12 or later and choose **Provision**.

Open [https://m365.cloud.microsoft/chat](https://m365.cloud.microsoft/chat). The agent appears with `dev` after the name. Ask for a phone under 500 euros with NFC and 5G. No sign-in prompt should appear.

## Publish through Partner Center

1. Sign in at [https://partner.microsoft.com/dashboard/marketplace-offers/overview](https://partner.microsoft.com/dashboard/marketplace-offers/overview) with the publisher account for The Best Company S.A.
2. Open the **Microsoft 365 and Copilot** tab, choose **+ New offer**, then the Microsoft 365 app / agent offer type.
3. Upload a freshly built `bestprice-shopping.zip`. Keep the same app id. A new id creates a second app.
4. Privacy policy: `https://www.bestprice.gr/policies/privacy`. Terms: `https://www.bestprice.gr/policies/terms`. Support: `https://www.bestprice.gr/contact`.
5. Paste the certification notes, then submit. Partner Center review is separate from this repository and from the test-tenant sideload.
