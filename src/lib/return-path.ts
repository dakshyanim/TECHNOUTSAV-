export function challengeReturnPath(value: unknown) {
  return typeof value === 'string' && /^\/challenge\/[A-Z0-9-]{1,40}$/.test(value) ? value : '/challenge';
}
