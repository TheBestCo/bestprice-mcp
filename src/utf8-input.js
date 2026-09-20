import { Transform } from 'node:stream';

const invalidInput = () => {
  const error = new Error('MCP stdin must contain valid UTF-8 bytes.');
  error.code = 'ERR_MCP_STDIN_UTF8';
  return error;
};

/** Validate raw input before SDK replacement decoding; never normalize or log shopper bytes. */
export function createUtf8Input() {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return new Transform({
    // A previously decoded string has already lost byte provenance. Fail closed instead.
    decodeStrings: false,
    transform(chunk, _encoding, callback) {
      try {
        if (typeof chunk === 'string') throw invalidInput();
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
