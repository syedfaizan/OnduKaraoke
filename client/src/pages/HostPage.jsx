import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../lib/realtime.js';
import { joinBaseUrl } from '../lib/joinUrl.js';
import { unlockAudio, playSound } from '../lib/sounds.js';
import { confettiBurst, confettiCelebration } from '../lib/confetti.js';
import { useToast } from '../lib/useToast.js';
import { useConnected } from '../lib/useConnected.js';
import { apiUrl } from '../lib/config.js';
import { clearHostSession, loadHostSession, saveHostSession } from '../lib/session.js';
import NeonTitle from '../components/NeonTitle.jsx';
import QrPanel from '../components/QrPanel.jsx';
import YoutubePlayer from '../components/YoutubePlayer.jsx';
import QueuePanel from '../components/QueuePanel.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import IntermissionOverlay from '../components/IntermissionOverlay.jsx';
import ReactionLayer from '../components/ReactionLayer.jsx';
import SummaryScreen from '../components/SummaryScreen.jsx';
import ToastDeck from '../components/ToastDeck.jsx';

const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25];

/**
 * The playback-speed control is hidden for now (the backend still supports
 * it — flip this back to true to bring the chips and the note back).
 */
const SHOW_SPEED = false;

/**
 * "I already have a room" — the host comes back with the room code and the
 * 6-digit password (shown when the room was created).
 */
