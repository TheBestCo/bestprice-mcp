/** Validate transport bytes without replacing, buffering, or re-encoding the response. */
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export function validateUtf8Response(response, { maxBytes = MAX_RESPONSE_BYTES, onFailure } = {}) {
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
  let reported = false;
  const notifyFailure = error => {
    if (reported) return;
    reported = true;
    try {
      Promise.resolve(onFailure?.(error)).catch(() => {});
    } catch {
      // A broken observer cannot replace the original stream error or own cleanup.
    }
  };
  const transform = new TransformStream({
    transform(chunk, controller) {
      try {
        // Enforce byte bounds before creating a decoded string or passing data to the SDK.
        checkBytes(chunk);
        decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk);
      } catch (error) {
        // Signal now: pipeTo's rejection can wait indefinitely for source.cancel().
        notifyFailure(error);
        throw error;
      }
    },
    flush() {
      try {
        // A trailing partial code point is invalid even if all earlier chunks were valid.
        decoder.decode();
      } catch (error) {
        notifyFailure(error);
        throw error;
      }
    },
  });
  // A consumer discarding a body is not an upstream failure: the SDK cancels every 202 Accepted,
  // notifications/initialized included. That cancel errors the writable, so pipeTo rejects with
  // the consumer's own reason (usually undefined). transformer.cancel cannot tell the cases apart
  // (a source error aborts the writable through it too), so mark cancellation where only the
  // consumer reaches it. Without this the handshake failed whenever the pipe's rejection beat
  // its completion: not with undici 6 (Node <= 23), on every run from undici 7.12 (Node 24-26).
  let discarded = false;
  const reader = transform.readable.getReader();
  const body = new ReadableStream(
    {
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel(reason) {
        discarded = true;
        return reader.cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
  // Observe upstream read failures too. The same pipe/backpressure behavior as pipeThrough
  // is retained, but its normally hidden completion promise now carries request-local failure.
  response.body.pipeTo(transform.writable).catch(error => {
    if (!discarded) notifyFailure(error);
  });
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
