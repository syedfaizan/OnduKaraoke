import { useEffect, useRef, useState } from 'react';
import { socket } from '../../lib/realtime.js';

const EMOJIS = ['❤️', '🔥', '👏', '😂', '🎤', '🎉'];

/** Same cooldown the server enforces — the buttons grey out while it runs. */
const COOLDOWN_MS = 2000;

/**
 * React tab — the fun one.
 * Emoji reactions float up on the TV and count towards the current singer's
 * score; applause and airhorn make actual noise on the host screen.
 */
export default function ReactTab({ roomCode, onToast }) {
  const [lockUntil, setLockUntil] = useState(0);
  const [left, setLeft] = useState(0);
  const lockRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, lockRef.current - Date.now());
      setLeft(remaining);
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const sendEmoji = (emoji) => {
    socket.emit('reaction:send', { roomCode, emoji });
  };

  const sendSound = (type) => {
    if (Date.now() < lockRef.current) return;
    lockRef.current = Date.now() + COOLDOWN_MS;
    setLockUntil(lockRef.current);

    socket.emit('sound:play', { roomCode, type }, (ack) => {
      if (!ack?.ok) {
        lockRef.current = Date.now() + 600; // let them retry quickly
        setLockUntil(lockRef.current);
        onToast?.(ack?.error || 'That sound did not go through', 'error');
      }
    });
  };

  const cooling = left > 0;

  return (
    <div className="tab-content">
      <p className="fair-note">💜 Reactions count towards the singer&apos;s score.</p>

      <div className="emoji-grid">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="emoji-btn"
            onClick={() => sendEmoji(emoji)}
            aria-label={`Send ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="sound-row">
        <button
          type="button"
          className="btn btn-cyan sound-btn"
          onClick={() => sendSound('applause')}
          disabled={cooling}
        >
          👏 Applause
        </button>
        <button
          type="button"
          className="btn btn-pink sound-btn"
          onClick={() => sendSound('airhorn')}
          disabled={cooling}
        >
          📢 Airhorn
        </button>
      </div>

      <p className="fair-note">
        {cooling ? `Cooling down… ${(left / 1000).toFixed(1)}s` : 'One sound at a time (2s cooldown).'}
      </p>
    </div>
  );
}
