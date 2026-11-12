/**
 * The glowing "Ondu Karaoke" wordmark.
 * Used on the host screen header, the join page and the night summary.
 * The neon look lives in CSS (see styles/neon.css).
 */
export default function NeonTitle({ size = 'lg', tagline }) {
  return (
    <div className={`neon-title ${size}`}>
      <h1 className="neon-words">
        <span className="nw pink">Ondu</span>
        <span className="nw cyan">Karaoke</span>
        <span className="nw mic" aria-hidden="true">
          🎤
        </span>
      </h1>
      {tagline && <p className="neon-tagline">{tagline}</p>}
    </div>
  );
}
