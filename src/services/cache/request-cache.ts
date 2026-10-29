interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

/** Small request cache shared by route repositories. It deduplicates concurrent reads
 * without turning feature data into application-global reactive state. */
export class RequestCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<unknown>>();

  remainingMs(key: string): number {
    return Math.max(0, (this.entries.get(key)?.expiresAt ?? 0) - Date.now());
  }

  async get<T>(key: string, ttlMs: number, loader: () => Promise<T>, refresh = false): Promise<T> {
    const inFlight = this.pending.get(key) as Promise<T> | undefined;
    if (!refresh && inFlight) return inFlight;

    const cached = this.entries.get(key) as CacheEntry<T> | undefined;
    if (!refresh && cached && cached.expiresAt > Date.now()) return cached.value;

    const request = loader()
      .then((value) => {
        if (this.pending.get(key) === request)
          this.entries.set(key, { expiresAt: Date.now() + ttlMs, value });
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === request) this.pending.delete(key);
      });

    this.pending.set(key, request);
    return request;
  }

  invalidate(prefix?: string): void {
    if (!prefix) {
      this.entries.clear();
      this.pending.clear();
      return;
    }

    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
    for (const key of this.pending.keys()) if (key.startsWith(prefix)) this.pending.delete(key);
  }
}
