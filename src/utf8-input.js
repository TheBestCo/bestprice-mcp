import { Transform } from 'node:stream';

export const MAX_INPUT_FRAME_BYTES = 8 * 1024 * 1024;

const invalidInput = () => {
  const error = new Error('MCP stdin must contain valid UTF-8 bytes.');
  error.code = 'ERR_MCP_STDIN_UTF8';
  return error;
};

/** Validate raw input before SDK replacement decoding; never normalize or log shopper bytes. */
export function createUtf8Input({ maxFrameBytes = MAX_INPUT_FRAME_BYTES } = {}) {
  if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1) {
    throw new TypeError('maxFrameBytes must be a positive safe integer.');
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let frameBytes = 0;
  const checkSize = chunk => {
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(10, start);
      const end = newline === -1 ? chunk.length : newline;
      if (end - start > maxFrameBytes - frameBytes) {
        const error = new Error(`MCP stdin frame exceeded the ${maxFrameBytes} byte limit.`);
        error.code = 'ERR_MCP_STDIN_SIZE';
        throw error;
      }
      frameBytes += end - start;
      if (newline === -1) return;
      // The SDK frames on LF only. Exclude that delimiter, but count CR and all UTF-8 bytes.
      // Bound unfinished frames too: backpressure alone cannot bound the SDK's line buffer.
      frameBytes = 0;
      start = newline + 1;
    }
  };
  return new Transform({
    // A previously decoded string has already lost byte provenance. Fail closed instead.
    decodeStrings: false,
    transform(chunk, _encoding, callback) {
      if (typeof chunk === 'string') {
        callback(invalidInput());
        return;
      }
      try {
        // Count before allocating a decoded string or handing a frame to the SDK.
        checkSize(chunk);
      } catch (error) {
        callback(error);
        return;
      }
      try {
        decoder.decode(chunk, { stream: true });
      } catch {
        callback(invalidInput());
        return;
      }
      // Preserve BOMs, code points, whitespace and chunk bytes exactly. The decoded value
      // is only a validation probe; re-encoding it could silently change legitimate input.
      callback(null, chunk);
    },
    flush(callback) {
      try {
        // An incomplete final multibyte sequence is corruption, not a clean stdin close.
        decoder.decode();
      } catch {
        callback(invalidInput());
        return;
      }
      callback();
    },
  });
}
