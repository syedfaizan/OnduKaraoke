/**
 * Ondu Karaoke — backend smoke test.
 *
 * Boots the real server on a spare port and exercises the whole room flow
 * over websockets: create → join → queue → fair rotation → playback →
 * reactions → sound cooldown → speed → skip → end party → summary.
 *
 *   npm run smoke      (from the project root, or: npm --prefix server run smoke)
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3199;
const URL = `http://localhost:${PORT}`;

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

/** Latest room state per socket (the server broadcasts it on every change). */
const latestState = new Map();

function track(socket) {
  socket.on('room:state', (state) => latestState.set(socket, state));
}

/** Wait until the tracked state satisfies the predicate. */
async function waitFor(socket, predicate, label = 'room state', timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = latestState.get(socket);
    if (state && predicate(state)) return state;
    await sleep(30);
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** Promise wrapper around a one-off socket event. */
function once(socket, event, predicate = () => true, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for "${event}"`));
    }, timeout);

    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }

    socket.on(event, handler);
  });
}

/** Emit and wait for the acknowledgement. */
function ask(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ack for "${event}"`)), 5000);
    socket.emit(event, payload, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${URL}/api/health`);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  return false;
}

const song = (videoId, title) => ({
  videoId,
  title,
  channel: 'Sing King Karaoke',
  thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
});

async function main() {
  console.log('Booting the backend…');
  const server = spawn(process.execPath, ['index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });

  try {
    if (!(await waitForHealth())) throw new Error('server did not come up');

    const host = io(URL);
    const asha = io(URL);
    const ravi = io(URL);
    [host, asha, ravi].forEach(track);

    await Promise.all([once(host, 'connect'), once(asha, 'connect'), once(ravi, 'connect')]);

    console.log('\n· room + join');
    const created = await ask(host, 'host:create', {});
    check('host creates a room', Boolean(created?.roomCode), JSON.stringify(created));
    check('room code is 4 letters', /^[A-Z]{4}$/.test(created.roomCode || ''), created.roomCode);

    const ashaJoin = await ask(asha, 'guest:join', { roomCode: created.roomCode, name: 'Asha' });
    const raviJoin = await ask(ravi, 'guest:join', { roomCode: created.roomCode, name: 'Ravi' });
    check('guests join with a name', ashaJoin?.name === 'Asha' && raviJoin?.name === 'Ravi');
    check('guests get a guestId', Boolean(ashaJoin?.guestId) && Boolean(raviJoin?.guestId));

    console.log('\n· queue + fair rotation');
    await ask(asha, 'queue:add', { roomCode: created.roomCode, song: song('aaaaaaaaaaa', 'Asha song 1') });
    await ask(asha, 'queue:add', { roomCode: created.roomCode, song: song('bbbbbbbbbbb', 'Asha song 2') });
    await ask(asha, 'queue:add', { roomCode: created.roomCode, song: song('ccccccccccc', 'Asha song 3') });
    await ask(ravi, 'queue:add', { roomCode: created.roomCode, song: song('ddddddddddd', 'Ravi song 1') });

    const state = await waitFor(host, (s) => s.queue.length === 4, 'a queue of 4');
    const order = state.queue.map((item) => item.title);
    check(
      'singers rotate (snake draft)',
      order[0] === 'Asha song 1' && order[1] === 'Ravi song 1' && order[2] === 'Asha song 2',
      order.join(' | '),
    );
    check('singer name is stored on every item', state.queue.every((item) => item.singerName));

    console.log('\n· playback flow');
    await ask(host, 'party:start', { roomCode: created.roomCode });
    const intermission = await waitFor(host, (s) => s.phase === 'intermission', 'the intermission');
    check('party start opens the intermission', intermission.phase === 'intermission');
    check(
      'intermission counts down ~5s',
      intermission.playAt - Date.now() > 2000,
      `${intermission.playAt - Date.now()}ms`,
    );
    check('the next song is queued up', Boolean(intermission.current));

    await ask(host, 'song:started', { roomCode: created.roomCode });
    const playing = await waitFor(host, (s) => s.phase === 'playing', 'the song to play');
    check('song is playing', playing.phase === 'playing');
    check(
      'the singer is credited with the song',
      playing.singerStats.find((s) => s.name === 'Asha')?.songsSung === 1,
    );

    console.log('\n· reactions + sound cooldown');
    const burst = once(host, 'reaction:burst');
    await ask(ravi, 'reaction:send', { roomCode: created.roomCode, emoji: '🔥' });
    check('reaction reaches the host screen', (await burst).emoji === '🔥');

    const reacted = await waitFor(
      host,
      (s) => s.singerStats.some((x) => x.reactionsReceived > 0),
      'reaction counters',
    );
    check(
      'reactions count for the current singer',
      reacted.singerStats.find((s) => s.name === 'Asha')?.reactionsReceived === 1,
    );
    check(
      'reactions count for the sender',
      reacted.singerStats.find((s) => s.name === 'Ravi')?.reactionsSent === 1,
    );

    const firstSound = await ask(ravi, 'sound:play', { roomCode: created.roomCode, type: 'applause' });
    const secondSound = await ask(ravi, 'sound:play', { roomCode: created.roomCode, type: 'airhorn' });
    check('first sound plays', firstSound?.ok === true);
    check('second sound is cooled down', secondSound?.ok === false, JSON.stringify(secondSound));

    console.log('\n· host controls');
    await ask(host, 'speed:set', { roomCode: created.roomCode, rate: 1.25 });
    const sped = await waitFor(host, (s) => s.speed === 1.25, 'the new speed');
    check('speed is shared with the room', sped.speed === 1.25);

    const target = sped.queue[0].id;
    await ask(host, 'queue:move', { roomCode: created.roomCode, songId: target, dir: 1 });
    const moved = await waitFor(host, (s) => s.queue[0].id !== target, 'the reordered queue');
    check('host can reorder the queue', moved.queue[0].id !== target);

    const raviRemove = await ask(ravi, 'queue:remove', {
      roomCode: created.roomCode,
      songId: moved.queue[0].id,
    });
    check('guests cannot remove other people’s songs', raviRemove?.ok === false);

    console.log('\n· song end → next singer');
    // Whatever is first in the queue has to be the next one on the mic.
    const beforeEnd = latestState.get(host);
    const expectedNext = beforeEnd.queue[0]?.id;
    await ask(host, 'song:ended', { roomCode: created.roomCode, natural: true });
    const next = await waitFor(
      host,
      (s) => s.phase === 'intermission' && Boolean(s.current),
      'the next singer',
    );
    check(
      'the next song in the queue takes the mic',
      next.current?.id === expectedNext,
      JSON.stringify(next.current),
    );

    for (let round = 0; round < 3; round += 1) {
      const before = latestState.get(host);
      const expected = before.queue[0]?.id;

      await ask(host, 'song:skip', { roomCode: created.roomCode });

      if (!expected) {
        const idle = await waitFor(host, (s) => s.phase === 'idle', 'an idle party');
        check('an empty queue idles the party', idle.phase === 'idle');
        break;
      }

      const after = await waitFor(
        host,
        (s) => s.phase === 'intermission' && s.current?.id === expected,
        'the singer after the skip',
      );
      check(
        `skipping moves on to the next singer (round ${round + 1})`,
        after.current?.id === expected,
        JSON.stringify(after.current),
      );
    }

    console.log('\n· host password + coming back');
  check(
    'the host gets a 6-digit password',
    /^\d{6}$/.test(created.hostPassword || ''),
    created.hostPassword,
  );

  const wrong = await ask(host, 'host:reclaim', {
    roomCode: created.roomCode,
    password: '000000',
  });
  check('a wrong password is rejected', wrong?.ok === false, JSON.stringify(wrong));

  // A brand new connection (a different device) reclaims the room.
  const comeback = io(URL);
  await once(comeback, 'connect');
  const reclaimed = await ask(comeback, 'guest:join', {
    roomCode: created.roomCode,
    name: 'Host again',
    hostPassword: created.hostPassword,
  });
  check('the password gives you host rights', reclaimed?.isHost === true, JSON.stringify(reclaimed));

  const hostOnly = await ask(asha, 'song:skip', { roomCode: created.roomCode });
  check('a plain guest still cannot skip', hostOnly?.ok === false, JSON.stringify(hostOnly));

  console.log('\n· reconnect keeps the name');
    ravi.disconnect();
    const raviAgain = io(URL);
    track(raviAgain);
    await once(raviAgain, 'connect');
    const rejoin = await ask(raviAgain, 'guest:join', {
      roomCode: created.roomCode,
      name: 'Someone else',
      guestId: raviJoin.guestId,
    });
    check('the phone rejoins with the same name', rejoin?.name === 'Ravi', rejoin?.name);
    check('the guest id is stable', rejoin?.guestId === raviJoin.guestId);

    console.log('\n· end of night');
    await ask(host, 'party:end', { roomCode: created.roomCode });
    const ended = await waitFor(host, (s) => s.phase === 'ended', 'the night summary');
    const badges = (ended.summary?.badges || []).map((badge) => badge.title);
    check('summary has badges', badges.includes('Most Songs'), badges.join(', '));
    check(
      'summary has a leaderboard',
      (ended.summary?.leaderboard || []).length === 3,
      String((ended.summary?.leaderboard || []).length),
    );
    check('totals are counted', ended.summary?.totals?.songs >= 1);

    host.disconnect();
    asha.disconnect();
    raviAgain.disconnect();
    comeback.disconnect();
  } finally {
    server.kill();
  }

  console.log('');
  if (failures === 0) {
    console.log('✅  All smoke checks passed.');
  } else {
    console.log(`❌  ${failures} check(s) failed.`);
    process.exitCode = 1;
  }

  // The websocket clients keep the event loop alive — leave explicitly.
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n💥  Smoke test crashed:', err.message);
  process.exitCode = 1;
});
