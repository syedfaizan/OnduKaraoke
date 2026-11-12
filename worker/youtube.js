/**
 * Ondu Karaoke — YouTube access inside a Durable Object.
 * Thin wrapper around shared/youtube.js: injects the key from the Worker
 * binding and the Cache-API backed 24h cache.
 */

import { searchKaraoke as sharedSearch, randomKaraokeSong as sharedRandom } from '../shared/youtube.js';
import { workerCache } from './cache.js';

export async function searchKaraoke(rawQuery, env) {
  return sharedSearch(rawQuery, env.YOUTUBE_API_KEY, workerCache(env));
}

export async function randomKaraokeSong(languageKey, env) {
  return sharedRandom(languageKey, env.YOUTUBE_API_KEY, workerCache(env));
}
