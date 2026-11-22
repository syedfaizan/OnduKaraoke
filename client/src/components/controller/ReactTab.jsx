import { useState } from 'react';
import { socket } from '../../lib/realtime.js';
import { CLASSIC_EMOJIS, EMOJI_CATEGORIES, cleanCustomEmoji, searchEmojis } from '../../lib/emojis.js';
import {
  customEmojis,
  recordEmoji,
  removeCustomEmoji,
  saveCustomEmoji,
  topEmojis,
} from '../../lib/emojiStats.js';

/**
 * React tab — the fun one.
 *
 * Every reaction is an emoji: the six one-tap classics, a searchable picker,
 * and emoji pasted by the guest. Whatever gets sent is counted on this phone,
 * so the five favourites rise to the top as the night goes on.
 */
export default function ReactTab({ roomCode, guestId }) {
  const [top, setTop] = useState(() => topEmojis(guestId));
  const [custom, setCustom] = useState(() => customEmojis(guestId));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const send = (emoji) => {
    if (!emoji) return;
    socket.emit('reaction:send', { roomCode, emoji });
    setTop(recordEmoji(guestId, emoji));
  };

  const addCustom = () => {
    const emoji = cleanCustomEmoji(draft);
    if (!emoji) {
      setError('Paste an emoji only — words and sentences are not reactions.');
      return;
    }
    setError('');
    setCustom(saveCustomEmoji(guestId, emoji));
    setDraft('');
    send(emoji);
  };

  const results = query.trim() ? searchEmojis(query) : [];

  return (
    <div className="tab-content">
      <p className="fair-note">💜 Every reaction adds a point to the singer&apos;s score.</p>

      {top.length > 0 && (
        <>
          <h3 className="react-heading">Your top 5</h3>
          <div className="emoji-grid">
            {top.map(({ emoji, count }) => (
              <button
                key={emoji}
                type="button"
                className="emoji-btn top-emoji-btn"
                onClick={() => send(emoji)}
                aria-label={`Send ${emoji}, used ${count} ${count === 1 ? 'time' : 'times'}`}
              >
                {emoji}
                <span className="emoji-count">{count}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h3 className="react-heading">Quick emoji</h3>
      <div className="emoji-grid">
        {CLASSIC_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="emoji-btn"
            onClick={() => send(emoji)}
            aria-label={`Send ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {custom.length > 0 && (
        <>
          <h3 className="react-heading">My emoji</h3>
          <div className="emoji-grid">
            {custom.map((emoji) => (
              <div className="custom-emoji-tile" key={emoji}>
                <button
                  type="button"
                  className="emoji-btn"
                  onClick={() => send(emoji)}
                  aria-label={`Send ${emoji}`}
                >
                  {emoji}
                </button>
                <button
                  type="button"
                  className="custom-emoji-remove"
                  onClick={() => setCustom(removeCustomEmoji(guestId, emoji))}
                  aria-label={`Remove ${emoji}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        className="picker-toggle"
        onClick={() => setPickerOpen((open) => !open)}
        aria-expanded={pickerOpen}
      >
        {pickerOpen ? '▲ Hide emoji picker' : '▼ More emojis'}
      </button>

      {pickerOpen && (
        <div className="emoji-picker">
          <input
            className="emoji-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search — love, cat, fire…"
            aria-label="Search emoji"
          />

          {query.trim() ? (
            <div className="emoji-picker-grid">
              {results.length ? (
                results.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="emoji-pick"
                    onClick={() => send(emoji)}
                    aria-label={`Send ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))
              ) : (
                <p className="emoji-empty">No emoji found — paste your own below.</p>
              )}
            </div>
          ) : (
            EMOJI_CATEGORIES.map((category) => (
              <section key={category.name} className="emoji-category">
                <h4>
                  <span aria-hidden="true">{category.icon}</span> {category.name}
                </h4>
                <div className="emoji-picker-grid">
                  {category.emojis.map(([emoji]) => (
                    <button
                      key={emoji}
                      type="button"
                      className="emoji-pick"
                      onClick={() => send(emoji)}
                      aria-label={`Send ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      <h3 className="react-heading">Your own emoji</h3>
      <div className="custom-emoji-row">
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addCustom();
          }}
          placeholder="Paste any emoji…"
          aria-label="Custom emoji"
        />
        <button type="button" className="add-btn" onClick={addCustom}>
          Add
        </button>
      </div>
      {error && <p className="custom-emoji-error">{error}</p>}
    </div>
  );
}
