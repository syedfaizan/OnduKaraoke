/**
 * The shared queue.
 *
 * Shown on the right of the host screen AND on the phone's "Queue" tab.
 * The first item is always "Up next" because the server keeps the queue in
 * fair play order (snake draft — see server/rooms.js).
 */
export default function QueuePanel({
  current,
  queue = [],
  myId = null,
  isHost = false,
  onRemove,
  onMove,
  onSkip,
  variant = 'host',
}) {
  return (
    <section className={`queue-panel queue-${variant}`}>
      {variant === 'host' && <h2 className="panel-title">Queue</h2>}

      {current && (
        <div className="queue-item now-singing">
          <img className="q-thumb" src={current.thumbnail} alt="" />
          <div className="q-info">
            <span className="q-status">Now singing 🎤</span>
            <span className="q-title">{current.title}</span>
            <span className="q-singer">
              {current.singerName} <span className="q-reactions">❤️ {current.reactions || 0}</span>
            </span>
          </div>

          {onSkip && (
            <div className="q-actions">
              <button type="button" onClick={onSkip} aria-label="Skip this song" title="Skip this song">
                ⏭
              </button>
            </div>
          )}
        </div>
      )}

      {queue.length === 0 && !current && (
        <p className="queue-empty">Queue&apos;s empty — scan the QR and add songs! 🎶</p>
      )}

      <ol className="queue-list">
        {queue.map((song, index) => {
          const mine = myId && song.singerId === myId;
          return (
            <li key={song.id} className={`queue-item ${index === 0 ? 'up-next' : ''}`}>
              <img className="q-thumb" src={song.thumbnail} alt="" />
              <div className="q-info">
                {index === 0 && <span className="q-status next">Up next ⏭</span>}
                <span className="q-title">{song.title}</span>
                <span className="q-singer">
                  🎤 {song.singerName}
                  {mine && <span className="q-mine"> (you)</span>}
                </span>
              </div>

              {(isHost || mine) && (
                <div className="q-actions">
                  {isHost && onMove && (
                    <>
                      <button type="button" onClick={() => onMove(song.id, -1)} aria-label="Move up">
                        ▲
                      </button>
                      <button type="button" onClick={() => onMove(song.id, 1)} aria-label="Move down">
                        ▼
                      </button>
                    </>
                  )}
                  {onRemove && (
                    <button type="button" onClick={() => onRemove(song.id)} aria-label="Remove song">
                      ✕
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
