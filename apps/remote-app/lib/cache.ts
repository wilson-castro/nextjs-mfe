interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

const memoryStore = new Map<string, CacheEntry<unknown>>();

/**
 * Retrieves a cached item or computes and caches it.
 */
export async function getOrSetCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<{ data: T; cached: boolean }> {
  const now = Date.now();
  const entry = memoryStore.get(key) as CacheEntry<T> | undefined;

  if (entry && entry.expiresAt > now) {
    return { data: entry.value, cached: true };
  }

  const fresh = await fetcher();
  memoryStore.set(key, { value: fresh, expiresAt: now + ttlMs });
  return { data: fresh, cached: false };
}

/**
 * Clears the memory cache.
 */
export function clearCache(): void {
  memoryStore.clear();
}
