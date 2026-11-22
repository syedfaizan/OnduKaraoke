import { useEffect, useState } from 'react';
import { socket } from '../../lib/realtime.js';
import { EMOJI_REACTIONS, REACTIONS } from '../../lib/reactions.js';
import { GIPHY_API_KEY, fetchGiphyMemes } from '../../lib/giphy.js';

/**
 * React tab — the fun one.
 * The six classic emoji and the six cat/dog memes both float up on the TV and
 * count towards the current singer's score. With a client-side GIPHY key the
 * meme buttons show GIPHY's current pick; otherwise they use the bundled GIFs,
 * so reactions work offline and on the local backend too.
 */
export default function ReactTab({ roomCode }) {
  const [giphyUrls, setGiphyUrls] = useState(null);

  useEffect(() => {
    if (!GIPHY_API_KEY) return undefined;
    let alive = true;
    fetchGiphyMemes()
      .then((memes) => {
        if (!alive) return;
        const urls = new Map(memes.filter((meme) => meme.url).map((meme) => [meme.id, meme.url]));
        if (urls.size) setGiphyUrls(urls);
      })
      .catch(() => {
        // No network — the local GIFs are still right there.
      });
    return () => {
      alive = false;
    };
  }, []);

  const sendReaction = (id, url = '') => {
    socket.emit('reaction:send', { roomCode, emoji: id, url });
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
        {REACTIONS.map((reaction) => {
          const url = giphyUrls?.get(reaction.id);
          return (
            <button
              key={reaction.id}
              type="button"
              className="reaction-btn"
              onClick={() => sendReaction(reaction.id, url)}
              aria-label={`Send ${reaction.label}`}
            >
              <img src={url || reaction.gif} alt="" />
              <span>{reaction.label}</span>
            </button>
          );
        })}
      </div>

      {giphyUrls && (
        <a className="attribution" href="https://giphy.com" target="_blank" rel="noreferrer">
          <img src="/giphy-powered.png" alt="Powered by GIPHY" />
        </a>
      )}
    </div>
  );
}
