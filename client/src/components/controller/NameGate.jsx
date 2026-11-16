import { useState } from 'react';
import NeonTitle from '../NeonTitle.jsx';
import { loadLastName, saveLastName } from '../../lib/session.js';

/**
 * Step 1 on a phone: pick your singer name.
 *
 * The name is remembered (for 6 hours) so a refresh keeps you in the room,
 * and guests who are actually the host can enter the 6-digit host password to
 * get the host controls on their phone too.
 */
export default function NameGate({ roomCode, onJoin, joining, error, connected }) {
  const [name, setName] = useState(() => loadLastName());
  const [isHost, setIsHost] = useState(false);
  const [password, setPassword] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    saveLastName(clean);
    onJoin(clean, isHost ? password.trim() : '');
  };

  return (
    <div className="gate">
      <NeonTitle size="xl" tagline="grab the mic 🎤" />

      <form className="gate-card card" onSubmit={submit}>
        <p className="gate-code-label">Room</p>
        <div className="gate-code">{roomCode || '····'}</div>

        <label htmlFor="singer-name">Your name</label>
        <input
          id="singer-name"
          className="neon-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={24}
          placeholder="e.g. Faizan"
          autoComplete="given-name"
          autoCapitalize="words"
        />

        {isHost && (
          <>
            <label htmlFor="host-password">Host password</label>
            <input
              id="host-password"
              className="neon-input"
              value={password}
              onChange={(event) => setPassword(event.target.value.replace(/\D/g, ''))}
              maxLength={6}
              placeholder="6-digit password"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </>
        )}

        <button
          type="submit"
          className="btn btn-pink big"
          disabled={!name.trim() || joining || !connected || (isHost && password.trim().length < 4)}
        >
          {joining ? 'Joining…' : connected ? 'Join the party 🎤' : 'Connecting…'}
        </button>

        {error && <p className="form-error">{error}</p>}

        <button type="button" className="link-btn" onClick={() => setIsHost((value) => !value)}>
          {isHost ? '← I am just a guest' : '🎧 I am the host — I have a password'}
        </button>

        <p className="gate-note">
          Keep this tab open — if you refresh, you&apos;ll rejoin with the same name.
        </p>
      </form>
    </div>
  );
}
