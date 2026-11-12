import { useState } from 'react';
import NeonTitle from '../NeonTitle.jsx';

/**
 * Step 1 on a phone: pick your singer name.
 * The name is remembered, so a refresh keeps you in the room.
 */
export default function NameGate({ roomCode, onJoin, joining, error, connected }) {
  const storageKey = `ondu:${roomCode}:name`;
  const [name, setName] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) || '';
    } catch {
      return '';
    }
  });

  const submit = (event) => {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    try {
      sessionStorage.setItem(storageKey, clean);
    } catch {
      // Private mode — the name just won't be remembered.
    }
    onJoin(clean);
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

        <button
          type="submit"
          className="btn btn-pink big"
          disabled={!name.trim() || joining || !connected}
        >
          {joining ? 'Joining…' : connected ? 'Join the party 🎤' : 'Connecting…'}
        </button>

        {error && <p className="form-error">{error}</p>}

        <p className="gate-note">
          Keep this tab open — if you refresh, you&apos;ll rejoin with the same name.
        </p>
      </form>
    </div>
  );
}
