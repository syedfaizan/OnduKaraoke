/**
 * Ondu Karaoke — realtime transport.
 *
 * One app, two possible backends:
 *   • Cloudflare Worker (Durable Objects) — set VITE_REALTIME=ws
 *   • Node + Socket.IO server — the default
 *
 * Both expose the same tiny API, so the pages and components never change.
 */

import { createSocketIoTransport } from './socketioTransport.js';
import { createWsTransport } from './wsTransport.js';

const useWebSocketTransport = import.meta.env.VITE_REALTIME === 'ws';

export const realtimeMode = useWebSocketTransport ? 'workers' : 'socket.io';

export const socket = useWebSocketTransport
  ? createWsTransport()
  : createSocketIoTransport();
