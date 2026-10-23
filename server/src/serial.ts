/** Serializes source lifecycle and processing work for a physical provider source. */
export class Serial {
  private tails = new Map<string, Promise<unknown>>();
  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    this.tails.set(key, next);
    void next
      .finally(() => {
        if (this.tails.get(key) === next) this.tails.delete(key);
      })
      .catch(() => {});
    return next;
  }
  async drain() {
    await Promise.allSettled(this.tails.values());
  }
}
