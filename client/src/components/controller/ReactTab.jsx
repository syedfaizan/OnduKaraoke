import { socket } from '../../lib/realtime.js';
import { EMOJI_REACTIONS, REACTIONS } from '../../lib/reactions.js';

/**
 * React tab — the fun one.
 * The six classic emoji and the six cat/dog memes both float up on the TV and
 * count towards the current singer's score.
 */
export default function ReactTab({ roomCode }) {
  const sendReaction = (id) => {
    socket.emit('reaction:send', { roomCode, emoji: id });
  };

  return (
    <div className="tab-content">
      <p className="fair-note">💜 Every reaction adds a point to the singer&apos;s score.</p>

      <h3 className="react-heading">Emoji</h3>
      <div className="emoji-grid">
        {EMOJI_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="emoji-btn"
            onClick={() => sendReaction(emoji)}
            aria-label={`Send ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <h3 className="react-heading">Memes</h3>
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
    </div>
  );
}
