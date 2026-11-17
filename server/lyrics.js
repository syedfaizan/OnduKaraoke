/**
 * Ondu Karaoke — lyrics access for the Node server.
 * Thin wrapper around shared/lyrics.js with an in-memory 24h cache.
 */

import { fetchLyrics as sharedFetchLyrics } from '../shared/lyrics.js';
import { memoryCache } from '../shared/youtube.js';

export { LyricsError } from '../shared/lyrics.js';

const cache = memoryCache();

export async function fetchLyrics(song) {
  return sharedFetchLyrics(song, cache);
}
