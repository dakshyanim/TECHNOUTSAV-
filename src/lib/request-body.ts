export class RequestBodyError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function readRequestBody(request: Request, maximum: number, timeoutMs = 10000) {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError(400, 'Request details are required.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestBodyError(408, 'Request timed out. Please try again.')), timeoutMs);
  });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) return Buffer.concat(chunks).toString('utf8');
      size += value.byteLength;
      if (size > maximum) throw new RequestBodyError(413, 'Request is too large.');
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
