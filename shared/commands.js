/**
 * Ondu Karaoke — command handling (shared by every backend).
 *
 * Both transports (Socket.IO on Node, WebSocket on a Durable Object) funnel
 * every client command through `handleCommand`, so the rules — who may skip,
 * who may remove, how the queue rotates, when the cooldown applies — live in
 * exactly ONE place.
 *
 * The caller supplies:
 *   room   the room object (shared/room.js)
 *   type   the command name
 *   payload the command arguments
 *   actor  { socketId, guest, isHost } — who is asking
 *   api    { randomSong, broadcastState, emitReaction, emitSound, touch }
 *
 * It returns the acknowledgement payload that is sent back to the client.
 */

import {
  addSong,
  advance,
  applyReaction,
  canPlaySound,
  computeSummary,
  finishSong,
  moveSong,
  removeSong,
  startSong,
  upsertGuest,
} from './room.js';

const fail = (error) => ({ ok: false, error });

/** Clean whatever a client sends us before it touches the queue. */
export function sanitizeSong(song) {
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
 * Execute one command.
 * @returns {Promise<object>} the ack payload
 */
export async function handleCommand({ room, type, payload = {}, actor, api }) {
  const isHost = Boolean(actor?.isHost);
  const guest = actor?.guest || null;

  switch (type) {
    /* ---------------- joining ---------------- */

    case 'host:connect': {
      const token = String(payload.hostToken || '');

      // First claim of this room wins and becomes the host secret.
      if (!room.hostToken) room.hostToken = token;
      if (!token || room.hostToken !== token) {
        return fail('That room no longer exists (the server may have restarted) — create a new one.');
      }

      room.hostSocketId = actor.socketId;
      api.touch?.();
      return { ok: true, state: api.buildState() };
    }

    case 'guest:join': {
      const returning = payload.guestId ? room.guests.get(payload.guestId) : null;

      if (room.phase === 'ended' && !returning) {
        return fail('This party has ended — ask the host to start a new one.');
      }

      const cleanName = String(payload.name || '').trim().slice(0, 24) || 'Guest';
      const isHostRemote = Boolean(payload.hostToken && payload.hostToken === room.hostToken);

      const joined = upsertGuest(room, {
        guestId: payload.guestId,
        name: cleanName,
        isHost: isHostRemote,
        socketId: actor.socketId,
      });

      if (isHostRemote) room.hostSocketId = room.hostSocketId || actor.socketId;
      api.touch?.();

      return {
        ok: true,
        guestId: joined.id,
        name: joined.name,
        isHost: joined.isHost,
        state: api.buildState(),
      };
    }

    /* ---------------- the queue ---------------- */

    case 'queue:add': {
      if (room.phase === 'ended') return fail('The party has ended 🎉');
      if (!guest) return fail('Join the room first!');

      const clean = sanitizeSong(payload.song);
      if (!clean) return fail('That song looked broken — try searching again.');

      const item = addSong(room, guest, clean);
      api.touch?.();

      // The party is running but the queue was empty → start right away.
      if (room.partyStarted && room.phase === 'idle') advance(room);

      return { ok: true, song: item };
    }

    case 'random:add': {
      if (room.phase === 'ended') return fail('The party has ended 🎉');
      if (!guest) return fail('Join the room first!');

      let song;
      try {
        song = await api.randomSong(payload.language);
      } catch (err) {
        return fail(err.expose === false ? 'Random pick failed — try again.' : err.message);
      }

      const item = addSong(room, guest, song);
      api.touch?.();

      if (room.partyStarted && room.phase === 'idle') advance(room);

      return { ok: true, song: item };
    }

    case 'queue:remove': {
      const song = room.queue.find((item) => item.id === payload.songId);
      if (!song) return fail('That song is already gone.');

      if (!isHost && song.singerId !== guest?.id) {
        return fail('You can only remove your own songs.');
      }

      removeSong(room, payload.songId);
      api.touch?.();
      return { ok: true };
    }

    case 'queue:move': {
      if (!isHost) return fail('Host controls only.');
      if (!moveSong(room, payload.songId, payload.dir === -1 ? -1 : 1)) {
        return fail('That song is already gone.');
      }
      api.touch?.();
      return { ok: true };
    }

    /* ---------------- playback ---------------- */

    case 'party:start': {
      if (!isHost) return fail('Host controls only.');

      room.partyStarted = true;
      room.summary = null;
      api.touch?.();

      if (room.phase === 'idle') advance(room);
      return { ok: true };
    }

    case 'song:started': {
      if (!isHost) return fail('Host controls only.');
      if (room.phase !== 'intermission') return fail('No song is waiting to start.');

      startSong(room);
      api.touch?.();
      return { ok: true };
    }

    case 'song:ended': {
      if (!isHost) return fail('Host controls only.');

      finishSong(room, { natural: Boolean(payload.natural) });
      api.touch?.();
      advance(room);
      return { ok: true };
    }

    case 'song:skip': {
      if (!isHost) return fail('Host controls only.');
      if (room.phase !== 'playing' && room.phase !== 'intermission') {
        return fail('Nothing is playing right now.');
      }

      finishSong(room, { natural: false });
      api.touch?.();
      advance(room);
      return { ok: true };
    }

    case 'speed:set': {
      if (!isHost) return fail('Host controls only.');

      const allowed = [0.75, 0.9, 1, 1.1, 1.25];
      if (!allowed.includes(payload.rate)) return fail('That speed is not available.');

      room.speed = payload.rate;
      api.touch?.();
      return { ok: true };
    }

    /* ---------------- reactions & sounds ---------------- */

    case 'reaction:send': {
      if (room.phase === 'ended') return fail('The party is over 🎉');
      if (!guest) return fail('Join the room first!');

      applyReaction(room, guest.id);
      api.touch?.();

      api.emitReaction(String(payload.emoji || '❤️').slice(0, 8));
      return { ok: true };
    }

    case 'sound:play': {
      if (room.phase === 'ended') return fail('The party is over 🎉');
      if (!guest) return fail('Join the room first!');

      const cooldown = canPlaySound(room, guest);
      if (!cooldown.ok) {
        return fail(`Easy there, DJ! Try again in ${Math.ceil(cooldown.wait / 1000)}s 😉`);
      }

      api.touch?.();
      api.emitSound(payload.type === 'airhorn' ? 'airhorn' : 'applause');
      return { ok: true };
    }

    /* ---------------- end of night ---------------- */

    case 'party:end': {
      if (!isHost) return fail('Host controls only.');

      room.phase = 'ended';
      room.summary = computeSummary(room);
      api.touch?.();
      return { ok: true };
    }

    default:
      return fail(`Unknown command "${type}"`);
  }
}
