function httpOrigin(value: string | null | undefined) {
  if (!value || value === 'null') return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url;
  } catch { return null; }
}

export function isAllowedRequestOrigin(received: string | null, requestOrigin: string, configured: string | undefined, development: boolean) {
  const source = httpOrigin(received);
  // Production requires the explicitly configured event origin, not a Host header.
  const expected = httpOrigin(configured || (development ? requestOrigin : undefined));
  if (!source || !expected) return false;
  if (source.origin === expected.origin) return true;
  const loopbacks = new Set(['localhost', '127.0.0.1', '[::1]']);
  const target = httpOrigin(requestOrigin);
  return development && Boolean(target && loopbacks.has(source.hostname) && loopbacks.has(expected.hostname)
    && loopbacks.has(target.hostname) && source.protocol === expected.protocol
    && source.protocol === target.protocol && source.port === target.port);
}

export function hasAllowedRequestOrigin(request: { headers: { get(name: string): string | null }; nextUrl: { origin: string } }) {
  return isAllowedRequestOrigin(request.headers.get('origin'), request.nextUrl.origin, process.env.APP_ORIGIN, process.env.NODE_ENV === 'development');
}
