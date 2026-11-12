import { useEffect, useRef, useState } from 'react';

/**
 * Fullscreen "Get ready, <singer>!" overlay with an animated countdown.
 *
 * The countdown is driven by `playAt` (a server timestamp), so a phone that
 * joins late — or a host screen that refreshes — still lands on zero at the
 * right moment.
 */
export default function IntermissionOverlay({ song, playAt, onDone }) {
  const [count, setCount] = useState(() =>
    Math.max(0, Math.ceil((playAt - Date.now()) / 1000)),
  );
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const tick = () => {
      const left = playAt - Date.now();
      if (left <= 0) {
        if (!done.current) {
          done.current = true;
          onDoneRef.current();
        }
        return;
      }
      setCount(Math.ceil(left / 1000));
    };

    tick();
    const timer = setInterval(tick, 150);
    return () => clearInterval(timer);
  }, [playAt]);

  return (
    <div className="intermission" role="status" aria-live="assertive">
      <p className="im-kicker">Up next</p>
      <h2 className="im-name">Get ready, {song.singerName}! 🎤</h2>
      <div key={count} className="im-count">
        {count}
      </div>
      <p className="im-song">{song.title}</p>
    </div>
  );
}
