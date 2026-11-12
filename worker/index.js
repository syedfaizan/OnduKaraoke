/**
 * Ondu Karaoke — Cloudflare Worker (the whole app in one deployment).
 *
 *   /            → the React app (Static Assets, SPA fallback)
 *   /host        → the TV screen
 *   /join/CODE   → the phone controller
 *   /api/*       → song search, health, room creation
 *   /ws?room=CODE→ the WebSocket for one room (handled by a Durable Object)
 *
 * The YouTube key stays in a Worker secret and is never sent to a browser.
 */

import { Room } from './room.js';
import { searchKaraoke } from './youtube.js';
import { randomRoomCode } from '../shared/room.js';
import { YouTubeError } from '../shared/youtube.js';

export { Room };

/** Codes handed out recently (per isolate) so two parties rarely collide. */
const issuedCodes = new Set();

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith('/api/')) {
        return await handleApi(request, env, url);
      }

      if (url.pathname === '/ws') {
        return await handleSocket(request, env, url);
      }

      // Everything else is the React app (Static Assets handles the SPA
      // fallback for /host, /join/:code and friends).
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('[worker]', err);
      return new Response('Something went wrong 🎤', { status: 500 });
    }
  },
};

/* ------------------------------------------------------------------ */
/* Realtime                                                            */
/* ------------------------------------------------------------------ */

async function handleSocket(request, env, url) {
  const roomCode = String(url.searchParams.get('room') || '')
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{4}$/.test(roomCode)) {
    return new Response('Bad room code', { status: 400 });
  }

  // One Durable Object per room.
  const id = env.ROOMS.idFromName(roomCode);
  const stub = env.ROOMS.get(id);

  // Forward the upgrade request to the room object.
  return stub.fetch(request);
}

/* ------------------------------------------------------------------ */
/* REST                                                                */
/* ------------------------------------------------------------------ */

async function handleApi(request, env, url) {
  const path = url.pathname.replace('/api', '');

  /* --- create a room --- */
  if (path === '/rooms' && request.method === 'POST') {
    const code = await createRoomCode(env);
    const hostToken = crypto.randomUUID();

    return Response.json({ roomCode: code, hostToken });
  }

  /* --- song search --- */
  if (path === '/search') {
    try {
      const results = await searchKaraoke(url.searchParams.get('q'), env);
      return Response.json({ results });
    } catch (err) {
      if (err instanceof YouTubeError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      console.error('[search]', err);
      return Response.json({ error: 'Search hit a snag — try again in a moment.' }, { status: 500 });
    }
  }

  /* --- health --- */
  if (path === '/health') {
    return Response.json({
      ok: true,
      youtube: env.YOUTUBE_API_KEY ? 'configured' : 'missing',
      runtime: 'cloudflare-worker',
    });
  }

  /* --- room status (also re-reads the room from storage) --- */
  if (path === '/room-status') {
    const code = String(url.searchParams.get('room') || '')
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) {
      return Response.json({ error: 'Bad room code' }, { status: 400 });
    }
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch('https://room/status');
  }

  /* --- LAN address (only useful when running locally) --- */
  if (path === '/lan-url') {
    return Response.json({ ip: null });
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
}

/**
 * Pick a room code that is not taken yet.
 * The Durable Object is asked whether it already has a host.
 */
async function createRoomCode(env) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomRoomCode();
    if (issuedCodes.has(code)) continue;

    const id = env.ROOMS.idFromName(code);
    const stub = env.ROOMS.get(id);

    let taken = false;
    try {
      const status = await stub.fetch('https://room/status');
      if (status.ok) {
        const info = await status.json();
        taken = Boolean(info.hasHost);
      }
    } catch {
      // Can't tell → assume it is free.
    }

    if (!taken) {
      issuedCodes.add(code);
      // Keep the set small.
      if (issuedCodes.size > 500) issuedCodes.delete(issuedCodes.values().next().value);
      return code;
    }
  }

  return randomRoomCode();
}
