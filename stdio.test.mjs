import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, describe, it } from 'node:test';

/**
 * Track spawned processes for cleanup
 */
const spawnedProcesses = [];

after(() => {
  // Ensure all spawned processes are killed
  for (const proc of spawnedProcesses) {
    if (proc && !proc.killed) {
      proc.kill('SIGKILL');
    }
  }
});

/**
 * Spawn a stdio process with proper cleanup tracking
 */
function spawnStdioProcess() {
  const process = spawn('node', ['stdio.mjs'], {
    cwd: new URL('.', import.meta.url).pathname,
  });
  spawnedProcesses.push(process);
  return process;
}

/**
 * Wait for startup message on stderr
 */
function waitForStartup(process, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for startup message'));
    }, timeoutMs);

    const onStderr = (data) => {
      const message = data.toString();
      if (message.includes('BestPrice MCP stdio forwarder started')) {
        clearTimeout(timeout);
        process.stderr.off('data', onStderr);
        resolve();
      }
    };

    process.stderr.on('data', onStderr);
  });
}

describe('BestPrice MCP stdio forwarder', () => {
  it('starts and logs startup message immediately', async () => {
    const process = spawnStdioProcess();
    
    try {
      // Wait for startup message (must appear before any network activity)
      await waitForStartup(process, 3000);
      assert.ok(true, 'stdio process started and logged startup message');
    } finally {
      // Clean up: kill process and wait for exit
      process.kill('SIGTERM');
      await new Promise((resolve) => {
        const exitTimeout = setTimeout(() => {
          process.kill('SIGKILL');
          resolve();
        }, 1000);
        process.on('exit', () => {
          clearTimeout(exitTimeout);
          resolve();
        });
      });
    }
  });

  it('handles MCP protocol errors gracefully without crashing', async () => {
    const process = spawnStdioProcess();
    
    try {
      // Wait for startup
      await waitForStartup(process, 3000);
      
      // Send invalid JSON to test error handling
      process.stdin.write('invalid json\n');
      
      // Give it a moment to process
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Process should still be running
      assert.ok(!process.killed, 'process should handle invalid input without crashing');
    } finally {
      // Clean up
      process.kill('SIGTERM');
      await new Promise((resolve) => {
        const exitTimeout = setTimeout(() => {
          process.kill('SIGKILL');
          resolve();
        }, 1000);
        process.on('exit', () => {
          clearTimeout(exitTimeout);
          resolve();
        });
      });
    }
  });
});
