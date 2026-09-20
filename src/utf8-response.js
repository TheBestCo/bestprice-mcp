/** Validate transport bytes without replacing, buffering, or re-encoding the response. */
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export function validateUtf8Response(response, { maxBytes = MAX_RESPONSE_BYTES } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('maxBytes must be a positive safe integer.');
  }
  if (!response.body) return response;
  const eventStream =
    response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() === 'text/event-stream';
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let responseBytes = 0;
  let eventBytes = 0;
  let lineBytes = 0;
  let contentBytes = 0;
  let comment = false;
  let pendingCR = false;
  const exceeded = () => {
    throw new RangeError(`MCP response exceeded the ${maxBytes} byte limit.`);
  };
  const count = () => {
    if (++lineBytes > maxBytes) exceeded();
    if (!comment && ++eventBytes > maxBytes) exceeded();
  };
  const endLine = () => {
    if (contentBytes === 0) eventBytes = 0;
    lineBytes = 0;
    contentBytes = 0;
    comment = false;
  };
  const checkBytes = chunk => {
    if (!eventStream) {
      if (chunk.byteLength > maxBytes - responseBytes) exceeded();
      responseBytes += chunk.byteLength;
      return;
    }
    // SSE is long-lived: bound each line and unfinished event, not the lifetime stream.
    // Recognize CR, LF and split CRLF without retaining bytes or resetting at comments.
    // Comment lines have their own line cap but do not grow the pending data event.
    for (const byte of chunk) {
      if (pendingCR) {
        pendingCR = false;
        if (byte === 10) {
          count();
          endLine();
          continue;
        }
        endLine();
      }
      if (lineBytes === 0) comment = byte === 58;
      count();
      if (byte === 13) pendingCR = true;
      else if (byte === 10) endLine();
      else contentBytes += 1;
    }
  };
  const body = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        // Enforce byte bounds before creating a decoded string or passing data to the SDK.
        checkBytes(chunk);
        decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk);
      },
      flush() {
        // A trailing partial code point is invalid even if all earlier chunks were valid.
        decoder.decode();
      },
    }),
  );
  const checked = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  // The SDK currently reads status/headers/body; retain the other fetch metadata too.
  for (const name of ['url', 'redirected', 'type']) {
    Object.defineProperty(checked, name, { value: response[name], enumerable: true });
  }
  return checked;
}
