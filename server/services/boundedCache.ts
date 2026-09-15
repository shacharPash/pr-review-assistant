/** A small process-local cache with absolute expiry and a byte budget. */
export class BoundedCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number; bytes: number }>();
  private bytes = 0;

  constructor(
    private readonly ttlMs = 15 * 60_000,
    private readonly maxEntries = 20,
    private readonly maxBytes = 50 * 1024 * 1024,
    private readonly now = Date.now,
  ) {}

  get(key: string): T | undefined {
    this.prune();
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.prune();
    const previous = this.entries.get(key);
    const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
    this.delete(key);
    if (bytes > this.maxBytes) return;
    this.entries.set(key, { value, bytes, expiresAt: previous?.expiresAt ?? this.now() + this.ttlMs });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      this.delete(this.entries.keys().next().value!);
    }
  }

  delete(key: string): void {
    this.bytes -= this.entries.get(key)?.bytes ?? 0;
    this.entries.delete(key);
  }

  prune(): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= this.now()) this.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }
}
