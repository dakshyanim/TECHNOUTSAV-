export function challengePathFromQr(value: string, currentOrigin: string, eventOrigin?: string) {
  try {
    const url = new URL(value, currentOrigin);
    const allowed = new Set([new URL(currentOrigin).origin]);
    if (eventOrigin) allowed.add(new URL(eventOrigin).origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !allowed.has(url.origin)) return null;
    return /^\/challenge\/[A-Z0-9-]{1,40}$/.test(url.pathname) ? url.pathname : null;
  } catch { return null; }
}
