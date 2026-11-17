import { useEffect, useRef, useState } from 'react';
import { socket } from '../../lib/realtime.js';
import { REACTIONS } from '../../lib/reactions.js';

/** Same cooldown the server enforces — the button greys out while it runs. */
const COOLDOWN_MS = 2000;

/**
 * React tab — the fun one.
 * Cat/dog GIFs float up on the TV and count towards the current singer's
 * score; the Applause button plays a real crowd recording on the host screen.
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

  const sendReaction = (id) => {
    socket.emit('reaction:send', { roomCode, emoji: id });
  };

  const sendApplause = () => {
    if (Date.now() < lockRef.current) return;
    lockRef.current = Date.now() + COOLDOWN_MS;
    setLockUntil(lockRef.current);

    socket.emit('sound:play', { roomCode, type: 'applause' }, (ack) => {
      if (!ack?.ok) {
        lockRef.current = Date.now() + 600; // let them retry quickly
        setLockUntil(lockRef.current);
        onToast?.(ack?.error || 'The applause did not go through', 'error');
      }
    });
  };

  const cooling = left > 0;

  return (
    <div className="tab-content">
      <p className="fair-note">💜 Every reaction adds a point to the singer&apos;s score.</p>

      <div className="reaction-grid">
        {REACTIONS.map((reaction) => (
          <button
            key={reaction.id}
            type="button"
            className="reaction-btn"
            onClick={() => sendReaction(reaction.id)}
            aria-label={`Send ${reaction.label}`}
          >
            <img src={reaction.gif} alt="" />
            <span>{reaction.label}</span>
          </button>
        ))}
      </div>

      <div className="sound-row">
        <button
          type="button"
          className="btn btn-cyan sound-btn"
          onClick={sendApplause}
          disabled={cooling}
        >
          👏 Applause
        </button>
      </div>

      <p className="fair-note">
        {cooling ? `Cooling down… ${(left / 1000).toFixed(1)}s` : 'One round of applause every 2 seconds.'}
      </p>
    </div>
  );
}
