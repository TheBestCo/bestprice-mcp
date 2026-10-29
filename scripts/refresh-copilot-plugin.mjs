/**
 * Rebuild distribution/microsoft-copilot/ai-plugin.json and tools.snapshot.json
 * from the live tools/list. Drops the empty anyOf branch on get_shopping_decision
 * so the store package does not copy that gateway defect.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ENDPOINT = 'https://mcp.bestprice.gr/mcp';
const pluginPath = new URL('../distribution/microsoft-copilot/ai-plugin.json', import.meta.url);
const snapshotPath = new URL('../distribution/microsoft-copilot/tools.snapshot.json', import.meta.url);

export function withoutEmptyObjectBranch(schema) {
  if (!schema || !Array.isArray(schema.anyOf)) return schema;
  const branches = schema.anyOf.filter(branch => Object.keys(branch?.properties ?? {}).length > 0);
  if (branches.length === schema.anyOf.length) return schema;
  if (branches.length === 1) {
    return { ...branches[0], $schema: branches[0].$schema ?? schema.$schema };
  }
  return { ...schema, anyOf: branches };
}

export function packTools(liveTools) {
  return liveTools.map(tool => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: withoutEmptyObjectBranch(structuredClone(tool.inputSchema)),
    annotations: tool.annotations,
  }));
}

async function toolsList() {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
    'user-agent': 'bestprice-mcp-refresh-copilot-plugin',
  };
  const init = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'bestprice-mcp-refresh-copilot-plugin', version: '2.8.1' },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!init.ok) throw new Error(`initialize HTTP ${init.status}`);
  const listed = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { ...headers, 'mcp-protocol-version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!listed.ok) throw new Error(`tools/list HTTP ${listed.status}`);
  const body = await listed.json();
  const tools = body.result?.tools;
  if (!Array.isArray(tools) || tools.length === 0) throw new Error('tools/list returned no tools');
  return tools;
}

async function main() {
  const packed = packTools(await toolsList());
  const plugin = JSON.parse(readFileSync(pluginPath, 'utf8'));
  plugin.functions = packed.map(tool => ({
    name: tool.name,
    description: tool.description,
    capabilities: { security_info: { data_handling: ['GetPublicData'] } },
  }));
  plugin.runtimes[0].run_for_functions = packed.map(tool => tool.name);
  plugin.runtimes[0].spec.mcp_tool_description.tools = packed;
  writeFileSync(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`);
  writeFileSync(snapshotPath, `${JSON.stringify(packed, null, 2)}\n`);
  console.log(`refreshed ${packed.length} tools`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
