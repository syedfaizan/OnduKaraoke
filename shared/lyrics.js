/**
 * Ondu Karaoke — synced lyrics (shared by every backend).
 *
 * Lyrics come from LRCLIB: a free, open, key-less lyrics database. The song
 * title from YouTube is cleaned up first (karaoke uploads are full of
 * "(Karaoke Version) [HD Lyrics]" suffixes), then searched, and the best
 * record — preferring one with time-synced LRC — is turned into a small,
 * uniform `{ found, synced, lines }` payload.
 *
 * Like shared/youtube.js, the cache is injected:
 *   • Node   → an in-memory Map (server/lyrics.js)
 *   • Worker → the Cache API (worker/lyrics.js)
 */

const LRCLIB_API = 'https://lrclib.net';
const CLIENT_ID = 'OnduKaraoke/1.0 (https://github.com/syedfaizan/OnduKaraoke)';

/** Friendly, user-facing errors (never raw third-party payloads). */
export class LyricsError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'LyricsError';
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/* LRC parsing                                                         */
/* ------------------------------------------------------------------ */

/** `[mm:ss.xx]` / `[mm:ss:xx]` time tags. Non-numeric tags ([ar:…]) are ignored. */
const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
/** Word-level timings inside enhanced LRC, e.g. `<00:12.34>`. */
const WORD_TAG = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g;

/**
 * Turn LRC text into `[{ time: seconds, text }]`, sorted by time.
 * A line with several timestamps is emitted once per timestamp; metadata and
 * empty instrumentals are dropped.
 */
export function parseLrc(source) {
  if (typeof source !== 'string' || !source.trim()) return [];

  const lines = [];
  for (const raw of source.split(/\r?\n/)) {
    const tags = [...raw.matchAll(TIME_TAG)];
    if (!tags.length) continue;

    const text = raw
      .replace(/^(?:\[[^\]]*\]\s*)+/, '') // leading time / metadata tags
      .replace(WORD_TAG, '') //                 word-level tags
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;

    for (const tag of tags) {
      const fraction = tag[3] ? Number(tag[3]) / 10 ** tag[3].length : 0;
      const time = Number(tag[1]) * 60 + Number(tag[2]) + fraction;
      if (Number.isFinite(time)) lines.push({ time, text });
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/** Plain lyrics become un-timed lines (no highlight, but still readable). */
function parsePlain(source) {
  if (typeof source !== 'string') return [];
  return source
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 250)
    .map((text) => ({ time: null, text }));
}

/** Index of the line playing at `seconds`, or -1 before the first line. */
export function findLineIndex(lines, seconds) {
  if (!Array.isArray(lines) || !lines.length || !Number.isFinite(seconds)) return -1;

  let low = 0;
  let high = lines.length - 1;
  let found = -1;

  // A small lead-in makes the change feel in time with the singer.
  const at = seconds + 0.12;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= at) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* Query building & matching                                           */
/* ------------------------------------------------------------------ */

const BRACKET_CRUF =
  /\s*[\[(]\s*[^)\]]*\b(?:karaoke|lyric(?:s)?|official|audio|hd|hq|4k|1080p|720p|music\s+video|with\s+lyrics?|live|version|cover|video|mv)\b[^)\]]*[\])]/gi;

