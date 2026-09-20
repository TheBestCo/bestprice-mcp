import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

/*
 * One child owns one browser for the whole journey, and this session owns the child's whole
 * process tree.
 *
 * The browser command is operator text run through `/bin/sh -c`. Killing that shell does not kill
 * what it started — Node's own documentation says so, and audit pass 8 (F03) kept a Node peer alive
 * after its shell was killed on timeout. On POSIX the shell therefore leads its own process group,
 * and every signal goes to the group: EOF first, then SIGTERM, then SIGKILL, each bounded.
 *
 * The session is poisoned, never reused, after anything ambiguous: a timeout, a malformed or
 * oversized reply, an unsolicited reply, or an unexpected exit. The action that was in flight may
 * already have changed the page, so nothing here retries it.
 */

export const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const STDERR_TAIL_CHARS = 4096;
const CLOSE_GRACE_MS = 5000;
const KILL_WAIT_MS = 2000;
const POLL_MS = 25;
const POSIX = process.platform !== 'win32';
const MAX_TIMER_MS = 2_147_483_647;
const validateInterval = (value, name, minimum = 1) => {
  if (!Number.isSafeInteger(value) || value < minimum || value > MAX_TIMER_MS) {
    throw new TypeError(`${name} must be an integer from ${minimum} to ${MAX_TIMER_MS}`);
  }
};

