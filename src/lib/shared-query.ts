// Only use for identical PUBLIC reads. No sessions, parameters or private data.
// Shares an in-flight promise within one process; never caches a settled result.
export function sharePublicQuery<T>(load: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  return () => {
    if (!pending) pending = Promise.resolve().then(load).finally(() => { pending = undefined; });
    return pending;
  };
}
