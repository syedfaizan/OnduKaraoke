import { useState } from 'react';
import { socket } from '../../lib/realtime.js';
import { apiUrl } from '../../lib/config.js';

/**
 * Search tab — type a song, add it to the shared queue under your name.
 * The search itself happens on the server (the YouTube key never leaves it).
 */
export default function SearchTab({ roomCode, onToast }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addedId, setAddedId] = useState(null);

  const search = async (event) => {
    event.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(query.trim())}`));

      // A Vercel-style host answers unknown paths with index.html — that
      // means the API is not reachable from this deployment.
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setResults([]);
        setError(
          'The song API is not reachable from this deployment — the host needs to set VITE_API_URL.',
        );
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setResults([]);
        setError(data.error || 'Search failed — try again.');
        return;
      }

      setResults(data.results || []);
      if (!data.results?.length) {
        setError('No karaoke tracks found for that — try another spelling?');
      }
    } catch {
      setError('Could not reach the party server — is the host still running?');
    } finally {
      setLoading(false);
    }
  };

  const add = (song) => {
    socket.emit('queue:add', { roomCode, song }, (ack) => {
      if (!ack?.ok) {
        onToast?.(ack?.error || 'Could not add that song', 'error');
        return;
      }
      setAddedId(song.videoId);
      setTimeout(() => setAddedId(null), 1600);
      onToast?.(`Added “${song.title}” 🎤`);
    });
  };

  return (
    <div className="tab-content">
      <form className="search-form" onSubmit={search}>
        <input
          className="neon-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a song 🎵"
          aria-label="Search a song"
        />
        <button type="submit" className="btn btn-cyan big" disabled={loading || !query.trim()}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}

      <ul className="results">
        {results.map((song) => (
          <li key={song.videoId} className="result">
            <img className="result-thumb" src={song.thumbnail} alt="" />
            <div className="result-info">
              <span className="result-title">{song.title}</span>
              <span className="result-channel">{song.channel}</span>
            </div>
            <button
              type="button"
              className={`btn add-btn ${addedId === song.videoId ? 'added' : ''}`}
              onClick={() => add(song)}
            >
              {addedId === song.videoId ? 'Added ✓' : '＋ Add'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
