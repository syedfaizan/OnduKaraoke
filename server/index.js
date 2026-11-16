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
import { handleCommand } from '../shared/commands.js';
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

/**
 * Run one client command against a room and answer with the acknowledgement.
 */
async function runCommand(socket, type, payload = {}, ack) {
  const room = rooms.getRoom(payload.roomCode);
  if (!room) return fail(ack, 'Room not found.');

  const guest = rooms.guestForSocket(room, socket.id);
  const actor = {
    socketId: socket.id,
    guest,
    isHost: room.hostSocketId === socket.id || Boolean(guest?.isHost),
  };

  const api = {
    buildState: () => rooms.buildState(room),
    randomSong: (language) => randomKaraokeSong(language),
    emitReaction: (emoji) => io.to(room.code).emit('reaction:burst', { emoji }),
    emitSound: (soundType) => io.to(room.code).emit('sound:play', { type: soundType }),
    touch: () => rooms.touch(room),
  };

  const result = await handleCommand({ room, type, payload, actor, api });

  // A joining/reclaiming host must be in the room's socket channel.
  if (result?.ok && (type === 'host:connect' || type === 'host:reclaim' || type === 'guest:join')) {
    socket.join(room.code);
  }

  rooms.touch(room);
  broadcastState(room); // everyone gets the new state

  if (typeof ack === 'function') ack(result);
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
      ack({
        ok: true,
        roomCode: room.code,
        hostToken: room.hostToken,
        hostPassword: room.hostPassword, // the 6-digit password the host can type to come back
        state: rooms.buildState(room),
      });
    }
  });

  /* ---------------- every other command ---------------- */

  /*
   * All client commands run through the shared command handler, so the Node
   * server and the Cloudflare Durable Object behave exactly the same
   * (queue rotation, permissions, scoring, cooldown…).
   */
  const COMMANDS = [
    'host:connect',
    'host:reclaim',
    'guest:join',
    'queue:add',
    'random:add',
    'queue:remove',
    'queue:move',
    'party:start',
    'song:started',
    'song:ended',
    'song:skip',
    'speed:set',
    'reaction:send',
    'sound:play',
    'party:end',
  ];

  for (const type of COMMANDS) {
    socket.on(type, (payload = {}, ack) => {
      runCommand(socket, type, payload, ack).catch((err) => {
        console.error(`[${type}]`, err);
        fail(ack, 'Something went wrong — try again.');
      });
    });
  }

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