function RejoinForm({ onReclaim, disabled }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        ♻️ I already have a room
      </button>
    );
  }

  return (
    <form
      className="rejoin-card card"
      onSubmit={(event) => {
        event.preventDefault();
        const cleanCode = code.trim().toUpperCase();
        const cleanPassword = password.trim();
        if (cleanCode.length < 3 || cleanPassword.length < 4) return;
        onReclaim(cleanCode, cleanPassword);
      }}
    >
      <p className="panel-title">Get back into your room</p>
      <div className="rejoin-row">
        <input
          className="neon-input code-input"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={4}
          placeholder="CODE"
          aria-label="Room code"
        />
        <input
          className="neon-input"
          value={password}
          onChange={(event) => setPassword(event.target.value.replace(/\D/g, ''))}
          maxLength={6}
          placeholder="123456"
          inputMode="numeric"
          aria-label="Host password"
        />
      </div>
      <div className="rejoin-actions">
        <button
          type="submit"
          className="btn btn-pink"
          disabled={disabled || code.trim().length < 3 || password.trim().length < 4}
        >
          Rejoin as host 🎤
        </button>
        <button type="button" className="link-btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
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

      socket.emit(
        'host:connect',
        { roomCode: saved.roomCode, hostToken: saved.hostToken, hostPassword: saved.hostPassword },
        (ack) => {
          if (!ack?.ok) {
            // The room is gone (or the backend restarted) — start over.
            clearHostSession();
            setSession(null);
            setState(null);
            show('That room expired (server restarted?) — create a new one 👇', 'error');
            return;
          }
          setState(ack.state);
        },
      );
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

  // The realtime layer could not reach the backend — say why.
  useEffect(() => {
    const onError = (event) => show(event.detail || 'Lost the party server', 'error');
    window.addEventListener('ondu:realtime-error', onError);
    return () => window.removeEventListener('ondu:realtime-error', onError);
  }, [show]);

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
      const saved = {
        roomCode: ack.roomCode,
        hostToken: ack.hostToken,
        hostPassword: ack.hostPassword, // shown on screen so the host can come back
      };
      saveHostSession(saved);
      setSession(saved);
      setState(ack.state);
      intermissionFor.current = null;
    });
  }, [show]);

  /**
   * Get back into a room with the 6-digit host password — for when the host
   * closed the tab, pressed "back", or wants to run the party from another
   * device.
   */
  const reclaimRoom = useCallback(
    (code, password) => {
      socket.emit('host:reclaim', { roomCode: code, password }, (ack) => {
        if (!ack?.ok) {
          show(ack?.error || 'Could not get back into that room', 'error');
          return;
        }
        // We keep the token when we have it, otherwise the password is enough
        // from now on (the room already stores it).
        const saved = {
          roomCode: code,
          hostToken: loadHostSession()?.hostToken || null,
          hostPassword: password,
        };
        saveHostSession(saved);
        setSession(saved);
        setState(ack.state);
        intermissionFor.current = null;
        show(`Welcome back, host of ${code} 🎤`);
      });
    },
    [show],
  );

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

  /* ---------------- sharing ---------------- */

  const copyText = useCallback(
    async (text, message) => {
      try {
        await navigator.clipboard.writeText(text);
        show(message);
      } catch {
        show('Could not copy it — it is on screen anyway 👆', 'error');
      }
    },
    [show],
  );

  /** Share the join link with other apps (WhatsApp, Messages, AirDrop, …). */
  const shareLink = useCallback(
    async (url) => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Ondu Karaoke',
            text: `Join my karaoke party! 🎤 Room code ${roomCode}`,
            url,
          });
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return; // the user closed the sheet
        }
      }
      // No share sheet (a TV browser, for instance) → copy instead.
      copyText(url, 'Link copied 📋');
    },
    [copyText, roomCode, show],
  );

  /** Host controls on the TV itself: move a song up/down or drop it. */
  const moveSong = useCallback(
    (songId, dir) => {
      socket.emit('queue:move', { roomCode, songId, dir }, (ack) => {
        if (ack && !ack.ok) show(ack.error || 'Could not move that song', 'error');
      });
    },
    [roomCode, show],
  );

  const removeSong = useCallback(
    (songId) => {
      socket.emit('queue:remove', { roomCode, songId }, (ack) => {
        if (ack && !ack.ok) show(ack.error || 'Could not remove that song', 'error');
      });
    },
    [roomCode, show],
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
      return;
    }

    // iOS Safari only allows fullscreen for video elements — tell the user
    // what to do instead of failing silently.
    if (!document.documentElement.requestFullscreen) {
      show('This browser cannot go fullscreen — try Chrome, or add to the home screen 📱', 'error');
      return;
    }

    const request = document.documentElement.requestFullscreen({ navigationUI: 'hide' });

    // Some browsers leave the request hanging instead of answering — give
    // the host feedback either way.
    Promise.race([
      request.then(() => 'ok').catch((err) => err),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 1500)),
    ]).then((result) => {
      if (result === 'ok') return;
      if (result === 'timeout') {
        show('Fullscreen did not answer — try the ⛶ button, or press F again', 'error');
      } else {
        show('Fullscreen was blocked — press F or use your browser menu', 'error');
      }
    });
  }, [show]);

  /* Keyboard shortcuts for the TV: F = fullscreen. */
  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFullscreen]);

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
          <>
            <button
              type="button"
              className="btn btn-cyan big"
              onClick={createRoom}
              disabled={!connected}
            >
              {connected ? 'Create a room 🎤' : 'Connecting…'}
            </button>

            <RejoinForm onReclaim={reclaimRoom} disabled={!connected} />
          </>
        )}

        <p className="landing-note">
          Put this on the TV and press <b>F</b> for fullscreen, then let the phones scan the QR.
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

          {SHOW_SPEED && (
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
              <span className="speed-note">
                ⚡ speed only — embedded YouTube can&apos;t change pitch/key
              </span>
            </div>
          )}

          <button
            type="button"
            className="btn btn-ghost"
            onClick={toggleFullscreen}
            title="Fullscreen (press F)"
          >
            ⛶ Fullscreen
          </button>
          <button type="button" className="btn btn-danger" onClick={endParty}>
            ⏹ End party
          </button>
        </div>
      </header>

      <main className="host-layout">
        <QrPanel
          baseUrl={baseUrl}
          roomCode={state.roomCode}
          hostToken={hostToken}
          hostPassword={session?.hostPassword}
          onShare={shareLink}
          onCopy={(url) => copyText(url, 'Link copied 📋')}
          onCopyPassword={(password) => copyText(password, 'Host password copied 🔐')}
        />

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
            isHost
            onMove={moveSong}
            onRemove={removeSong}
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
