/**
 * Ondu Karaoke — backend entry point.
 *
 *  - Express  : tiny REST API (song search + LAN address discovery) and, in
 *               production, the built frontend.
 *  - Socket.IO: all real-time traffic (rooms, queue, reactions, playback).
 *
 * The YouTube API key only ever lives in this process.
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the project-root .env first (so `npm run dev` works from the root),
// then fall back to the current working directory.
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

import * as rooms from './rooms.js';
import { searchKaraoke, randomKaraokeSong, YouTubeError } from './youtube.js';

const PORT = Number(process.env.PORT || 3001);

const app = express();
const httpServer = http.createServer(app);

/**
 * Who may call this API?
 *
 * Same-origin (Express serves the frontend) needs nothing.
 * Split deployments (frontend on Vercel, backend on Render/Railway) set
 * CLIENT_ORIGIN to the frontend origin(s), comma separated.
 * Default is "*" so a quick test deployment just works.
 */
const allowedOrigins = (process.env.CLIENT_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  credentials: false,
};

app.use(cors(corsOptions));
app.use(express.json());
// Behind a platform proxy (Render, Railway, Fly…) trust X-Forwarded-*.
app.set('trust proxy', 1);

const io = new Server(httpServer, { cors: corsOptions });

/* ------------------------------------------------------------------ */
/* REST                                                                */
/* ------------------------------------------------------------------ */

/**
 * Song search. The phones talk to this endpoint (never to Google), so the
 * API key stays hidden and quota is spent from one place only.
 */
app.get('/api/search', async (req, res) => {
  try {
    const results = await searchKaraoke(req.query.q);
    res.json({ results });
  } catch (err) {
    if (err instanceof YouTubeError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[search] unexpected error:', err);
    res.status(500).json({ error: 'Search hit a snag — try again in a moment.' });
  }
});

/**
 * Best guess at this machine's LAN address. The host screen uses it to bake
 * a phone-reachable URL into the QR code when the TV browser is on localhost.
 */
app.get('/api/lan-url', (_req, res) => {
  res.json({ ip: firstLanIp() });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    rooms: [...rooms.allRooms()].length,
    youtube: process.env.YOUTUBE_API_KEY ? 'configured' : 'missing',
  });
});

/**
 * Best guess at this machine's LAN address. The host screen uses it to bake
 * a phone-reachable URL into the QR code when the TV browser is on localhost.
 */
function firstLanIp() {
  const interfaces = Object.entries(os.networkInterfaces());

  // Virtual adapters and VPNs are useless for guests on the local Wi-Fi.
  const skip = /^(lo|utun|bridge|vboxnet|vmnet|docker|tailscale|zeroshot|awdl|llw)/i;
  const prefer = /^(en|eth|wlan|wifi)/i;

  const candidates = interfaces
    .filter(([name]) => !skip.test(name))
    .map(([name, addresses]) => ({
      name,
      address: addresses?.find(
        (address) => (address.family === 'IPv4' || address.family === 4) && !address.internal,
      )?.address,
    }))
    .filter((entry) => entry.address);

  const preferred = candidates.find((entry) => prefer.test(entry.name));
  return (preferred || candidates[0])?.address || null;
}

/* ------------------------------------------------------------------ */
/* Production: serve the built frontend                                */
/* ------------------------------------------------------------------ */

const clientDist = path.join(__dirname, '../client/dist');
const hasClientBuild = fs.existsSync(path.join(clientDist, 'index.html'));

