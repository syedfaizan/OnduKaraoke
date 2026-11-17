import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl } from '../lib/config.js';
import { findLineIndex } from '../../../shared/lyrics.js';

const POLL_MS = 150;
const SYNC_STEP = 0.5;

/**
 * The big, synced words on the TV.
 *
 * Kept mounted behind the video (see .stage-body) so switching tabs never
 * tears down the YouTube player. It fetches once per song, follows the
 * player's clock, and grows the line that is being sung right now.
 */
export default function LyricsPanel({ song, active = false, getTime, startedAt, onUnavailable }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | none | error
  const [error, setError] = useState('');
  const [time, setTime] = useState(0);
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const scroller = useRef(null);
  const lineRefs = useRef([]);

  const videoId = song?.videoId;
  const title = song?.title;
  const channel = song?.channel;

  /* --- one lookup per song --- */

  useEffect(() => {
    if (!videoId) {
      setData(null);
      setStatus('idle');
      setTime(0);
      return undefined;
    }

    let cancelled = false;
    setStatus('loading');
    setData(null);
    setError('');
    setOffset(0);
    setTime(0);

    const params = new URLSearchParams({ title: title || '', artist: channel || '' });

    fetch(apiUrl(`/api/lyrics?${params}`))
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Lyrics could not be loaded.');
        return body;
      })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setStatus(result.found ? 'ready' : 'none');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Lyrics could not be loaded.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [videoId, title, channel, attempt]);

  /* --- follow the song clock (player time, with a wall-clock fallback) --- */

  useEffect(() => {
    if (!active || !videoId || status !== 'ready') return undefined;

    const tick = () => {
      const fromPlayer = getTime?.();
      const fallback = Number.isFinite(startedAt) ? (Date.now() - startedAt) / 1000 : 0;
      setTime(Number.isFinite(fromPlayer) ? fromPlayer : fallback);
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [active, videoId, status, getTime, startedAt]);

  /* --- an unfindable song sends the TV back to the video after a beat --- */

  useEffect(() => {
    if (!active || status !== 'none' || !videoId) return undefined;
    const id = setTimeout(() => onUnavailable?.(), 3000);
    return () => clearTimeout(id);
  }, [active, status, videoId, onUnavailable]);

  const activeIndex = useMemo(
    () => (data?.synced ? findLineIndex(data.lines, time + offset) : -1),
    [data, time, offset],
  );

  /* --- keep the sung line in the middle of the screen --- */

  useEffect(() => {
    if (!active || activeIndex < 0) return;
    const box = scroller.current;
    const line = lineRefs.current[activeIndex];
    if (!box || !line) return;

    const top = line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [active, activeIndex]);

  const nudge = useCallback((delta) => {
    setOffset((current) => Number((current + delta).toFixed(1)));
  }, []);

  return (
    <div className="lyrics-panel">
      <div className="lyrics-top">
        <div className="lyrics-song">
          <span className="lyrics-kicker">📝 LYRICS</span>
          <span className="lyrics-title">{song?.title || 'Nothing playing yet'}</span>
        </div>

        <div className="lyrics-tools">
          {data?.synced && (
            <div className="sync-controls" title="Nudge the words if they drift out of sync">
              <button type="button" onClick={() => nudge(-SYNC_STEP)} aria-label="Lyrics earlier">
                −½s
              </button>
              <span className="sync-value">
                {offset === 0 ? 'sync' : `${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`}
              </span>
              <button type="button" onClick={() => nudge(SYNC_STEP)} aria-label="Lyrics later">
                +½s
              </button>
            </div>
          )}

          <span className={`lyrics-badge ${data?.synced ? 'synced' : ''}`}>
            {status === 'ready' ? (data.synced ? 'SYNCED' : 'PLAIN') : ''}
          </span>
        </div>
      </div>

      <div className="lyrics-scroller" ref={scroller}>
        {status === 'idle' && (
          <div className="lyrics-placeholder">
            <strong>🎶</strong>
            <p>Lyrics will appear here when a song starts.</p>
          </div>
        )}

        {status === 'loading' && (
          <div className="lyrics-placeholder">
            <span className="spinner" />
            <p>Finding the words…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="lyrics-placeholder">
            <strong>📡</strong>
            <p>{error}</p>
            <button type="button" className="btn btn-ghost" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}

        {status === 'none' && (
          <div className="lyrics-placeholder">
            <strong>🎤</strong>
            <p>No lyrics found for this one.</p>
            <p className="lyrics-hint">Back to the video in a moment… 🎬</p>
          </div>
        )}

        {status === 'ready' && (
          <div className="lyrics-lines">
            {data.lines.map((line, index) => (
              <p
                key={`${line.time ?? index}-${index}`}
                ref={(element) => {
                  lineRefs.current[index] = element;
                }}
                className={`lyric-line ${index === activeIndex ? 'active' : ''} ${
                  index < activeIndex ? 'past' : ''
                }`}
              >
                {line.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
