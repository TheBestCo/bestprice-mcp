import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// One child owns one browser for the whole journey. EOF closes it. Never retry
// a timed-out action: it may already have changed the page.
export function browserSession(command, timeoutMs = 60000) {
  const child = spawn('/bin/sh', ['-c', command], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  let pending = null;
  let stopped = false;
  child.stderr.resume();
  const fail = error => {
    stopped = true;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      pending = null;
    }
  };
  child.on('error', fail);
  child.on('exit', () => fail(new Error('browser session exited')));
  lines.on('line', line => {
    if (!pending) return fail(new Error('unsolicited browser reply'));
    const task = pending;
    pending = null;
    clearTimeout(task.timer);
    try {
      task.resolve(JSON.parse(line));
    } catch {
      task.reject(new Error('invalid browser reply'));
    }
  });
  return {
    request(payload) {
      if (stopped || pending) return Promise.reject(new Error('browser session unavailable or busy'));
      return new Promise((resolve, reject) => {
        pending = {
          resolve,
          reject,
          timer: setTimeout(() => {
            fail(new Error('browser session timed out'));
            child.kill('SIGKILL');
          }, timeoutMs),
        };
        child.stdin.write(`${JSON.stringify(payload)}\n`);
      });
    },
    close() {
      child.stdin.end();
      child.kill('SIGTERM');
      lines.close();
    },
  };
}
