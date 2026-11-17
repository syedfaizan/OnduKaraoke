/**
 * Ondu Karaoke — lyrics access inside the Worker.
 * Thin wrapper around shared/lyrics.js: the Cache API gives us a free,
 * shared 24h cache so a room only searches LRCLIB once per song.
 */

import { fetchLyrics as sharedFetchLyrics } from '../shared/lyrics.js';
import { workerCache } from './cache.js';

export async function fetchLyrics(song, env) {
  return sharedFetchLyrics(song, workerCache(env));
}
