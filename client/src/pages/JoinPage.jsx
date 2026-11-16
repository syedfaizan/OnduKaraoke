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
import RandomTab from '../components/controller/RandomTab.jsx';
import ToastDeck from '../components/ToastDeck.jsx';

const TABS = [
  { key: 'search', emoji: '🔍', label: 'Search' },
  { key: 'queue', emoji: '📋', label: 'Queue' },
  { key: 'react', emoji: '💜', label: 'React' },
  { key: 'random', emoji: '🎲', label: 'Random' },
];

const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25];

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

  const skip = () => socket.emit('song:skip', { roomCode });
  const setSpeed = (rate) => socket.emit('speed:set', { roomCode, rate });

  return (
    <div className="phone">
      <header className="phone-header">
        <NeonTitle size="sm" />
        <div className="phone-meta">
          <span className="status-chip room-chip">{roomCode}</span>
          <span className="status-chip">{me?.name}</span>
          {isHost && <span className="status-chip host-chip">🎧 Host</span>}
        </div>
      </header>

      {isHost && (
        <div className="host-bar card">
          <div className="host-bar-row">
            <span className="host-bar-title">🎧 Host controls</span>
            <button type="button" className="btn btn-pink" onClick={skip}>
              ⏭ Skip
            </button>
          </div>

          <div className="speed-chips">
            {SPEEDS.map((rate) => (
              <button
                key={rate}
                type="button"
                className={`chip ${state?.speed === rate ? 'active' : ''}`}
                onClick={() => setSpeed(rate)}
              >
                {rate}x
              </button>
            ))}
          </div>

          <p className="speed-note">⚡ speed only — embedded YouTube can&apos;t change pitch/key</p>
        </div>
      )}

      <main className="phone-body">
        {tab === 'search' && <SearchTab roomCode={roomCode} onToast={show} />}
        {tab === 'queue' && (
          <QueueTab state={state} me={me} roomCode={roomCode} onToast={show} />
        )}
        {tab === 'react' && <ReactTab roomCode={roomCode} onToast={show} />}
        {tab === 'random' && <RandomTab roomCode={roomCode} onToast={show} />}
      </main>

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
