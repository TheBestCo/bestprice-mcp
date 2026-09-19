/** Validate transport bytes without replacing, buffering, or re-encoding the response. */
export function validateUtf8Response(response) {
  if (!response.body) return response;
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const body = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
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