if (hasClientBuild) {
  app.use(express.static(clientDist));
  // SPA fallback (works with any Express version — no wildcard route syntax).
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

/* ------------------------------------------------------------------ */
/* Socket.IO                                                           */
/* ------------------------------------------------------------------ */

const fail = (ack, message) => {
  if (typeof ack === 'function') ack({ ok: false, error: message });
};

/** Positive acknowledgement for the simple commands. */
const done = (ack) => {
  if (typeof ack === 'function') ack({ ok: true });
};

function broadcastState(room) {
  io.to(room.code).emit('room:state', rooms.buildState(room));
}

/** Pick the next song and let everyone know (host starts the countdown). */
function runAdvance(room) {
  rooms.advance(room);
  rooms.touch(room);
  broadcastState(room);
}

/** Only the host screen (or the host's phone) may do this. */
function isHostControl(socket, room) {
  if (!room) return false;
  if (room.hostSocketId === socket.id) return true;
  return Boolean(rooms.guestForSocket(room, socket.id)?.isHost);
}

/** Clean up whatever a client sends us before it touches the queue. */
function sanitizeSong(song) {
  if (!song || typeof song !== 'object') return null;

  const videoId = String(song.videoId || '');
  if (!/^[\w-]{6,20}$/.test(videoId)) return null;

  return {
    videoId,
    title: String(song.title || 'Untitled').slice(0, 140),
    channel: String(song.channel || '').slice(0, 80),
    thumbnail: /^https?:\/\//.test(String(song.thumbnail || '')) ? String(song.thumbnail) : '',
  };
}

io.on('connection', (socket) => {
  /* ---------------- host ---------------- */

  // Works whether the client sends a payload, an ack, or both.
  socket.on('host:create', (...args) => {
    const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;

    const room = rooms.createRoom();
    room.hostSocketId = socket.id;
    socket.join(room.code);
    rooms.touch(room);

    if (ack) {
      ack({ ok: true, roomCode: room.code, hostToken: room.hostToken, state: rooms.buildState(room) });
    }
  });

  // Re-attach the host screen after a refresh (it keeps its token).
  socket.on('host:connect', ({ roomCode, hostToken } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room || room.hostToken !== hostToken) {
      fail(ack, 'That room no longer exists (the server may have restarted) — create a new one.');
      return;
    }

    room.hostSocketId = socket.id;
    socket.join(room.code);
    rooms.touch(room);

    if (typeof ack === 'function') ack({ ok: true, state: rooms.buildState(room) });
    broadcastState(room); // tell the phones the host screen is back
  });

  /* ---------------- guests ---------------- */

  socket.on('guest:join', ({ roomCode, name, guestId, hostToken } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room) {
      fail(ack, 'Room not found — double-check the 4-letter code.');
      return;
    }

    const returning = guestId ? room.guests.get(guestId) : null;
    if (room.phase === 'ended' && !returning) {
      fail(ack, 'This party has ended — ask the host to start a new one.');
      return;
    }

    const cleanName = String(name || '').trim().slice(0, 24) || 'Guest';
    const isHost = Boolean(hostToken && hostToken === room.hostToken);
    const guest = rooms.upsertGuest(room, { guestId, name: cleanName, isHost, socketId: socket.id });

    socket.join(room.code);
    rooms.touch(room);

    if (typeof ack === 'function') {
      ack({
        ok: true,
        guestId: guest.id,
        name: guest.name,
        isHost: guest.isHost,
        state: rooms.buildState(room),
      });
    }
    broadcastState(room);
  });

  /* ---------------- the queue ---------------- */

  socket.on('queue:add', ({ roomCode, song } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room) return fail(ack, 'Room not found.');
    if (room.phase === 'ended') return fail(ack, 'The party has ended 🎉');

    const guest = rooms.guestForSocket(room, socket.id);
    if (!guest) return fail(ack, 'Join the room first!');

    const clean = sanitizeSong(song);
    if (!clean) return fail(ack, 'That song looked broken — try searching again.');

    const item = rooms.addSong(room, guest, clean);
    rooms.touch(room);

    // Party is running but the queue was empty → start the next song right away.
    if (room.partyStarted && room.phase === 'idle') runAdvance(room);
    else broadcastState(room);

    if (typeof ack === 'function') ack({ ok: true, song: item });
  });

  // "Random" tab — the server picks a popular song in the chosen language.
  socket.on('random:add', ({ roomCode, language } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room) return fail(ack, 'Room not found.');
    if (room.phase === 'ended') return fail(ack, 'The party has ended 🎉');

    const guest = rooms.guestForSocket(room, socket.id);
    if (!guest) return fail(ack, 'Join the room first!');

    randomKaraokeSong(language)
      .then((song) => {
        const item = rooms.addSong(room, guest, song);
        rooms.touch(room);
        if (room.partyStarted && room.phase === 'idle') runAdvance(room);
        else broadcastState(room);
        if (typeof ack === 'function') ack({ ok: true, song: item });
      })
      .catch((err) => {
        if (typeof ack === 'function') {
          ack({ ok: false, error: err instanceof YouTubeError ? err.message : 'Random pick failed — try again.' });
        }
      });
  });

  socket.on('queue:remove', ({ roomCode, songId } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room) return fail(ack, 'Room not found.');

    const song = room.queue.find((item) => item.id === songId);
    if (!song) return fail(ack, 'That song is already gone.');

    const guest = rooms.guestForSocket(room, socket.id);
    const host = isHostControl(socket, room);
    if (!host && song.singerId !== guest?.id) {
      return fail(ack, 'You can only remove your own songs.');
    }

    rooms.removeSong(room, songId);
    rooms.touch(room);
    broadcastState(room);
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('queue:move', ({ roomCode, songId, dir } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room) return fail(ack, 'Room not found.');
    if (!isHostControl(socket, room)) return fail(ack, 'Host controls only.');

    if (!rooms.moveSong(room, songId, dir === -1 ? -1 : 1)) {
      return fail(ack, 'That song is already gone.');
    }

    rooms.touch(room);
    broadcastState(room);
    done(ack);
  });

  /* ---------------- playback ---------------- */

  socket.on('party:start', ({ roomCode } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room || !isHostControl(socket, room)) return fail(ack, 'Host controls only.');

    room.partyStarted = true;
    room.summary = null;
    rooms.touch(room);

    if (room.phase === 'idle') runAdvance(room);
    else broadcastState(room);
    done(ack);
  });

  // The host screen pressed play after the intermission countdown.
  socket.on('song:started', ({ roomCode } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room || !isHostControl(socket, room)) return fail(ack, 'Host controls only.');
    if (room.phase !== 'intermission') return fail(ack, 'No song is waiting to start.');

    rooms.startSong(room);
    rooms.touch(room);
    broadcastState(room);
    done(ack);
  });

  // The song is over (natural end or an embed that refused to play).
  socket.on('song:ended', ({ roomCode, natural } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room || !isHostControl(socket, room)) return fail(ack, 'Host controls only.');

    rooms.finishSong(room, { natural: Boolean(natural) });
    runAdvance(room);
    done(ack);
  });

  // Host pressed "skip".
  socket.on('song:skip', ({ roomCode } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room || !isHostControl(socket, room)) return fail(ack, 'Host controls only.');
    if (room.phase !== 'playing' && room.phase !== 'intermission') {
      return fail(ack, 'Nothing is playing right now.');
    }

    rooms.finishSong(room, { natural: false });
    runAdvance(room);
    done(ack);
  });

  socket.on('speed:set', ({ roomCode, rate } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room || !isHostControl(socket, room)) return fail(ack, 'Host controls only.');

    const allowed = [0.75, 0.9, 1, 1.1, 1.25];
    if (!allowed.includes(rate)) return;

    room.speed = rate;
    rooms.touch(room);
    broadcastState(room);
    done(ack);
  });

  /* ---------------- reactions & sounds ---------------- */

  socket.on('reaction:send', ({ roomCode, emoji } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room || room.phase === 'ended') return fail(ack, 'The party is over 🎉');
    if (!rooms.guestForSocket(room, socket.id)) return fail(ack, 'Join the room first!');

    rooms.applyReaction(room, rooms.guestForSocket(room, socket.id).id);
    rooms.touch(room);

    io.to(room.code).emit('reaction:burst', { emoji: String(emoji || '❤️').slice(0, 8) });
    broadcastState(room); // keeps the leaderboard and live counters fresh
    done(ack);
  });

  socket.on('sound:play', ({ roomCode, type } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room) return fail(ack, 'Room not found.');
    if (room.phase === 'ended') return fail(ack, 'The party has over 🎉');

    const guest = rooms.guestForSocket(room, socket.id);
    if (!guest) return fail(ack, 'Join the room first!');

    const cooldown = rooms.canPlaySound(room, guest);
    if (!cooldown.ok) {
      return fail(ack, `Easy there, DJ! Try again in ${Math.ceil(cooldown.wait / 1000)}s 😉`);
    }

    rooms.touch(room);
    io.to(room.code).emit('sound:play', { type: type === 'airhorn' ? 'airhorn' : 'applause' });
    if (typeof ack === 'function') ack({ ok: true });
  });

  /* ---------------- end of night ---------------- */

  socket.on('party:end', ({ roomCode } = {}, ack) => {
    const room = rooms.getRoom(roomCode);
    if (!room || !isHostControl(socket, room)) return fail(ack, 'Host controls only.');

    room.phase = 'ended';
    room.summary = rooms.computeSummary(room);
    rooms.touch(room);
    broadcastState(room);
    done(ack);
  });

  /* ---------------- disconnect ---------------- */

  socket.on('disconnect', () => {
    // Guests stay in the room (their stats and name survive a refresh);
    // we only unbind the socket.
    for (const room of rooms.allRooms()) {
      if (room.hostSocketId === socket.id) room.hostSocketId = null;
      const guest = rooms.guestForSocket(room, socket.id);
      if (guest) guest.socketId = null;
    }
  });
});

