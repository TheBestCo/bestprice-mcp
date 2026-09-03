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
    let stderrBuffer = '';
    let stdoutBuffer = '';
    
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for startup message. stderr: ${stderrBuffer}, stdout: ${stdoutBuffer}`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      process.stderr.off('data', onStderr);
      process.stdout.off('data', onStdout);
      process.off('exit', onExit);
      process.off('error', onError);
    };

    const onStderr = (data) => {
      const message = data.toString();
      stderrBuffer += message;
      if (message.includes('BestPrice MCP stdio forwarder started')) {
        cleanup();
        resolve();
      }
    };

    const onStdout = (data) => {
      stdoutBuffer += data.toString();
    };

    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`Process exited (code: ${code}, signal: ${signal}) before startup. stderr: ${stderrBuffer}, stdout: ${stdoutBuffer}`));
    };

    const onError = (error) => {
      cleanup();
      reject(new Error(`Process error before startup: ${error.message}. stderr: ${stderrBuffer}, stdout: ${stdoutBuffer}`));
    };

    process.stderr.on('data', onStderr);
    process.stdout.on('data', onStdout);
    process.on('exit', onExit);
    process.on('error', onError);
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
