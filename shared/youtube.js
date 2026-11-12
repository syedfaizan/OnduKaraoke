/**
 * Ondu Karaoke — YouTube Data API v3 access (shared by every backend).
 *
 * This module is the ONLY place that talks to Google. The API key is
 * injected (never read from a global), every query is nudged toward
 * karaoke, and results are cached for 24 hours so a party full of people
 * searching the same song does not burn the daily quota.
 *
 * The cache is injected too, because the two runtimes cache differently:
 *   • Node   → an in-memory Map (server/youtube.js)
 *   • Worker → the Cache API (worker/youtube.js)
 */

import { languageByKey } from './randomSongs.js';

/** Cache lifetime — 24 hours (one YouTube quota "day"). */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Channels that reliably publish karaoke versions — they get bumped up. */
const KNOWN_KARAOKE_CHANNELS = /sing king|karafun|karaoke version/i;

/** Friendly, user-facing errors (never raw Google payloads). */
export class YouTubeError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'YouTubeError';
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'" };

function decodeText(value) {
  return String(value || '').replace(/&(#39|amp|quot|apos|lt|gt);/g, (_, key) => ENTITIES[key]);
}

/**
 * Every query silently gets "karaoke" appended — unless the user already
 * typed it. Keeps results on-topic (and mostly embeddable).
 */
function normalizeQuery(rawQuery) {
  const query = String(rawQuery || '')
    .trim()
    .slice(0, 120);

  if (!query) {
    throw new YouTubeError('Type a song or artist name first 🙂', 400);
  }

  return /\bkaraoke\b/i.test(query) ? query.toLowerCase() : `${query} karaoke`.toLowerCase();
}

/** A simple in-memory cache (used by the Node server and as a fallback). */
export function memoryCache() {
  const store = new Map();

  return {
    async get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (Date.now() - hit.at > CACHE_TTL_MS) {
        store.delete(key);
        return null;
      }
      return hit.value;
    },
    async set(key, value) {
      store.set(key, { at: Date.now(), value });

      // Drop the oldest quarter when we grow past the cap.
      if (store.size > 200) {
        const drop = Math.ceil(store.size / 4);
        let seen = 0;
        for (const k of store.keys()) {
          if (seen++ >= drop) break;
          store.delete(k);
        }
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

async function fetchFromYouTube(query, apiKey) {
  if (!apiKey) {
    throw new YouTubeError(
      'Song search is not set up yet — the host needs to add YOUTUBE_API_KEY to the .env file (see README).',
      503,
    );
  }

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true', // only videos that actually work in an iframe
    videoCategoryId: '10', // "Music"
    maxResults: '12',
    q: query,
    key: apiKey,
  });

  let response;
  try {
    response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
  } catch (err) {
    console.error('[youtube] request failed:', err.message);
    throw new YouTubeError('YouTube is not answering right now — try again in a few seconds.', 502);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason;

    if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded' || response.status === 403) {
      throw new YouTubeError(
        'The YouTube search quota is used up for today 😅 It resets at midnight (Pacific time). The Random tab and already-cached songs still work.',
        429,
      );
    }
    if (reason === 'keyInvalid' || reason === 'accessNotConfigured' || response.status === 400) {
      throw new YouTubeError(
        'That YouTube API key was rejected — double-check YOUTUBE_API_KEY and that "YouTube Data API v3" is enabled for it.',
        502,
      );
    }
    throw new YouTubeError('YouTube search is having a moment — try again in a few seconds.', 502);
  }

  const body = await response.json();

  const results = (body.items || [])
    .filter((item) => item?.id?.videoId)
    .map((item) => ({
      videoId: item.id.videoId,
      title: decodeText(item.snippet?.title),
      channel: decodeText(item.snippet?.channelTitle),
      thumbnail:
        item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
    }));

  // Prefer the channels that actually publish karaoke versions.
  const trusted = results.filter((song) => KNOWN_KARAOKE_CHANNELS.test(song.channel));
  const rest = results.filter((song) => !KNOWN_KARAOKE_CHANNELS.test(song.channel));

  return [...trusted, ...rest];
}

/**
 * Search YouTube for a karaoke version of something.
 *
 * @param {string} rawQuery   user input (the word "karaoke" is added silently)
 * @param {string} apiKey     the YouTube key
 * @param {object} [cache]    { get(key), set(key, value) } — optional
 */
export async function searchKaraoke(rawQuery, apiKey, cache) {
  const query = normalizeQuery(rawQuery);

  if (cache) {
    const cached = await cache.get(query);
    if (cached) return cached;
  }

  const results = await fetchFromYouTube(query, apiKey);
  if (cache) await cache.set(query, results);
  return results;
}

/**
 * Pick a random popular karaoke song in a language.
 * Random picks reuse the 24h cache, so they cost no extra quota.
 */
export async function randomKaraokeSong(languageKey, apiKey, cache) {
  const language = languageByKey(languageKey);
  if (!language) {
    throw new YouTubeError('Pick a language first 🎲', 400);
  }

  const results = await searchKaraoke(language.query, apiKey, cache);
  if (!results.length) {
    throw new YouTubeError(`Couldn't find any ${language.label} karaoke right now — try again!`, 502);
  }

  const pool = results.slice(0, Math.min(results.length, 10));
  return pool[Math.floor(Math.random() * pool.length)];
}
