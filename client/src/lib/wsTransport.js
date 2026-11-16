/**
 * Ondu Karaoke — Cloudflare Workers WebSocket transport.
 *
 * Talks to the Durable Object that owns the room. It mirrors the tiny slice
 * of the socket.io-client API the app uses:
 *
 *   socket.on(event, handler) / socket.off(event, handler)
 *   socket.emit(event, payload, ack)
 *   socket.connected
 *
 * Wire format:
 *   → { id, type, payload }
 *   ← { type, payload }              (broadcast)
 *   ← { id, type: 'ack', payload }   (answer to an emit)
 */

import { apiUrl } from './config.js';

export function createWsTransport() {
  const handlers = new Map();
  const pending = new Map();

  let ws = null;
  let roomCode = null;
  let messageId = 0;
  let reconnectDelay = 500;
  let closed = false;
  /** Set when the server could not be reached — used for the "connected" flag. */
  let failed = false;

  /* ---------------- helpers ---------------- */

  function emitLocal(event, ...args) {
    const list = handlers.get(event);
    if (!list) return;
    for (const handler of [...list]) {
      try {
        handler(...args);
      } catch (err) {
        console.error('[ws] handler failed', err);
      }
    }
  }

  function wsOrigin() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}`;
  }

  function whenOpen() {
    return new Promise((resolve, reject) => {
      if (!ws) return reject(new Error('no socket'));
      if (ws.readyState === WebSocket.OPEN) return resolve();
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('socket error')), { once: true });
    });
  }

  function connect(code) {
    roomCode = code;

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    closed = false;
    const socket = new WebSocket(`${wsOrigin()}/ws?room=${encodeURIComponent(code)}`);
    ws = socket;

    socket.addEventListener('open', () => {
      reconnectDelay = 500;
      failed = false;
      emitLocal('connect');
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === 'ack') {
        const ack = pending.get(message.id);
        if (ack) {
          pending.delete(message.id);
          ack(message.payload);
        }
        return;
      }

      emitLocal(message.type, message.payload);
    });

    socket.addEventListener('close', (event) => {
      emitLocal('disconnect');
      if (!closed) scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // The server is unreachable — let the UI show that.
      failed = true;
    });
  }

  function scheduleReconnect() {
    if (!roomCode) return;
    setTimeout(() => {
      if (!closed) connect(roomCode);
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 8000);
  }

  /** Send a command and (optionally) hand the answer to the caller. */
  function sendCommand(type, payload, ack) {
    const send = () => {
      const id = (messageId += 1);
      if (ack) pending.set(id, ack);
      try {
        ws.send(JSON.stringify({ id, type, payload }));
      } catch (err) {
        pending.delete(id);
        ack?.({ ok: false, error: 'Lost the connection — try again.' });
      }
    };

    if (ws && ws.readyState === WebSocket.OPEN) send();
    else whenOpen().then(send).catch(() => ack?.({ ok: false, error: 'Not connected.' }));
  }

  /* ---------------- public API ---------------- */

  const transport = {
    /**
     * True when the transport can be used. Before joining there is no socket
     * yet (the room code is unknown), so "not failed" counts as connected.
     */
    get connected() {
      return (Boolean(ws) && ws.readyState === WebSocket.OPEN) || !failed;
    },

    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(handler);
      return transport;
    },

    off(event, handler) {
      handlers.get(event)?.delete(handler);
      return transport;
    },

    emit(event, payload = {}, ack) {
      failed = false;

      // socket.io lets you emit without a payload: emit('event', ack).
      // Normalise that so both transports behave the same.
      if (typeof payload === 'function' && ack === undefined) {
        ack = payload;
        payload = {};
      }

      /* Creating a room needs an HTTP call first — the Worker hands out the
         code and the secret that turns a phone into the host remote. */
      if (event === 'host:create') {
        fetch(apiUrl('/api/rooms'), { method: 'POST' })
          .then((response) => response.json())
          .then(({ roomCode: code, hostToken, hostPassword }) => {
            connect(code);
            whenOpen()
              .then(() =>
                sendCommand(
                  'host:connect',
                  { roomCode: code, hostToken, hostPassword },
                  (result) => ack?.({ ...result, roomCode: code, hostToken, hostPassword }),
                ),
              )
              .catch(() => ack?.({ ok: false, error: 'Could not reach the party server.' }));
          })
          .catch(() =>
            ack?.({ ok: false, error: 'Could not create a room — is the backend running?' }),
          );
        return transport;
      }

      /* Joining (and rejoining after a refresh) opens the socket first. */
      if (event === 'guest:join' || event === 'host:connect' || event === 'host:reclaim') {
        const code = payload.roomCode;
        if (code) {
          if (!roomCode || roomCode !== code) {
            closed = true;
            ws?.close();
            connect(code);
          }
          whenOpen()
            .then(() => sendCommand(event, payload, ack))
            .catch(() => ack?.({ ok: false, error: 'Could not reach the party server.' }));
          return transport;
        }
      }

      sendCommand(event, payload, ack);
      return transport;
    },

    close() {
      closed = true;
      ws?.close();
    },
  };

  return transport;
}
