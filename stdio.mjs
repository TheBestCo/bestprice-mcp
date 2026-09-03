#!/usr/bin/env node
/**
 * BestPrice MCP stdio forwarder
 * 
 * This local stdio MCP server forwards all MCP protocol requests to the public
 * BestPrice MCP endpoint at https://mcp.bestprice.gr/mcp via Streamable HTTP.
 * 
 * It speaks MCP stdio on stdin/stdout and translates requests to HTTP POST calls
 * with SSE response handling. This allows Glama to build and run a local process
 * without depending on the mcp-remote package.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const REMOTE_ENDPOINT = 'https://mcp.bestprice.gr/mcp';

/**
 * Forward an MCP request to the remote HTTP endpoint
 * @param {string} method - MCP method name
 * @param {object} params - Request parameters
 * @returns {Promise<object>} Response from remote server
 */
async function forwardRequest(method, params = {}) {
  const body = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };

  const response = await fetch(REMOTE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  
  if (contentType.includes('text/event-stream')) {
    // Handle SSE response
    const text = await response.text();
    const lines = text.split('\n');
    let data = '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        data += line.slice(6);
      } else if (line === '' && data) {
        // End of SSE message
        const parsed = JSON.parse(data);
        if (parsed.result) {
          return parsed.result;
        }
        data = '';
      }
    }
    
    // If we have remaining data, parse it
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed.result) {
        return parsed.result;
      }
    }
    
    throw new Error('No valid result in SSE response');
  } else {
    // Handle JSON response
    const json = await response.json();
    if (json.error) {
      throw new Error(`MCP Error: ${json.error.message || JSON.stringify(json.error)}`);
    }
    return json.result;
  }
}

/**
 * Create and configure the MCP server
 */
function createServer() {
  const server = new Server(
    {
      name: 'bestprice-stdio-forwarder',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Forward initialize request to get real server info
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const tools = await forwardRequest('tools/list');
      return tools;
    } catch (error) {
      console.error('Error forwarding tools/list:', error);
      return { tools: [] };
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await forwardRequest('tools/call', {
        name: request.params.name,
        arguments: request.params.arguments,
      });
      return result;
    } catch (error) {
      console.error('Error forwarding tools/call:', error);
      throw error;
    }
  });

  return server;
}

/**
 * Main entry point
 */
async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  
  await server.connect(transport);
  
  console.error('BestPrice MCP stdio forwarder started');
  console.error(`Forwarding to: ${REMOTE_ENDPOINT}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
