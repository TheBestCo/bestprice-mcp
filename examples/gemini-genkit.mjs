#!/usr/bin/env node
/**
 * Firebase Genkit & Google Gemini MCP Integration Example for BestPrice.
 *
 * Demonstrates loading BestPrice's public Streamable HTTP MCP tools into Genkit.
 */

export const genkitMcpConfig = {
  name: 'bestprice-shopping',
  url: 'https://mcp.bestprice.gr/mcp',
  transport: 'streamable-http',
  allowedTools: ['search_products', 'compare_offers', 'get_price_history'],
};

export function validateGenkitConfig(config = genkitMcpConfig) {
  if (config.url !== 'https://mcp.bestprice.gr/mcp') {
    throw new Error('Invalid endpoint URL');
  }
  if (!Array.isArray(config.allowedTools) || config.allowedTools.length !== 3) {
    throw new Error('Allowed tools must contain exactly 3 read-only tools');
  }
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateGenkitConfig();
  console.log('✓ Genkit BestPrice MCP configuration validated:');
  console.log(JSON.stringify(genkitMcpConfig, null, 2));
}
