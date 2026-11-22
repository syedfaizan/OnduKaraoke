/**
 * Ondu Karaoke — Durable Object: one room.
 *
 * Every room code maps to its own Durable Object, which:
 *   • holds the WebSocket connections (TV + phones),
 *   • owns the room state (queue, guests, stats, phase),
 *   • broadcasts one `room:state` snapshot after every change.
 *
 * The state is written to SQLite storage on every change, so a room survives
 * the object being evicted from memory (which Cloudflare may do at any time).
 * The sockets use the WebSocket Hibernation API, so an idle room costs
 * nothing while the connections stay alive.
 *
 * Per-connection details (who is this socket?) live in the WebSocket
 * *attachment* — the runtime keeps it across hibernation, so we never depend
 * on `ws.id` (which is not available in every runtime).
 *
 * The room *rules* live in shared/room.js + shared/commands.js — the same
 * code the Node/Socket.IO server uses.
 */

import {
  buildState,
  createRoomState,
  deserializeRoom,
  serializeRoom,
} from '../shared/room.js';
import { handleCommand } from '../shared/commands.js';
import { randomKaraokeSong } from './youtube.js';

const STATE_KEY = 'room';

/** Read the connection details the runtime keeps for us. */
function attachmentOf(ws) {
  try {
    return ws.deserializeAttachment() || {};
  } catch {
    return {};
  }
}

/** Store the connection details. */
function setAttachment(ws, data) {
  try {
    ws.serializeAttachment(data);
  } catch {
    // ignore
  }
}

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    /** @type {object|null} the room state (loaded lazily) */
    this.room = null;
  }

  /* ---------------------------------------------------------------- */
  /* HTTP / WebSocket upgrade                                          */
  /* ---------------------------------------------------------------- */

  async fetch(request) {
    const url = new URL(request.url);

    // A tiny endpoint so the Worker can check whether this code is free.
    // It also re-reads the room from storage, which doubles as a check that
    // the persisted state round-trips correctly.
    if (url.pathname === '/status') {
      this.room = null; // force a fresh read from storage
      await this.load();
      return Response.json({
        code: this.room.code,
        hasHost: Boolean(this.room.hostToken),
        phase: this.room.phase,
        queued: this.room.queue.length,
        singers: this.room.guests.size,
      });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Hibernation API: the connection survives the object going to sleep.
    this.ctx.acceptWebSocket(server);

    // Who is this socket? (kept for us by the runtime)
    setAttachment(server, {
      id: crypto.randomUUID(),
      guestId: null,
      name: null,
      isHost: false,
    });

    await this.load();

    // Tell the newcomer where things stand.
    this.send(server, { type: 'room:state', payload: buildState(this.room) });

    return new Response(null, { status: 101, webSocket: client });
  }

  /* ---------------------------------------------------------------- */
  /* Hibernation handlers                                              */
  /* ---------------------------------------------------------------- */

  async webSocketMessage(ws, message) {
    let command;
    try {
      command = JSON.parse(typeof message === 'string' ? message : message.toString());
    } catch {
      return;
    }

    const { id, type, payload = {} } = command || {};
    if (!type) return;

    await this.load();

    const attachment = attachmentOf(ws);

    const actor = {
      socketId: attachment.id || null,
      guest: attachment.guestId ? this.room.guests.get(attachment.guestId) : null,
      isHost: Boolean(attachment.isHost) || this.room.hostSocketId === attachment.id,
    };

    const api = {
      buildState: () => buildState(this.room),
      randomSong: (language) => randomKaraokeSong(language, this.env),
      emitReaction: (emoji) => this.broadcast({ type: 'reaction:burst', payload: { emoji } }),
      touch: () => {
        this.room.lastActivity = Date.now();
      },
    };

    const ack = await handleCommand({ room: this.room, type, payload, actor, api });

    // Remember who just joined so the next messages are attributed.
    if (type === 'guest:join' && ack?.ok) {
      setAttachment(ws, {
        ...attachment,
        guestId: ack.guestId,
        name: ack.name,
        isHost: Boolean(ack.isHost),
      });
      if (ack.isHost && !this.room.hostSocketId) this.room.hostSocketId = attachment.id || null;
    }
    if (type === 'host:connect' && ack?.ok) {
      setAttachment(ws, { ...attachment, isHost: true });
      this.room.hostSocketId = attachment.id || null;
    }
    if (type === 'host:reclaim' && ack?.ok) {
      // The host came back with the 6-digit password.
      setAttachment(ws, { ...attachment, isHost: true });
      this.room.hostSocketId = attachment.id || null;
    }

    await this.persist();

    // Everyone gets the new state.
    this.broadcast({ type: 'room:state', payload: buildState(this.room) });

    this.send(ws, { id, type: 'ack', payload: ack });
  }

  async webSocketClose(ws) {
    await this.load();

    const attachment = attachmentOf(ws);

    // The host screen left → somebody else can claim the room later.
    if (this.room.hostSocketId && this.room.hostSocketId === attachment.id) {
      this.room.hostSocketId = null;
    }

    if (attachment.guestId) {
      const guest = this.room.guests.get(attachment.guestId);
      if (guest && guest.socketId === attachment.id) guest.socketId = null; // keep the guest (name + stats) for tonight
    }

    await this.persist();
    this.broadcast({ type: 'room:state', payload: buildState(this.room) });
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  async load() {
    if (this.room) return this.room;

    // The storage hands back the JSON string we wrote.
    const stored = await this.ctx.storage.get(STATE_KEY);
    this.room = deserializeRoom(stored) || createRoomState(this.ctx.id.name || 'XXXX');
    return this.room;
  }

  async persist() {
    if (!this.room) return;
    // Stored as a plain object (the SQLite storage API JSON-encodes it).
    await this.ctx.storage.put(STATE_KEY, serializeRoom(this.room));
  }

  send(ws, message) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Socket already gone — the close handler will clean up.
    }
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // ignore
      }
    }
  }
}
