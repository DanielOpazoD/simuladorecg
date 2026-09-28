/**
 * WebKit reports object-URL downloads as requests. URL.origin resolves their embedded origin;
 * exact equality also rejects origin-prefix lookalikes. Malformed URLs throw, failing the flow.
 */
export function isLocalGet(request, origin) {
  return request.method === 'GET' && origin !== 'null' && new URL(request.url).origin === origin;
}
