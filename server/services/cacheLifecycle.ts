/** Deletion invalidates every cache and every request started before it. */
let generation = 0;
const clearers = new Set<() => void>();
export const cacheGeneration = () => generation;
export const isCurrentGeneration = (started: number) => started === generation;
export function registerCacheClear(clear: () => void): void { clearers.add(clear); }
export function clearLocalCaches(): void {
  generation++;
  for (const clear of clearers) clear();
}