/** "Bohemian Rhapsody (Karaoke Version) [HD Lyrics]" → "Bohemian Rhapsody". */
export function cleanSongTitle(rawTitle) {
  return String(rawTitle || '')
    .replace(/[–—]/g, '-')
    .replace(BRACKET_CRUF, '')
    .replace(/^\s*\d{1,2}\s*[-.]\s*/, '') // leading track number
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

const normalize = (value) => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();

/** A karaoke uploader is a publisher, not the singer — don't match on it. */
const PUBLISHER = /karaoke|lyrics?|sing king|karafun|official|channel|tv|music/i;

/** Pick the most likely record: right song, full lyrics, real artist. */
function scoreRecord(record, wanted, artistHits, requestedArtist) {
  const title = normalize(record.trackName || record.name);
  let score = 0;

  if (title === wanted) score += 50;
  else if (title.includes(wanted) || wanted.includes(title)) score += 35;

  // "Imagine" should not resolve to "Imagine Dragons – Believer".
  if (title.length > wanted.length * 1.6) score -= 25;

  const wantedWords = wanted.split(' ').filter((word) => word.length > 1);
  const titleWords = new Set(title.split(' ').filter((word) => word.length > 1));
  score += wantedWords.filter((word) => titleWords.has(word)).length * 5;

  const synced = parseLrc(record.syncedLyrics);
  if (synced.length) {
    score += 45 + Math.min(Math.round(synced.length / 4), 20); // favour complete lyrics
  } else if (record.plainLyrics) {
    score += 5;
  }

  // The original artist tends to appear more than once among the results,
  // while covers and translations show up once.
  const artist = normalize(record.artistName);
  score += Math.min(artistHits.get(artist) || 0, 8) * 4;

  if (requestedArtist && !PUBLISHER.test(requestedArtist) && artist.includes(normalize(requestedArtist))) {
    score += 15;
  }

  return score;
}

/* ------------------------------------------------------------------ */
/* Fetch                                                              */
/* ------------------------------------------------------------------ */

/**
 * Find lyrics for a queued song. Never throws for "not found" — that is a
 * normal `{ found: false }` the UI can explain. Only infrastructure failures
 * throw a LyricsError.
 *
 * @param {{ title: string, artist?: string }} song
 * @param {{ get(key), set(key, value) }} [cache]
 */
export async function fetchLyrics(song = {}, cache) {
  const title = cleanSongTitle(song.title || song.trackName);
  if (!title) return { found: false, title: '', synced: false, lines: [] };

  const key = `lyrics:v1:${title.toLowerCase()}`;
  if (cache) {
    const hit = await cache.get(key);
    if (hit) return hit;
  }

  // Search the title field first: a broad `q` search finds "Imagine Dragons"
  // when the karaoke song is John Lennon's "Imagine".
  const searchUrl = (params) => `${LRCLIB_API}/api/search?${new URLSearchParams(params)}`;

  const search = async (url) => {
    let response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': CLIENT_ID, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new LyricsError('Lyrics are not answering right now — try again in a moment.', 502);
    }

    if (response.status === 429 || response.status === 503) {
      throw new LyricsError('The lyrics service is busy — try again in a moment.', 503);
    }
    if (!response.ok) {
      throw new LyricsError('Lyrics could not be loaded right now.', 502);
    }
    try {
      return await response.json();
    } catch {
      throw new LyricsError('Lyrics came back unreadable — try again in a moment.', 502);
    }
  };

  let records = await search(searchUrl({ track_name: title }));
  if (!Array.isArray(records) || !records.length) {
    records = await search(searchUrl({ q: title }));
  }

  let result = { found: false, title, synced: false, lines: [] };

  if (Array.isArray(records) && records.length) {
    const wanted = normalize(title);
    const artistHits = new Map();
    for (const record of records) {
      const artist = normalize(record.artistName);
      if (artist) artistHits.set(artist, (artistHits.get(artist) || 0) + 1);
    }

    const requestedArtist = PUBLISHER.test(song.artist || '') ? '' : song.artist;
    const best = records.reduce((a, b) =>
      scoreRecord(b, wanted, artistHits, requestedArtist) > scoreRecord(a, wanted, artistHits, requestedArtist)
        ? b
        : a,
    );
    const synced = parseLrc(best.syncedLyrics);
    const plain = synced.length ? [] : parsePlain(best.plainLyrics);
    const lines = synced.length ? synced : plain;

    result = {
      found: lines.length > 0,
      title: best.trackName || best.name || title,
      artist: best.artistName || '',
      synced: synced.length > 0,
      lines,
      source: 'LRCLIB',
    };
  }

  if (cache) await cache.set(key, result);
  return result;
}
