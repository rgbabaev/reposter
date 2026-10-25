export async function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([cancelled, operation]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export async function* abortableItems<T>(
  items: AsyncIterable<T>,
  signal: AbortSignal,
): AsyncIterable<T> {
  const iterator = items[Symbol.asyncIterator]();
  try {
    while (true) {
      signal.throwIfAborted();
      const result = await abortable(iterator.next(), signal);
      if (result.done) return;
      yield result.value;
    }
  } finally {
    void iterator.return?.().catch(() => {});
  }
}
