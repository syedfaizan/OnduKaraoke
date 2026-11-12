/**
 * Ondu Karaoke — 24 hour cache for YouTube search results.
 *
 * On Workers the natural place for this is the Cache API: it is global
 * (per data centre), free, and survives isolate recycling — so two phones
 * searching the same song share one cached answer.
 */

const CACHE_TTL_SECONDS = 24 * 60 * 60;

/** Cache adapter for shared/youtube.js: { get(key), set(key, value) }. */
export function workerCache(env) {
  const cache = caches.default;

  return {
    async get(key) {
      try {
        const hit = await cache.match(`https://ondu.cache/${encodeURIComponent(key)}`);
        if (!hit) return null;
        return await hit.json();
      } catch {
        return null;
      }
    },
    async set(key, value) {
      try {
        await cache.put(
          `https://ondu.cache/${encodeURIComponent(key)}`,
          new Response(JSON.stringify(value), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
            },
          }),
        );
      } catch {
        // A cache miss is never fatal.
      }
    },
  };
}
