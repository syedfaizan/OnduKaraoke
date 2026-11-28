import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { socket } from '../lib/realtime.js';
import { useToast } from '../lib/useToast.js';
import { useConnected } from '../lib/useConnected.js';
import { loadGuestSession, saveGuestSession } from '../lib/session.js';
import NeonTitle from '../components/NeonTitle.jsx';
import NameGate from '../components/controller/NameGate.jsx';
import SearchTab from '../components/controller/SearchTab.jsx';
import QueueTab from '../components/controller/QueueTab.jsx';
import ReactTab from '../components/controller/ReactTab.jsx';
import ToastDeck from '../components/ToastDeck.jsx';

const TABS = [
  { key: 'search', emoji: '🔍', label: 'Search' },
  { key: 'queue', emoji: '📋', label: 'Queue' },
  { key: 'react', emoji: '💜', label: 'React' },
];

/**
 * The phone controller: join a room, queue songs, send reactions.
 *
 * The guest identity is kept in localStorage for 6 hours, so closing the app
 * and coming back later puts you back in the room with the same name.
 */
export default function JoinPage() {
  const { roomCode: paramCode } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const roomCode = paramCode ? paramCode.toUpperCase() : null;
  const urlHostToken = params.get('hostToken');

  const [me, setMe] = useState(null);
  const [state, setState] = useState(null);
  const [phase, setPhase] = useState('gate'); // gate | joining | joined
  const [error, setError] = useState('');
  const [tab, setTab] = useState('search');
  const [codeEntry, setCodeEntry] = useState('');
  const { toasts, show } = useToast();
  const connected = useConnected();

  /**
   * Join (or re-join) the room.
   * `silent` keeps the current screen while reconnecting, `password` makes the
   * guest the host (the 6-digit password).
   */
  const join = useCallback(
    (name, silent = false, password = '') => {
      if (!roomCode) return;

      const stored = loadGuestSession(roomCode);
      const hostToken = stored?.hostToken || urlHostToken || undefined;

      if (!silent) setPhase('joining');

      socket.emit(
        'guest:join',
        {
          roomCode,
          name,
          guestId: stored?.guestId,
          hostToken,
          hostPassword: password || undefined,
        },
        (ack) => {
          if (!ack?.ok) {
            if (!silent) {
              setPhase('gate');
              setError(ack?.error || 'Could not join the room.');
            }
            return;
          }

          saveGuestSession(roomCode, { guestId: ack.guestId, name: ack.name, hostToken });
          setMe({ guestId: ack.guestId, name: ack.name, isHost: ack.isHost });
          setState(ack.state);
          setPhase('joined');
          setError('');

          if (ack.isHost && password) show('Host mode on 🎧');
        },
      );
    },
    [roomCode, urlHostToken, show],
  );

  /* Rejoin automatically after a refresh or a Wi-Fi blip. */
  useEffect(() => {
    if (!roomCode) return undefined;

    const onConnect = () => {
      const stored = loadGuestSession(roomCode);
      if (!stored) return;
      join(stored.name, true);
    };

    socket.on('connect', onConnect);
    if (socket.connected) onConnect();

    return () => socket.off('connect', onConnect);
  }, [roomCode, join]);

  /* Live room state. */
  useEffect(() => {
    const onState = (next) => setState(next);
    socket.on('room:state', onState);
    return () => socket.off('room:state', onState);
  }, []);

  /* ---------------- no room code yet → ask for it ---------------- */

  if (!roomCode) {
    return (
      <div className="gate">
        <NeonTitle size="xl" tagline="join the party 🎉" />

        <form
          className="gate-card card"
          onSubmit={(event) => {
            event.preventDefault();
            const code = codeEntry.trim().toUpperCase();
            if (code.length >= 3) navigate(`/join/${code}`);
          }}
        >
          <label htmlFor="room-code">Room code</label>
          <input
            id="room-code"
            className="neon-input code-input"
            value={codeEntry}
            onChange={(event) => setCodeEntry(event.target.value.toUpperCase())}
            maxLength={4}
            placeholder="ABCD"
            autoComplete="off"
            autoCapitalize="characters"
          />
          <button type="submit" className="btn btn-cyan big" disabled={codeEntry.trim().length < 3}>
            Go 🎤
          </button>
          <p className="gate-note">You can also scan the QR code on the TV screen.</p>
        </form>
      </div>
    );
  }

  /* ---------------- name gate ---------------- */

  if (phase !== 'joined') {
    return (
      <>
        <NameGate
          roomCode={roomCode}
          onJoin={(name, password) => join(name, false, password)}
          joining={phase === 'joining'}
          error={error}
          connected={connected}
        />
        <ToastDeck toasts={toasts} />
      </>
    );
  }

  /* ---------------- the party is over ---------------- */

  if (state?.phase === 'ended') {
    const badges = state.summary?.badges || [];
    return (
      <div className="gate">
        <NeonTitle size="xl" tagline={"party's over 🌙"} />
        <div className="gate-card card">
          <p className="ended-line">Thanks for singing, {me?.name}! 💜</p>
          {badges.length > 0 ? (
            <ul className="ended-badges">
              {badges.map((badge) => (
                <li key={badge.title}>
                  {badge.emoji} <b>{badge.title}</b> — {badge.winners.join(' & ')}
                </li>
              ))}
            </ul>
          ) : (
            <p className="gate-note">Come back for the next party!</p>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- the phone controller ---------------- */

  const isHost = Boolean(me?.isHost);
  const currentSong = state?.current;
  const nextSong = state?.queue?.[0];
  const canPlayPause = isHost && (state?.phase === 'playing' || state?.phase === 'paused' || (state?.phase === 'idle' && Boolean(nextSong)));
  const canNext = isHost && (state?.phase === 'playing' || state?.phase === 'paused' || state?.phase === 'intermission' || (state?.phase === 'idle' && Boolean(nextSong)));

  const playPause = () => {
    if (!isHost) return;
    if (state?.phase === 'playing') {
      socket.emit('song:pause', { roomCode }, (ack) => {
        if (!ack?.ok) show(ack?.error || 'Could not pause', 'error');
      });
      return;
    }
    if (state?.phase === 'paused') {
      socket.emit('song:resume', { roomCode }, (ack) => {
        if (!ack?.ok) show(ack?.error || 'Could not resume', 'error');
      });
      return;
    }
    if (state?.phase === 'idle' && nextSong) {
      socket.emit('party:start', { roomCode }, (ack) => {
        if (!ack?.ok) show(ack?.error || 'Could not start the next song', 'error');
      });
    }
  };

  const playNext = () => {
    if (!isHost) return;
    if (state?.phase === 'playing' || state?.phase === 'paused' || state?.phase === 'intermission') {
      socket.emit('song:skip', { roomCode }, (ack) => {
        if (!ack?.ok) show(ack?.error || 'Could not skip', 'error');
      });
      return;
    }
    if (state?.phase === 'idle' && nextSong) {
      socket.emit('party:start', { roomCode }, (ack) => {
        if (!ack?.ok) show(ack?.error || 'Could not start the next song', 'error');
      });
    }
  };

  const playPauseLabel = state?.phase === 'playing' ? '⏸' : '▶';
  const playPauseTitle = state?.phase === 'playing' ? 'Pause' : state?.phase === 'paused' ? 'Resume' : 'Play next';
  const miniStatus = !state?.partyStarted
    ? 'Party not started'
    : state?.phase === 'intermission'
      ? `Up next: ${currentSong?.title || 'Getting ready…'}`
      : state?.phase === 'paused'
        ? `Paused: ${currentSong?.title || 'Nothing playing'}`
        : state?.phase === 'playing'
          ? currentSong?.title || 'Nothing playing'
          : nextSong
            ? `Next: ${nextSong.title}`
            : 'Queue is empty';

  return (
    <div className={`phone ${isHost ? 'phone-host' : ''}`}>
      <header className="phone-header">
        <NeonTitle size="sm" />
        <div className="phone-meta">
          <span className="status-chip room-chip">{roomCode}</span>
          <span className="status-chip">{me?.name}</span>
          {isHost && <span className="status-chip host-chip">🎧 Host remote</span>}
        </div>
      </header>

      <main className="phone-body">
        {tab === 'search' && <SearchTab roomCode={roomCode} onToast={show} />}
        {tab === 'queue' && (
          <QueueTab state={state} me={me} roomCode={roomCode} onToast={show} />
        )}
        {tab === 'react' && <ReactTab roomCode={roomCode} guestId={me?.guestId} />}
      </main>

      {isHost && (
        <div className="host-mini-player" role="region" aria-label="Host playback controls">
          <div className="host-mini-meta">
            <span className="host-mini-kicker">NOW PLAYING</span>
            <span className="host-mini-title" title={miniStatus}>{miniStatus}</span>
          </div>
          <div className="host-mini-actions">
            <button
              type="button"
              className="host-mini-btn"
              onClick={playPause}
              disabled={!canPlayPause}
              aria-label={playPauseTitle}
              title={playPauseTitle}
            >
              {playPauseLabel}
            </button>
            <button
              type="button"
              className="host-mini-btn"
              onClick={playNext}
              disabled={!canNext}
              aria-label="Next song"
              title="Next song"
            >
              ⏭
            </button>
          </div>
        </div>
      )}

      <nav className="tabbar">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? 'active' : ''}
            onClick={() => setTab(item.key)}
          >
            <span className="tab-emoji">{item.emoji}</span>
            <span className="tab-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <ToastDeck toasts={toasts} />
    </div>
  );
}
