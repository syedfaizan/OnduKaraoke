/**
 * Ondu Karaoke — YouTube access for the Node server.
 * Thin wrapper around shared/youtube.js: injects the API key from .env and
 * an in-memory 24h cache.
 */

import { searchKaraoke as sharedSearch, randomKaraokeSong as sharedRandom, memoryCache, YouTubeError } from '../shared/youtube.js';

export { YouTubeError };

const cache = memoryCache();

const apiKey = () => process.env.YOUTUBE_API_KEY;

export async function searchKaraoke(rawQuery) {
  return sharedSearch(rawQuery, apiKey(), cache);
}

export async function randomKaraokeSong(languageKey) {
  return sharedRandom(languageKey, apiKey(), cache);
}
