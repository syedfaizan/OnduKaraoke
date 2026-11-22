/**
 * Pure GIPHY helpers, safe to use in both the browser and Node tests.
 *
 * GIPHY's API terms require search calls to come straight from the client and
 * forbid caching responses or media URLs, so there is deliberately no server
 * endpoint and no cache here — just URL building and response parsing.
 */

import { isGiphyMediaUrl } from './memes.js';

const SEARCH_URL = 'https://api.giphy.com/v1/gifs/search';

/** Build one search request. `rating=g` keeps the results party-friendly. */
export function giphySearchUrl(apiKey, query) {
  const params = new URLSearchParams({
    api_key: apiKey,
    q: query,
    limit: '1',
    rating: 'g',
    lang: 'en',
  });
  return `${SEARCH_URL}?${params}`;
}

/** Pick the small (~200px) GIF rendition from one search result. */
export function pickGiphyUrl(gif) {
  const images = gif?.images || {};
  const candidates = [
    images.fixed_height?.url,
    images.fixed_height_small?.url,
    images.downsized_small?.url,
  ];
  return candidates.find((url) => isGiphyMediaUrl(url)) || '';
}
