/**
 * Ondu Karaoke — Cloudflare Worker smoke test.
 *
 * Boots `wrangler dev` locally and drives the real Durable Object over a
 * WebSocket: create a room → join → queue → fair rotation → playback →
 * reactions → sound cooldown → speed → skip → reconnect → night summary.
 *
 *   npm run smoke:worker
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const PORT = 8787;
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;

function check(label, condition, extra = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${extra ? ` → ${extra}` : ''}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* A tiny client for the room protocol                                  */
/* ------------------------------------------------------------------ */

class RoomClient {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.handlers = new Map();
    this.pending = new Map();
    this.messageId = 0;
    this.state = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${this.roomCode}`);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'ack') {
          const ack = this.pending.get(message.id);
          if (ack) {
            this.pending.delete(message.id);
            ack(message.payload);
          }
          return;
        }
        if (message.type === 'room:state') this.state = message.payload;
        (this.handlers.get(message.type) || []).forEach((fn) => fn(message.payload));
      });
    });
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
  }

  emit(type, payload = {}) {
    const id = (this.messageId += 1);
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, type, payload }));
    });
  }

  close() {
    this.ws?.close();
  }
}

/** Wait until the client's room state satisfies the predicate. */
async function waitForState(client, predicate, label = 'room state', timeout = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (client.state && predicate(client.state)) return client.state;
    await sleep(40);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const song = (videoId, title) => ({
  videoId,
  title,
  channel: 'Sing King Karaoke',
  thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
});

/* ------------------------------------------------------------------ */

async function waitForServer() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(400);
  }
  return false;
}

async function main() {
  console.log('Booting wrangler dev…');
  const wrangler = spawn(
    'npx',
    ['wrangler', 'dev', '--port', String(PORT), '--local', '--ip', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
  );

  const logs = [];
  wrangler.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  wrangler.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  try {
    if (!(await waitForServer())) {
      console.log(logs.join(''));
      throw new Error('wrangler dev did not come up');
    }

    console.log('\n· room + join');
    const created = await (await fetch(`${BASE}/api/rooms`, { method: 'POST' })).json();
    check('a room code is handed out', /^[A-Z]{4}$/.test(created.roomCode || ''), created.roomCode);
    check('a host token is handed out', Boolean(created.hostToken));

    const host = new RoomClient(created.roomCode);
    await host.connect();

    const hostAck = await host.emit('host:connect', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
      hostPassword: created.hostPassword, // the room claims it on first connect
    });
    check('the host claims the room', hostAck?.ok === true, JSON.stringify(hostAck));

    const asha = new RoomClient(created.roomCode);
    await asha.connect();
    const ashaJoin = await asha.emit('guest:join', { name: 'Asha' });
    check('a guest joins with a name', ashaJoin?.name === 'Asha', JSON.stringify(ashaJoin));
    check('the guest gets an id', Boolean(ashaJoin?.guestId));

    const ravi = new RoomClient(created.roomCode);
    await ravi.connect();
    const raviJoin = await ravi.emit('guest:join', { name: 'Ravi' });
    check('a second guest joins', raviJoin?.ok === true);

    console.log('\n· queue + fair rotation');
    await asha.emit('queue:add', { song: song('aaaaaaaaaaa', 'Asha song 1') });
    await asha.emit('queue:add', { song: song('bbbbbbbbbbb', 'Asha song 2') });
    await asha.emit('queue:add', { song: song('ccccccccccc', 'Asha song 3') });
    await ravi.emit('queue:add', { song: song('ddddddddddd', 'Ravi song 1') });

    const queued = await waitForState(host, (s) => s.queue.length === 4, 'a queue of 4');
    const order = queued.queue.map((item) => item.title);
    check(
      'singers rotate (snake draft)',
      order[0] === 'Asha song 1' && order[1] === 'Ravi song 1' && order[2] === 'Asha song 2',
      order.join(' | '),
    );
    check('the singer name is on every item', queued.queue.every((item) => item.singerName));

    console.log('\n· room state survives a reload from storage');
    const status = await (await fetch(`${BASE}/api/room-status?room=${created.roomCode}`)).json();
    check('the room reloads with its queue intact', status.queued === 4, JSON.stringify(status));
    check('the room reloads with its singers intact', status.singers === 2, JSON.stringify(status));
    check('the room reloads with a phase', Boolean(status.phase), JSON.stringify(status));

    console.log('\n· playback flow');
    await host.emit('party:start');
    const intermission = await waitForState(host, (s) => s.phase === 'intermission', 'the intermission');
    check('the party opens the intermission', intermission.phase === 'intermission');
    check('the next song is queued up', Boolean(intermission.current));

    await host.emit('song:started');
    const playing = await waitForState(host, (s) => s.phase === 'playing', 'the song to play');
    check('the song is playing', playing.phase === 'playing');
    check(
      'the singer is credited with the song',
      playing.singerStats.find((s) => s.name === 'Asha')?.songsSung === 1,
    );

    console.log('\n· reactions + sound cooldown');
    let burstEmoji = null;
    host.on('reaction:burst', (payload) => {
      burstEmoji = payload.emoji;
    });
    await ravi.emit('reaction:send', { emoji: '🔥' });
    await sleep(300);
    check('the reaction reaches the host screen', burstEmoji === '🔥', String(burstEmoji));

    const reacted = await waitForState(
      host,
      (s) => s.singerStats.some((x) => x.reactionsReceived > 0),
      'the reaction counters',
    );
    check(
      'reactions count for the current singer',
      reacted.singerStats.find((s) => s.name === 'Asha')?.reactionsReceived === 1,
    );
    check(
      'reactions count for the sender',
      reacted.singerStats.find((s) => s.name === 'Ravi')?.reactionsSent === 1,
    );

    let soundType = null;
    host.on('sound:play', (payload) => {
      soundType = payload.type;
    });
    const firstSound = await ravi.emit('sound:play', { type: 'applause' });
    await sleep(200);
    check('the first sound plays', firstSound?.ok === true);
    check('the host screen is told to play it', soundType === 'applause', String(soundType));

    const secondSound = await ravi.emit('sound:play', { type: 'airhorn' });
    check('the second sound is cooled down', secondSound?.ok === false, JSON.stringify(secondSound));

    console.log('\n· host controls');
    await host.emit('speed:set', { rate: 1.25 });
    const sped = await waitForState(host, (s) => s.speed === 1.25, 'the new speed');
    check('the speed is shared with the room', sped.speed === 1.25);

    const target = sped.queue[0].id;
    await host.emit('queue:move', { songId: target, dir: 1 });
    const moved = await waitForState(host, (s) => s.queue[0].id !== target, 'the reordered queue');
    check('the host can reorder the queue', moved.queue[0].id !== target);

    const raviRemove = await ravi.emit('queue:remove', { songId: moved.queue[0].id });
    check('guests cannot remove other people’s songs', raviRemove?.ok === false);

    console.log('\n· song end → next singer');
    const beforeEnd = host.state;
    const expectedNext = beforeEnd.queue[0]?.id;
    await host.emit('song:ended', { natural: true });
    const next = await waitForState(
      host,
      (s) => s.phase === 'intermission' && Boolean(s.current),
      'the next singer',
    );
    check('the next song takes the mic', next.current?.id === expectedNext, JSON.stringify(next.current));

    console.log('\n· host password + coming back');
    check(
      'the host gets a 6-digit password',
      /^\d{6}$/.test(created.hostPassword || ''),
      created.hostPassword,
    );

    const wrong = await host.emit('host:reclaim', {
      roomCode: created.roomCode,
      password: '000000',
    });
    check('a wrong password is rejected', wrong?.ok === false, JSON.stringify(wrong));

    // A brand new connection (a different device) reclaims the room.
    const comeback = new RoomClient(created.roomCode);
    await comeback.connect();
    const reclaimed = await comeback.emit('guest:join', {
      name: 'Host again',
      hostPassword: created.hostPassword,
    });
    check('the password gives you host rights', reclaimed?.isHost === true, JSON.stringify(reclaimed));

    const hostOnly = await asha.emit('song:skip');
    check('a plain guest still cannot skip', hostOnly?.ok === false, JSON.stringify(hostOnly));

    console.log('\n· reconnect keeps the name');
    ravi.close();
    const raviAgain = new RoomClient(created.roomCode);
    await raviAgain.connect();
    const rejoin = await raviAgain.emit('guest:join', {
      name: 'Someone else',
      guestId: raviJoin.guestId,
    });
    check('the phone rejoins with the same name', rejoin?.name === 'Ravi', rejoin?.name);
    check('the guest id is stable', rejoin?.guestId === raviJoin.guestId);

    console.log('\n· end of night');
    await host.emit('party:end');
    const ended = await waitForState(host, (s) => s.phase === 'ended', 'the night summary');
    const badges = (ended.summary?.badges || []).map((badge) => badge.title);
    check('the summary has badges', badges.includes('Most Songs'), badges.join(', '));
    check(
      'the summary has a leaderboard',
      (ended.summary?.leaderboard || []).length === 3,
      String((ended.summary?.leaderboard || []).length),
    );
    check('the totals are counted', ended.summary?.totals?.songs >= 1);

    host.close();
    asha.close();
    raviAgain.close();
    comeback.close();
  } finally {
    wrangler.kill('SIGTERM');
  }

  console.log('');
  if (failures === 0) {
    console.log('✅  All Worker smoke checks passed.');
  } else {
    console.log(`❌  ${failures} check(s) failed.`);
    process.exitCode = 1;
  }

  // The websocket clients keep the event loop alive — leave explicitly.
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n💥  Worker smoke test crashed:', err.message);
  process.exitCode = 1;
});