export function browserSession(
  command,
  timeoutMs = 60000,
  { closeGraceMs = CLOSE_GRACE_MS, maxFrameBytes = MAX_FRAME_BYTES } = {},
) {
  // Reject invalid bounds before creating any processes. NaN/Infinity must not disable caps.
  validateInterval(timeoutMs, 'timeoutMs');
  validateInterval(closeGraceMs, 'closeGraceMs', 0);
  if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1) {
    throw new TypeError('maxFrameBytes must be a positive safe integer');
  }
  // Preserve a leading BOM so JSON.parse still rejects it, as it did before. Validation must
  // never silently repair bytes that will later be recorded as browser observations.
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let serializing = false;
  const child = spawn('/bin/sh', ['-c', command], { stdio: ['pipe', 'pipe', 'pipe'], detached: POSIX });
  let state = 'open';
  let failure = null;
  let pending = null;
  let frame = [];
  let frameBytes = 0;
  let stderrTail = '';
  let exited = false;
  let terminating = null;

  const exit = new Promise(resolve => {
    child.once('exit', (code, signal) => {
      exited = true;
      resolve({ code, signal });
    });
    child.once('error', () => {
      if (!child.pid) {
        exited = true;
        resolve({ code: null, signal: null });
      }
    });
  });

  const withDiagnostics = message =>
    new Error(stderrTail.trim() ? `${message}; stderr: ${stderrTail.trim().slice(-600)}` : message);

  const signalTree = signal => {
    if (!child.pid) return;
    try {
      if (POSIX) process.kill(-child.pid, signal);
      else if (!exited) child.kill(signal);
    } catch {
      /* ESRCH: nothing left to signal. */
    }
  };

  /* A zombie keeps its group until reaped, and Node reaps the shell itself, so an empty group means
   * every process this session started is gone. */
  const treeAlive = () => {
    if (!child.pid) return false;
    if (!POSIX) return !exited;
    try {
      process.kill(-child.pid, 0);
      return true;
    } catch (error) {
      return error.code === 'EPERM';
    }
  };

  const waitForTree = async ms => {
    const deadline = Date.now() + ms;
    while (treeAlive() && Date.now() < deadline) await delay(POLL_MS);
    return !treeAlive();
  };

  const terminate = ({ graceful }) => {
    terminating ??= (async () => {
      try {
        child.stdin.end();
      } catch {
        /* Already closed. */
      }
      if (graceful && (await waitForTree(closeGraceMs))) return;
      signalTree('SIGTERM');
      if (await waitForTree(closeGraceMs)) return;
      signalTree('SIGKILL');
      await waitForTree(KILL_WAIT_MS);
    })().finally(async () => {
      await Promise.race([exit, delay(KILL_WAIT_MS)]);
      state = 'closed';
    });
    return terminating;
  };

  const settle = (error, value) => {
    if (!pending) return;
    const task = pending;
    pending = null;
    clearTimeout(task.timer);
    if (error) task.reject(error);
    else task.resolve(value);
  };

  const poison = error => {
    frame = [];
    frameBytes = 0;
    if (state === 'open') {
      state = 'poisoned';
      failure = error;
    }
    settle(error);
    terminate({ graceful: false });
  };

  const requestTimeout = () =>
    withDiagnostics(
      `browser session timed out after ${timeoutMs}ms; the action may have run and is not retried`,
    );

  const onLine = line => {
    if (state !== 'open') return;
    if (!pending) {
      poison(new Error('unsolicited browser reply'));
      return;
    }
    // A queued I/O callback can run before an overdue timer. Accept only a reply
    // that belongs to the still-live request budget, including JSON decoding work.
    if (performance.now() >= pending.expiresAt) {
      poison(requestTimeout());
      return;
    }
    let reply;
    try {
      reply = JSON.parse(line);
    } catch {
      poison(withDiagnostics('invalid browser reply'));
      return;
    }
    if (performance.now() >= pending.expiresAt) {
      poison(requestTimeout());
      return;
    }
    settle(null, reply);
  };

  child.stdout.on('data', chunk => {
    /* A poisoned or closed session consumes no further protocol frames: the
     * reply that killed it is the last thing this transport reads. */
    if (state !== 'open') return;
    if (!pending && chunk.length) {
      poison(
        new Error(
          chunk.length > maxFrameBytes
            ? `browser reply exceeded ${maxFrameBytes} bytes`
            : 'unsolicited browser reply bytes',
        ),
      );
      return;
    }
    let start = 0;
    for (let index = chunk.indexOf(10); index !== -1; index = chunk.indexOf(10, start)) {
      const fragment = chunk.subarray(start, index);
      /* The fragment BEFORE the newline is part of the frame and must be counted
       * before it is concatenated or decoded. Checking only the unterminated tail
       * meant an oversized reply was parsed whenever its terminating newline
       * arrived in the final fragment — single-chunk, split-chunk and split-UTF-8
       * alike (reproduced 2026-09-18 with a 128-byte cap). */
      frameBytes += fragment.length;
      frame.push(fragment);
      start = index + 1;
      if (frameBytes > maxFrameBytes) {
        frame = [];
        frameBytes = 0;
        poison(new Error(`browser reply exceeded ${maxFrameBytes} bytes`));
        return;
      }
      const bytes = Buffer.concat(frame, frameBytes);
      frame = [];
      frameBytes = 0;
      let line;
      try {
        line = decoder.decode(bytes);
      } catch {
        poison(new Error('invalid browser reply: invalid UTF-8'));
        return;
      }
      onLine(line);
      if (state !== 'open') return;
      // A surplus prefix is already unsolicited; waiting for its newline would
      // let the next request accidentally claim bytes from a previous operation.
      if (start < chunk.length && !pending) {
        poison(new Error('unsolicited browser reply bytes'));
        return;
      }
    }
    if (start < chunk.length) {
      frame.push(chunk.subarray(start));
      frameBytes += chunk.length - start;
      if (frameBytes > maxFrameBytes) {
        frame = [];
        frameBytes = 0;
        poison(new Error(`browser reply exceeded ${maxFrameBytes} bytes`));
      }
    }
  });
  child.stderr.on('data', chunk => {
    stderrTail = `${stderrTail}${chunk}`.slice(-STDERR_TAIL_CHARS);
  });
  child.stdin.on('error', error => poison(withDiagnostics(`browser session input failed: ${error.message}`)));
  child.on('error', error => poison(withDiagnostics(`browser session failed: ${error.message}`)));
  child.on('exit', (code, signal) => {
    if (state === 'open') poison(withDiagnostics(`browser session exited (${signal ?? `code ${code}`})`));
  });

  return {
    get state() {
      return state;
    },
    get diagnostics() {
      return stderrTail;
    },
    request(payload) {
      if (state !== 'open') {
        return Promise.reject(
          new Error(
            failure ? `browser session unavailable: ${failure.message}` : 'browser session is closed',
          ),
        );
      }
      if (pending || serializing) return Promise.reject(new Error('browser session is busy'));
      const expiresAt = performance.now() + timeoutMs;
      // Serialization is local work: a rejected input has not reached the browser and must not
      // reserve a pending reply or poison the next request. Reserve against toJSON/getter
      // reentrancy, and recheck close after serialization before dispatching anything.
      let serialized;
      serializing = true;
      try {
        serialized = JSON.stringify(payload);
        if (typeof serialized !== 'string') throw new TypeError('browser request must serialize to JSON');
      } catch (error) {
        return Promise.reject(error);
      } finally {
        serializing = false;
      }
      if (state !== 'open') return Promise.reject(new Error('browser session is closed'));
      if (performance.now() >= expiresAt) {
        // No bytes were dispatched: this local failure does not poison the peer.
        return Promise.reject(
          new Error(`browser request deadline elapsed after ${timeoutMs}ms before dispatch`),
        );
      }
      return new Promise((resolve, reject) => {
        pending = {
          resolve,
          reject,
          expiresAt,
          timer: setTimeout(
            () => poison(requestTimeout()),
            Math.max(1, Math.ceil(expiresAt - performance.now())),
          ),
        };
        try {
          child.stdin.write(`${serialized}\n`, error => {
            if (error) poison(withDiagnostics(`browser session input failed: ${error.message}`));
          });
        } catch (error) {
          poison(withDiagnostics(`browser session input failed: ${error.message}`));
        }
      });
    },
    /** Idempotent. Resolves once every process this session started has exited. */
    close() {
      if (state === 'open') {
        state = 'closing';
        settle(new Error('browser session closed'));
      }
      return terminate({ graceful: true });
    },
  };
}
