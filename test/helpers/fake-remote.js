/**
 * An in-process Streamable HTTP MCP server used as the "remote" in bridge tests.
 *
 * It exposes a `fetch` function that routes requests straight into the SDK's web-standard
 * transport, so no sockets are opened, and records every request for assertions.
 */

import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

export const FAKE_SERVER_INFO = Object.freeze({ name: 'fake-remote', version: '9.9.9' });
export const FAKE_INSTRUCTIONS = 'Call echo with text. Never call boom.';

export const FAKE_TOOLS = [
  {
    name: 'echo',
    description: 'Echo the text argument back.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'fail_softly',
    description: 'Return a tool-level error result.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'boom',
    description: 'Throw a protocol error with data.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

/**
 * @param {{ instructions?: string, withPrompts?: boolean, stateless?: boolean }} [options]
 */
export async function startFakeRemote({
  instructions = FAKE_INSTRUCTIONS,
  withPrompts = false,
  stateless = false,
} = {}) {
  const capabilities = { tools: { listChanged: true }, ...(withPrompts ? { prompts: {} } : {}) };
  const server = new Server(FAKE_SERVER_INFO, { capabilities, instructions });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: FAKE_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    switch (params.name) {
      case 'echo': {
        const text = String(params.arguments?.text ?? '');
        return { content: [{ type: 'text', text }], structuredContent: { text } };
      }
      case 'fail_softly':
        return { content: [{ type: 'text', text: 'The fixture declined.' }], isError: true };
      case 'boom':
        throw new McpError(ErrorCode.InvalidParams, 'boom exploded', { hint: 'do not call boom' });
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool ${params.name}`);
    }
  });
  if (withPrompts) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [{ name: 'greet' }] }));
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: stateless ? undefined : randomUUID,
  });
  await server.connect(transport);

  /** @type {Request[]} */
  const requests = [];
  const fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    return transport.handleRequest(request);
  };

  return {
    server,
    transport,
    fetch,
    requests,
    /** JSON-RPC methods seen so far, in order (notifications included). */
    async methods() {
      const seen = [];
      for (const request of requests) {
        if (request.method !== 'POST') continue;
        const body = await request.clone().json();
        for (const message of Array.isArray(body) ? body : [body])
          if (message.method) seen.push(message.method);
      }
      return seen;
    },
    close: () => Promise.allSettled([transport.close(), server.close()]),
  };
}
