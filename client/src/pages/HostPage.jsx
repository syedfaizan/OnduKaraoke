import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../lib/realtime.js';
import { joinBaseUrl } from '../lib/joinUrl.js';
import { unlockAudio, playSound } from '../lib/sounds.js';
import { confettiBurst, confettiCelebration } from '../lib/confetti.js';
import { useToast } from '../lib/useToast.js';
import { useConnected } from '../lib/useConnected.js';
import { apiUrl } from '../lib/config.js';
import NeonTitle from '../components/NeonTitle.jsx';
import QrPanel from '../components/QrPanel.jsx';
import YoutubePlayer from '../components/YoutubePlayer.jsx';
import QueuePanel from '../components/QueuePanel.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import IntermissionOverlay from '../components/IntermissionOverlay.jsx';
import ReactionLayer from '../components/ReactionLayer.jsx';
import SummaryScreen from '../components/SummaryScreen.jsx';
import ToastDeck from '../components/ToastDeck.jsx';

/** The host screen keeps its room in sessionStorage so a refresh recovers it. */
const HOST_SESSION_KEY = 'ondu:host-session';

const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25];

function loadHostSession() {
  try {
    return JSON.parse(sessionStorage.getItem(HOST_SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

function saveHostSession(session) {
  try {
    sessionStorage.setItem(HOST_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

function clearHostSession() {
  try {
    sessionStorage.removeItem(HOST_SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * The TV / laptop screen: QR + room code on the left, the YouTube player in
 * the middle, queue + leaderboard on the right.
 */
export default function HostPage() {
  const [session, setSession] = useState(loadHostSession);
  const [state, setState] = useState(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [cover, setCover] = useState(false); // hides YouTube's end screen between songs
  const [youtubeOk, setYoutubeOk] = useState(true);
  const player = useRef(null);
  const intermissionFor = useRef(null); // which song we are counting down for
  const { toasts, show } = useToast();
  const connected = useConnected();

  const roomCode = session?.roomCode;
  const hostToken = session?.hostToken;

  /* ---------------- socket wiring ---------------- */

  useEffect(() => {
    const onConnect = () => {
      const saved = loadHostSession();
      if (!saved) return;

      socket.emit('host:connect', { roomCode: saved.roomCode, hostToken: saved.hostToken }, (ack) => {
        if (!ack?.ok) {
          // The server restarted (rooms are in memory) — start over.
          clearHostSession();
          setSession(null);
          setState(null);
          show('That room expired (server restarted?) — create a new one 👇', 'error');
          return;
        }
        setState(ack.state);
      });
    };

    const onState = (next) => setState(next);
    const onSound = ({ type }) => playSound(type);

    socket.on('connect', onConnect);
    socket.on('room:state', onState);
    socket.on('sound:play', onSound);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('room:state', onState);
      socket.off('sound:play', onSound);
    };
  }, [show]);

  // The QR code needs a phone-reachable URL.
  useEffect(() => {
    joinBaseUrl().then(setBaseUrl);
  }, []);

  // Surface "the backend has no YouTube key" right on the TV header.
  useEffect(() => {
    fetch(apiUrl('/api/health'))
      .then((response) => response.json())
      .then((data) => setYoutubeOk(data.youtube !== 'missing'))
      .catch(() => {});
  }, []);

  /* ---------------- actions ---------------- */

  const createRoom = useCallback(() => {
    if (!socket.connected) {
      show('Still connecting to the server…', 'error');
      return;
    }

    socket.emit('host:create', (ack) => {
      if (!ack?.ok) {
        show('Could not create a room — is the backend running?', 'error');
        return;
      }
      const saved = { roomCode: ack.roomCode, hostToken: ack.hostToken };
      saveHostSession(saved);
      setSession(saved);
      setState(ack.state);
      intermissionFor.current = null;
    });
  }, [show]);

  const startParty = () => {
    unlockAudio(); // one click = the browser lets us make noise all night
    socket.emit('party:start', { roomCode });
  };

  const endParty = () => {
    socket.emit('party:end', { roomCode });
    confettiCelebration();
  };

  const newParty = () => {
    clearHostSession();
    setSession(null);
    setState(null);
    intermissionFor.current = null;
    createRoom();
  };

  const beginPlayback = useCallback(
    (song, seekSeconds = 0) => {
      if (!song) return;
      setCover(false);
      player.current?.load(song.videoId, seekSeconds);
      socket.emit('song:started', { roomCode });
    },
    [roomCode],
  );

  const handleSongEnded = useCallback(
    (natural) => {
      if (!roomCode) return;
      setCover(true);

      if (natural) {
        confettiBurst(); // the performance deserves a curtain call 🎉
      } else {
        show('⚠️ That video would not play — skipping to the next song', 'error');
      }

      socket.emit('song:ended', { roomCode, natural });
    },
    [roomCode, show],
  );

  const skip = () => {
    setCover(true);
    player.current?.stop();
    socket.emit('song:skip', { roomCode });
  };

  const setSpeed = (rate) => socket.emit('speed:set', { roomCode, rate });

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    document.documentElement.requestFullscreen?.().catch(() => {
      show('Fullscreen was blocked — press F or use your browser menu', 'error');
    });
  };

  /* ---------------- react to the shared state ---------------- */

  useEffect(() => {
    if (!state) return;

    // Playback speed is shared — the host's phone can change it too.
    player.current?.setRate(state.speed);

    if (state.phase === 'intermission' && state.current) {
      if (intermissionFor.current !== state.current.id) {
        intermissionFor.current = state.current.id;
        player.current?.stop(); // kill any leftover audio
        setCover(true);
      }
      return;
    }

    if (state.phase === 'playing' && state.current) {
      if (player.current?.loadedId !== state.current.videoId) {
        // The host screen reconnected mid-song → resume where the room is.
        const elapsed = Math.max(0, (Date.now() - state.startedAt) / 1000);
        beginPlayback(state.current, elapsed > 4 ? elapsed - 1 : 0);
      } else {
        setCover(false);
      }
      return;
    }

    // idle / ended → nothing is playing.
    intermissionFor.current = null;
    player.current?.stop();
    setCover(true);
  }, [state, beginPlayback]);

  /* ---------------- render ---------------- */

  if (state?.phase === 'ended') {
    return (
      <>
        <SummaryScreen summary={state.summary} onNewParty={newParty} />
        <ToastDeck toasts={toasts} />
      </>
    );
  }

  if (!state) {
    return (
      <div className="landing">
        <NeonTitle size="xl" tagline="one screen sings · everyone queues 🎶" />

        {session ? (
          <div className="landing-status">
            <span className="spinner" /> Reconnecting to room {session.roomCode}…
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-cyan big"
            onClick={createRoom}
            disabled={!connected}
          >
            {connected ? 'Create a room 🎤' : 'Connecting…'}
          </button>
        )}

        <p className="landing-note">
          Put this on the TV, press <b>F</b> for fullscreen, then let the phones scan the QR.
          <br />
          YouTube may show an ad before a song — that&apos;s normal.
        </p>

        <ToastDeck toasts={toasts} />
      </div>
    );
  }

  return (
    <div className="host">
      <header className="host-header">
        <NeonTitle size="lg" />

        <div className="host-status">
          <span className="status-chip">👥 {state.singerStats?.length ?? 0} singers</span>
          <span className="status-chip">🎶 {state.queue?.length ?? 0} queued</span>
          <span className="status-chip room-chip">{state.roomCode}</span>
          {!youtubeOk && (
            <span className="status-chip warn-chip" title="Set YOUTUBE_API_KEY in .env and restart the backend">
              🔑 no YouTube key
            </span>
          )}
        </div>

        <div className="host-actions">
          {!state.partyStarted ? (
            <button type="button" className="btn btn-pink big" onClick={startParty}>
              ▶ Start party
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={skip}>
              ⏭ Skip
            </button>
          )}

          <div className="speed-group">
            <div className="speed-chips">
              {SPEEDS.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className={`chip ${state.speed === rate ? 'active' : ''}`}
                  onClick={() => setSpeed(rate)}
                >
                  {rate}x
                </button>
              ))}
            </div>
            <span className="speed-note">⚡ speed only — embedded YouTube can&apos;t change pitch/key</span>
          </div>

          <button type="button" className="btn btn-ghost" onClick={toggleFullscreen}>
            ⛶ Fullscreen
          </button>
          <button type="button" className="btn btn-danger" onClick={endParty}>
            ⏹ End party
          </button>
        </div>
      </header>

      <main className="host-layout">
        <QrPanel baseUrl={baseUrl} roomCode={state.roomCode} hostToken={hostToken} />

        <section className="stage">
          {state.partyStarted ? (
            <YoutubePlayer ref={player} onEnded={handleSongEnded} />
          ) : (
            <div className="stage-idle">
              <p className="stage-idle-title">Press “Start party” to let the mic go hot 🎤</p>
              <p className="stage-idle-sub">
                Browsers need one click before they&apos;ll play sound.
              </p>
            </div>
          )}

          {cover && state.partyStarted && (
            <div className="player-cover">
              <span>Great song! 🎉</span>
            </div>
          )}

          {state.partyStarted && state.phase === 'idle' && (
            <div className="queue-empty-overlay">
              <span>Queue&apos;s empty — scan the QR and add songs 🎶</span>
            </div>
          )}

          {state.current && state.phase === 'playing' && (
            <div className="now-bar card">
              <span className="nb-title">🎶 {state.current.title}</span>
              <span className="nb-singer">🎤 {state.current.singerName}</span>
              <span className="nb-reactions">❤️ {state.current.reactions || 0}</span>
            </div>
          )}
        </section>

        <div className="right-col">
          <QueuePanel
            variant="host"
            current={state.current}
            queue={state.queue || []}
          />
          <Leaderboard singerStats={state.singerStats || []} />
        </div>
      </main>

      {state.phase === 'intermission' && state.current && (
        <IntermissionOverlay
          song={state.current}
          playAt={state.playAt}
          onDone={() => beginPlayback(state.current)}
        />
      )}

      <ReactionLayer />
      <ToastDeck toasts={toasts} />
    </div>
  );
}