/* ------------------------------------------------------------------ */
/* Housekeeping & boot                                                */
/* ------------------------------------------------------------------ */

// Rooms live in memory only — reap the ones nobody touched for 12 hours.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.allRooms()) {
    if (now - room.lastActivity > 12 * 60 * 60 * 1000) {
      rooms.deleteRoom(room.code);
      console.log('[rooms] reaped idle room', room.code);
    }
  }
}, 10 * 60 * 1000).unref();

process.on('unhandledRejection', (err) => console.error('[unhandled]', err));

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`  ❌  Port ${PORT} is already in use — another Ondu server is running.`);
    console.error('      Stop it first:  lsof -ti tcp:' + PORT + ' | xargs kill');
    console.error('      …or pick another port in .env (PORT=3002).');
    console.error('      NOTE: an old process also keeps the OLD .env — restart it after');
    console.error('            changing your YouTube key.');
    console.error('');
    process.exit(1);
  }
  console.error('[server]', err);
  process.exit(1);
});

httpServer.listen(PORT, () => {
  const hasKey = Boolean(process.env.YOUTUBE_API_KEY);
  console.log('');
  console.log('  🎤  Ondu Karaoke backend is up');
  console.log(`      http://localhost:${PORT}`);
  console.log(
    hasClientBuild
      ? '      serving the built frontend from client/dist'
      : '      frontend not built yet — run "npm run build" (or use the Vite dev server)',
  );
  console.log(
    hasKey
      ? '      YouTube search: ✅ key loaded'
      : '      YouTube search: ❌ no YOUTUBE_API_KEY — set it in .env and restart',
  );
  console.log('');
});
