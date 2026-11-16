/**
 * Ondu Karaoke — in-memory room store for the Node/Socket.IO server.
 *
 * The room *rules* live in shared/room.js (the same code the Cloudflare
 * Durable Object uses) — this file only adds the Map that keeps the rooms
 * in one process.
 */

import { randomUUID } from 'node:crypto';
import {
  INTERMISSION_MS,
  SOUND_COOLDOWN_MS,
  buildState,
  canPlaySound,
  computeSummary,
  createRoomState,
  finishSong,
  randomHostPassword,
  randomRoomCode,
  removeSong,
  moveSong,
  addSong,
  advance,
  applyReaction,
  startSong,
  statsOf,
  upsertGuest,
  guestForSocket,
} from '../shared/room.js';

export {
  INTERMISSION_MS,
  SOUND_COOLDOWN_MS,
  buildState,
  canPlaySound,
  computeSummary,
  finishSong,
  removeSong,
  moveSong,
  addSong,
  advance,
  applyReaction,
  startSong,
  statsOf,
  upsertGuest,
  guestForSocket,
};

/** roomCode -> room */
const rooms = new Map();

export function createRoom() {
  // The Node server mints the host secrets up front and hands them to the host
  // screen with the room (the Durable Object variant claims them on connect).
  const room = createRoomState(randomRoomCode(), {
    hostToken: randomUUID(),
    hostPassword: randomHostPassword(),
  });
  rooms.set(room.code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get(String(code || '').trim().toUpperCase());
}

export function allRooms() {
  return rooms.values();
}

export function deleteRoom(code) {
  rooms.delete(code);
}

export function touch(room) {
  room.lastActivity = Date.now();
}
