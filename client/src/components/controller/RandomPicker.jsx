import { useState } from 'react';
import { socket } from '../../lib/realtime.js';

/** Kept in sync with server/randomSongs.js */
const LANGUAGES = [
  { key: 'english', label: 'English', emoji: '🇬🇧' },
  { key: 'hindi', label: 'Hindi', emoji: '🇮🇳' },
  { key: 'kannada', label: 'Kannada', emoji: '🎶' },
];

/**
 * The random-song panel. It used to be its own tab; now the Search page's
 * "Surprise me" button opens this exact view. Pick a language and the server
 * finds a popular karaoke song and drops it into the queue under your name.
 */
export default function RandomPicker({ roomCode, onToast }) {
  const [busy, setBusy] = useState('');

  const pick = (language) => {
    if (busy) return;
    setBusy(language);

    socket.emit('random:add', { roomCode, language }, (ack) => {
      setBusy('');
      if (!ack?.ok) {
        onToast?.(ack?.error || 'Could not pick a random song', 'error');
        return;
      }
      onToast?.(`🎲 Added “${ack.song.title}” — good luck!`);
    });
  };

  return (
    <div className="random-picker">
      <p className="fair-note">Pick a language, we&apos;ll roll the dice 🎲</p>

      <div className="lang-grid">
        {LANGUAGES.map((language) => (
          <button
            key={language.key}
            type="button"
            className="lang-btn card"
            onClick={() => pick(language.key)}
            disabled={Boolean(busy)}
          >
            <span className="lang-emoji">{language.emoji}</span>
            <span className="lang-label">{language.label}</span>
            <span className="lang-hint">
              {busy === language.key ? 'Rolling…' : 'Surprise me'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
