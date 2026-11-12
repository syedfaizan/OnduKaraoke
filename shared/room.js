/**
 * Ondu Karaoke — room logic (shared by every backend).
 *
 * This module is deliberately free of Node/DOM specifics so it can run in
 * three places without changes:
 *   • the Node/Socket.IO server  (server/rooms.js keeps the Map of rooms)
 *   • a Cloudflare Durable Object (worker/room.js — one object per room)
 *   • tests
 *
 * A room owns:
 *   - the guests (name + per-singer stats)
 *   - the song queue (kept in "fair" play order)
 *   - the playback phase (idle → intermission → playing → ended)
 *   - the night summary / badges
 */

/** "Get ready, <singer>!" countdown between songs. */
export const INTERMISSION_MS = 5000;

/** Anti-spam cooldown for applause / airhorn (per guest). */
export const SOUND_COOLDOWN_MS = 2000;

/** 4-letter room codes — no I/L/O so nobody mistypes them. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';

/** Works in Node 18+, Workers and browsers. */
const uuid = () => globalThis.crypto.randomUUID();

/** Random 4-letter room code. */
export function randomRoomCode() {
  return Array.from({ length: 4 }, () =>
    CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join('');
}

/* ------------------------------------------------------------------ */
/* Guests                                                              */
/* ------------------------------------------------------------------ */

/**
 * Join (or re-join) a room. A phone that refreshes comes back with the same
 * guestId, so it keeps its name AND its stats for the whole night.
 */
export function upsertGuest(room, { guestId, name, isHost = false, socketId }) {
  let guest = guestId ? room.guests.get(guestId) : null;

  if (guest) {
    guest.socketId = socketId; // re-bind to the (new) socket
    if (isHost) guest.isHost = true;
    return guest;
  }

  guest = {
    id: guestId || uuid(),
    name,
    socketId,
    isHost,
    songsSung: 0,
    reactionsReceived: 0,
    reactionsSent: 0,
    lastSoundAt: 0,
  };
  room.guests.set(guest.id, guest);
  return guest;
}

/** Find the guest that owns this socket (if any). */
export function guestForSocket(room, socketId) {
  for (const guest of room.guests.values()) {
    if (guest.socketId === socketId) return guest;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The queue                                                           */
/* ------------------------------------------------------------------ */

/**
 * Fair rotation ("snake draft").
 *
 * The queue is kept in play order — the first item is always up next.
 * Every song carries the round ("turn") it belongs to: a singer's 1st song
 * is round 0, their 2nd song round 1, and so on. A new song is inserted at
 * the end of its round, which keeps the rounds balanced:
 *
 *     round 0 → A1, B1, C1     (everyone's first song)
 *     round 1 → A2, B2         (everyone's second song)
 *
 * One enthusiastic guest can queue five songs but cannot hog the mic.
 * Inserting (instead of re-sorting) also means the queue never "jumps"
 * around while people are watching it.
 */
export function addSong(room, singer, song) {
  // Re-number this singer's queued songs (0, 1, 2 …) so the new song lands
  // in the right round.
  const mine = room.queue.filter((item) => item.singerId === singer.id);
  mine.forEach((item, index) => {
    item.turn = index;
  });

  const turn = mine.length;

  const item = {
    id: uuid(),
    videoId: song.videoId,
    title: song.title,
    channel: song.channel || '',
    thumbnail: song.thumbnail || '',
    singerId: singer.id,
    singerName: singer.name,
    addedAt: Date.now(),
    turn,
  };

  // Insert after every song that already belongs to an earlier (or equal) round.
  let insertAt = 0;
  room.queue.forEach((existing, index) => {
    if (existing.turn <= turn) insertAt = index + 1;
  });
  room.queue.splice(insertAt, 0, item);

  return item;
}

export function removeSong(room, songId) {
  room.queue = room.queue.filter((song) => song.id !== songId);
}

/** Move a song up (-1) or down (+1) in the queue. Host only. */
export function moveSong(room, songId, dir) {
  const index = room.queue.findIndex((song) => song.id === songId);
  if (index === -1) return false;
  const target = index + dir;
  if (target < 0 || target >= room.queue.length) return false;
  const [item] = room.queue.splice(index, 1);
  room.queue.splice(target, 0, item);
  return true;
}

/* ------------------------------------------------------------------ */
/* Playback orchestration                                              */
/* ------------------------------------------------------------------ */

/**
 * Pick the next song and open the intermission countdown.
 * Returns true when there was something to play.
 */
export function advance(room) {
  const next = room.queue[0];
  room.current = null;

  if (!next) {
    room.phase = 'idle'; // party is on, we're just waiting for songs
    room.playAt = 0;
    return false;
  }

  removeSong(room, next.id);
  room.current = { ...next, reactions: 0, started: false };
  room.phase = 'intermission';
  room.playAt = Date.now() + INTERMISSION_MS;
  return true;
}

/** The host screen actually started playing the video. */
export function startSong(room) {
  if (!room.current) return;
  room.phase = 'playing';
  room.startedAt = Date.now();
  room.current.started = true;
  const singer = room.guests.get(room.current.singerId);
  if (singer) singer.songsSung += 1; // a song counts as "sung" once it starts
}

/** The song is over (natural end, host skip, or an embed that refused to play). */
export function finishSong(room, { natural = false } = {}) {
  if (room.current && room.current.started) {
    room.history.push({ ...room.current, natural, endedAt: Date.now() });
  }
  room.current = null;
}

/* ------------------------------------------------------------------ */
/* Reactions & sounds                                                  */
/* ------------------------------------------------------------------ */

/** Reactions count for the singer whose song is playing right now. */
export function applyReaction(room, senderId) {
  const sender = room.guests.get(senderId);
  if (sender) sender.reactionsSent += 1;

  if (room.phase === 'playing' && room.current) {
    const singer = room.guests.get(room.current.singerId);
    if (singer) singer.reactionsReceived += 1;
    room.current.reactions = (room.current.reactions || 0) + 1;
  }
}

/** 2 second per-guest cooldown so nobody can machine-gun the airhorn. */
export function canPlaySound(room, guest) {
  const wait = guest.lastSoundAt + SOUND_COOLDOWN_MS - Date.now();
  if (wait > 0) return { ok: false, wait };
  guest.lastSoundAt = Date.now();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Stats, leaderboard & badges                                         */
/* ------------------------------------------------------------------ */

/**
 * Score = 10 points per song sung + 1 point per reaction received.
 * Simple, transparent and shown live on the host screen.
 */
export function statsOf(room) {
  return [...room.guests.values()]
    .map((guest) => ({
      id: guest.id,
      name: guest.name,
      songsSung: guest.songsSung,
      reactionsReceived: guest.reactionsReceived,
      reactionsSent: guest.reactionsSent,
      score: guest.songsSung * 10 + guest.reactionsReceived,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.reactionsReceived - a.reactionsReceived ||
        b.songsSung - a.songsSung ||
        a.name.localeCompare(b.name),
    );
}

export function computeSummary(room) {
  const stats = statsOf(room);

  const badge = (title, emoji, key, unit) => {
    const top = Math.max(0, ...stats.map((s) => s[key]));
    if (!top) return null; // nobody did this tonight — no badge
    return {
      title,
      emoji,
      unit,
      value: top,
      winners: stats.filter((s) => s[key] === top).map((s) => s.name),
    };
  };

  return {
    badges: [
      badge('Most Songs', '🎤', 'songsSung', 'songs sung'),
      badge('Crowd Favorite', '❤️', 'reactionsReceived', 'reactions received'),
      badge('Hype Master', '📣', 'reactionsSent', 'reactions sent'),
    ].filter(Boolean),
    leaderboard: stats,
    totals: {
      songs: room.history.length,
      reactions: stats.reduce((total, s) => total + s.reactionsReceived, 0),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Room lifecycle                                                      */
/* ------------------------------------------------------------------ */

/**
 * A fresh, empty room.
 *
 * `hostToken` is the secret that turns a phone into the "host remote".
 * The Node server mints it when the room is created; on Cloudflare the room
 * object has no token until the first host connects and claims it.
 */
export function createRoomState(code, { hostToken = null } = {}) {
  return {
    code,
    hostToken,
    hostSocketId: null,
    partyStarted: false,
    phase: 'idle', // idle | intermission | playing | ended
    speed: 1,
    queue: [], // songs in raw add-order (source of truth)
    current: null, // the song being sung (or about to be)
    playAt: 0, // timestamp the next song should start (intermission countdown)
    startedAt: 0, // timestamp the current song actually started
    guests: new Map(), // guestId -> guest
    history: [], // songs that already happened tonight
    summary: null,
    lastActivity: Date.now(),
  };
}

/** The single snapshot every device renders from. */
export function buildState(room) {
  return {
    roomCode: room.code,
    phase: room.phase,
    partyStarted: room.partyStarted,
    speed: room.speed,
    queue: room.queue, // already in play order — first item is up next
    current: room.current,
    playAt: room.playAt,
    startedAt: room.startedAt,
    singerStats: statsOf(room),
    summary: room.summary,
  };
}

/* ------------------------------------------------------------------ */
/* Serialisation (Durable Objects store the room as JSON)              */
/* ------------------------------------------------------------------ */

/** Room → plain JSON (Maps become objects). */
export function serializeRoom(room) {
  return {
    ...room,
    guests: Object.fromEntries(room.guests),
  };
}

/**
 * Plain JSON → room.
 * Accepts an object or the JSON string the Durable Object storage returns.
 */
export function deserializeRoom(data) {
  if (!data) return null;

  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }

  if (!data || typeof data !== 'object') return null;

  return {
    ...data,
    guests: new Map(Object.entries(data.guests || {})),
  };
}
