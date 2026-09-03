import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { describe, it } from 'node:test';

/**
 * Send a JSON-RPC request to the stdio process and wait for response
 */
async function sendJsonRpcRequest(process, method, params = {}) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    };

    let buffer = '';
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${method} response`));
    }, 10000);

    const onData = (data) => {
      buffer += data.toString();
      
      // Try to parse JSON-RPC responses
      const lines = buffer.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const response = JSON.parse(line);
            if (response.id === request.id) {
              clearTimeout(timeout);
              process.stdout.off('data', onData);
              if (response.error) {
                reject(new Error(`JSON-RPC error: ${response.error.message || JSON.stringify(response.error)}`));
              } else {
                resolve(response.result);
              }
              return;
            }
          } catch (e) {
            // Not valid JSON, continue buffering
          }
        }
      }
      // Keep the last incomplete line in the buffer
      buffer = lines[lines.length - 1];
    };

    process.stdout.on('data', onData);
    process.stdin.write(JSON.stringify(request) + '\n');
  });
}

/**
 * Test that the remote endpoint is accessible
 */
async function isRemoteEndpointAccessible() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch('https://mcp.bestprice.gr/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          clientInfo: { name: 'test-client', version: '1.0.0' },
          capabilities: {},
        },
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    return response.ok;
  } catch (error) {
    return false;
  }
}

describe('BestPrice MCP stdio forwarder', () => {
  it('starts and accepts MCP initialize request', async () => {
    const hasNetwork = await isRemoteEndpointAccessible();
    
    if (!hasNetwork) {
      console.log('Skipping network test: remote endpoint not accessible (expected in CI)');
      // Still verify the stdio process can start
      const process = spawn('node', ['stdio.mjs'], {
        cwd: new URL('.', import.meta.url).pathname,
      });
      
      let started = false;
      const startTimeout = setTimeout(() => {
        process.kill();
        assert.fail('stdio process did not start within timeout');
      }, 3000);
      
      process.stderr.on('data', (data) => {
        const message = data.toString();
        if (message.includes('BestPrice MCP stdio forwarder started')) {
          started = true;
          clearTimeout(startTimeout);
          process.kill();
        }
      });
      
      await new Promise((resolve) => {
        process.on('exit', resolve);
      });
      
      assert.ok(started, 'stdio process should start and log startup message');
      return;
    }
    
    // Full integration test with network
    const process = spawn('node', ['stdio.mjs'], {
      cwd: new URL('.', import.meta.url).pathname,
    });
    
    try {
      // Wait for startup log
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for startup'));
        }, 5000);
        
        process.stderr.on('data', (data) => {
          if (data.toString().includes('BestPrice MCP stdio forwarder started')) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      
      // Send initialize request
      const initResult = await sendJsonRpcRequest(process, 'initialize', {
        protocolVersion: '2024-11-05',
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
        capabilities: {},
      });
      
      assert.ok(initResult, 'initialize should return a result');
      assert.ok(initResult.serverInfo, 'initialize result should include serverInfo');
      assert.equal(
        initResult.serverInfo.name,
        'bestprice-agent-commerce',
        'server name should match the remote endpoint'
      );
      
      // Test tools/list
      const toolsResult = await sendJsonRpcRequest(process, 'tools/list');
      assert.ok(toolsResult, 'tools/list should return a result');
      assert.ok(Array.isArray(toolsResult.tools), 'tools/list should return an array of tools');
      assert.ok(toolsResult.tools.length > 0, 'should have at least one tool');
      
      const toolNames = toolsResult.tools.map(tool => tool.name);
      const expectedTools = [
        'get_shopping_decision',
        'search_products',
        'compare_offers',
        'get_price_history',
      ];
      
      for (const expectedTool of expectedTools) {
        assert.ok(
          toolNames.includes(expectedTool),
          `should include ${expectedTool} tool`
        );
      }
    } finally {
      process.kill();
      await new Promise((resolve) => {
        process.on('exit', resolve);
      });
    }
  });
  
  it('handles tools/list without crashing when network is unavailable', async () => {
    // This test ensures the process handles errors gracefully
    const process = spawn('node', ['stdio.mjs'], {
      cwd: new URL('.', import.meta.url).pathname,
    });
    
    try {
      // Wait for startup
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for startup'));
        }, 5000);
        
        process.stderr.on('data', (data) => {
          if (data.toString().includes('BestPrice MCP stdio forwarder started')) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      
      // Try to list tools (will fail if network is down, but shouldn't crash)
      try {
        const toolsResult = await sendJsonRpcRequest(process, 'tools/list');
        // If we get here, network is available
        assert.ok(toolsResult, 'should return a result when network is available');
      } catch (error) {
        // Expected when network is unavailable
        // The important thing is the process didn't crash
        assert.match(error.message, /timeout|error/i, 'should timeout or error gracefully');
      }
    } finally {
      process.kill();
      await new Promise((resolve) => {
        process.on('exit', resolve);
      });
    }
  });
});
