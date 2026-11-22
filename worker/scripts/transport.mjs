/**
 * Regression test for the browser WebSocket transport.
 *
 * The host reuses one transport for its whole session, so "End party" →
 * "Start a new party" must replace the socket. Before this test existed the
 * transport kept the old room's socket and sent the new room's host:connect to
 * the old Durable Object, which rejected it ("Could not create a room").
 *
 * Run: npm run smoke:transport
 */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

/* ------------------------------------------------------------------ */
/* Load the real transport with its Vite-only config import stubbed.   */
/* ------------------------------------------------------------------ */

const url = new URL('../../client/src/lib/wsTransport.js', import.meta.url);
let source = readFileSync(url, 'utf8');

const importLine = "import { apiUrl } from './config.js';";
assert.ok(source.includes(importLine), 'wsTransport.js changed its config import — update this test');

source = source.replace(importLine, 'const apiUrl = (path) => path;');

const { createWsTransport } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

/* ------------------------------------------------------------------ */
/* A tiny fake WebSocket + window.                                     */
/* ------------------------------------------------------------------ */

class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(socketUrl) {
    this.url = socketUrl;
    this.readyState = FakeSocket.CONNECTING;
    this.sent = [];
    this.listeners = new Map();
    FakeSocket.instances.push(this);
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  fire(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) handler(event);
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.fire('open');
  }

  reply(payload) {
    this.fire('message', { data: JSON.stringify(payload) });
  }

  send(raw) {
    this.sent.push(JSON.parse(raw));
  }

  close() {
    this.readyState = FakeSocket.CLOSED;
    this.fire('close', {});
  }
}

let nextRoom = 'AAAA';
const rooms = {
  AAAA: { hostToken: 'token-a', hostPassword: '111111' },
  BBBB: { hostToken: 'token-b', hostPassword: '222222' },
};

globalThis.WebSocket = FakeSocket;
globalThis.window = {
  location: { protocol: 'https:', host: 'party.test' },
  dispatchEvent() {},
};
globalThis.fetch = async () => ({
  json: async () => ({ roomCode: nextRoom, ...rooms[nextRoom] }),
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/* ------------------------------------------------------------------ */
/* The test                                                            */
/* ------------------------------------------------------------------ */

const transport = createWsTransport();
let disconnects = 0;
transport.on('disconnect', () => {
  disconnects += 1;
});

const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/** Create a room and answer the host:connect handshake on the newest socket. */
async function createParty() {
  const ack = new Promise((resolve) => transport.emit('host:create', resolve));
  await tick();
  await tick();

  const socket = FakeSocket.instances.at(-1);
  socket.open();
  await tick();

  const handshake = socket.sent.at(-1);
  assert.equal(handshake.type, 'host:connect', 'expected a host:connect handshake');

  socket.reply({ id: handshake.id, type: 'ack', payload: { ok: true, isHost: true, state: { roomCode: nextRoom } } });
  await tick();

  return { ack: await ack, socket, handshake };
}

/* First party. */
const first = await createParty();
check('first party opens a socket for its own room', first.socket.url.endsWith('/ws?room=AAAA'), first.socket.url);
check('first party handshake carries the room code', first.handshake.payload.roomCode === 'AAAA');
check('first party ack is ok', first.ack?.ok === true && first.ack.roomCode === 'AAAA');

/* Second party — the bug: no new socket, handshake went to the old room. */
nextRoom = 'BBBB';
const second = await createParty();
check(
  'second party opens a NEW socket for the new room',
  FakeSocket.instances.length === 2 && second.socket.url.endsWith('/ws?room=BBBB'),
  `${FakeSocket.instances.length} socket(s), newest ${second.socket.url}`,
);
check('the old room socket was closed', first.socket.readyState === FakeSocket.CLOSED);
check('the handshake did not go to the old room', second.handshake.payload.roomCode === 'BBBB');
check('second party ack is ok', second.ack?.ok === true && second.ack.roomCode === 'BBBB');
check('switching rooms is not reported as a disconnect', disconnects === 0, `${disconnects} disconnect event(s)`);

/* Switching rooms twice in a row keeps working. */
nextRoom = 'AAAA';
const third = await createParty();
check(
  'third party switches again',
  FakeSocket.instances.length === 3 && third.socket.url.endsWith('/ws?room=AAAA') && third.ack?.ok === true,
);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} transport checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
