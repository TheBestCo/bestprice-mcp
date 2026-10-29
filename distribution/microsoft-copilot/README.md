# BestPrice Shopping for Microsoft 365 Copilot

This folder is an app package for a declarative agent. It does not run a server. The agent calls the public, keyless MCP endpoint:

```text
https://mcp.bestprice.gr/mcp
```

Authentication in `ai-plugin.json` is `None`. The four tools are `get_shopping_decision`, `search_products`, `compare_offers`, and `get_price_history`.

## Annotations

Microsoft 365 Copilot treats an MCP tool as destructive unless the tool advertises `readOnlyHint: true`, `destructiveHint: false`, and `openWorldHint: true`.

Checked against `tools/list` on 29 October 2026 (server 1.8.4). The live endpoint already returns those three hints, plus `idempotentHint: true`, on all four tools. `ai-plugin.json` copies that annotation object with each tool's name, description, and input schema. Output schemas stay on the live server; they are large and are not required for the destructive-tool check.

## Package files

| File | Role |
| --- | --- |
| `manifest.json` | Microsoft 365 app manifest, version 1.19 |
| `declarativeAgent.json` | Declarative agent, schema v1.6 |
| `ai-plugin.json` | Plugin manifest 2.4, runtime `RemoteMCPServer` |
| `color.png` | 192×192 color icon, cropped from `assets/bestprice-mcp-logo-1024.png` |
| `outline.png` | 32×32 white outline on a transparent background |

The app id `8484c9ac-b5d2-52d2-8fe5-7f87fb484e22` is the UUID5 of the MCP URL. Keep it stable across updates.

## Sideload into a test tenant

The tenant needs custom app upload and a Copilot license. An admin turns upload on in the Microsoft 365 admin center under **Settings > Org settings > Services > Microsoft 365 Copilot > Copilot extensibility**, or the equivalent Teams custom-app policy.

From this directory, zip the five files at the archive root. A nested folder makes Teams reject the package.

```sh
cd distribution/microsoft-copilot
zip -r bestprice-shopping.zip manifest.json declarativeAgent.json ai-plugin.json color.png outline.png
```

Then either:

- In Visual Studio Code, install Microsoft 365 Agents Toolkit 6.12 or later, open this folder, sign in to the test tenant, and choose **Provision**. The toolkit packages and sideloads the agent. Confirm **Custom app upload** and **Copilot access** are enabled on the signed-in account.
- Or upload `bestprice-shopping.zip` at [https://dev.teams.microsoft.com/apps](https://dev.teams.microsoft.com/apps) for the test tenant.

Open [https://m365.cloud.microsoft/chat](https://m365.cloud.microsoft/chat). The sideloaded agent appears in the Agents list with `dev` after the name. Ask for a phone under 500 euros with NFC and 5G. No BestPrice sign-in prompt should appear. The shopping tools do not use an account.

Do not commit the zip. Rebuild it after any manifest change.

## Publish through Partner Center

Sideload is only for the test tenant. Store distribution goes through Partner Center.

1. Sign in at [https://partner.microsoft.com/dashboard](https://partner.microsoft.com/dashboard) with the publisher account for The Best Company S.A.
2. Create a Microsoft 365 app / Copilot agent offer and upload a freshly built `bestprice-shopping.zip`.
3. Use the same app id. A new id creates a second app.
4. Privacy policy: `https://www.bestprice.gr/policies/privacy`. Terms: `https://www.bestprice.gr/policies/terms`. Support: `https://www.bestprice.gr/contact`.
5. Submit for validation. Partner Center review is separate from this repository and from the test-tenant sideload.

Official references: [plugin manifest 2.4](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-manifest-2.4), [anonymous authentication](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-none), [build an MCP plugin](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins).
