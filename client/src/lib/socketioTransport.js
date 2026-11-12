/**
 * Ondu Karaoke — Socket.IO transport.
 *
 * Used when the backend runs as the Node/Socket.IO server (local dev, or a
 * Render/Railway deployment). The API mirrors socket.io-client so the rest of
 * the app does not care which transport is in use.
 */

import { io } from 'socket.io-client';
import { socketUrl } from './config.js';

export function createSocketIoTransport() {
  return io(socketUrl(), {
    reconnectionDelayMax: 4000,
    reconnectionAttempts: Infinity,
  });
}
