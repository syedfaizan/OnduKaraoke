/**
 * Live memes from GIPHY, fetched by the phone (never by the server — GIPHY's
 * terms require client-side requests and forbid caching their results).
 *
 * The key is a public, domain-restricted Web key from the GIPHY dashboard,
 * baked into the bundle at build time as VITE_GIPHY_API_KEY. Without it the
 * bundled GIFs are used instead.
 */
import { MEME_REACTIONS } from '../../../shared/memes.js';
import { giphySearchUrl, pickGiphyUrl } from '../../../shared/giphy.js';

// `import.meta.env` is a Vite construct; the guard keeps this module importable
// from the Node-based checks in worker/scripts/memes.mjs.
const env = typeof import.meta.env === 'undefined' ? {} : import.meta.env;
export const GIPHY_API_KEY = env.VITE_GIPHY_API_KEY || '';

/**
 * One search per meme button, in parallel. A failed search leaves that button
 * on its local GIF — it never breaks the React tab.
 */
export async function fetchGiphyMemes({ apiKey = GIPHY_API_KEY, doFetch = fetch } = {}) {
  if (!apiKey) return [];

  return Promise.all(
    MEME_REACTIONS.map(async ({ id, label, query }) => {
      try {
        const response = await doFetch(giphySearchUrl(apiKey, query));
        if (!response.ok) return { id, label, url: '' };
        const body = await response.json();
        return { id, label, url: pickGiphyUrl(body?.data?.[0]) };
      } catch (err) {
        console.error(`[giphy] ${id}:`, err?.message || err);
        return { id, label, url: '' };
      }
    }),
  );
}
