import QueuePanel from '../QueuePanel.jsx';
import { socket } from '../../lib/realtime.js';

/**
 * Queue tab — what is playing, what is up next, and (for the host) the
 * controls: skip the current song, reorder the queue, remove an entry.
 */
export default function QueueTab({ state, me, roomCode, onToast }) {
  const isHost = Boolean(me?.isHost);

  const remove = (songId) => {
    socket.emit('queue:remove', { roomCode, songId }, (ack) => {
      if (!ack?.ok) onToast?.(ack?.error || 'Could not remove that song', 'error');
    });
  };

  const move = (songId, dir) => {
    socket.emit('queue:move', { roomCode, songId, dir }, (ack) => {
      if (!ack?.ok) onToast?.(ack?.error || 'Could not reorder', 'error');
    });
  };

  const skip = () => {
    socket.emit('song:skip', { roomCode }, (ack) => {
      if (!ack?.ok) onToast?.(ack?.error || 'Could not skip', 'error');
    });
  };

  return (
    <div className="tab-content">
      <p className="fair-note">🔄 Singers rotate automatically — everybody gets a turn.</p>

      <QueuePanel
        variant="phone"
        current={state?.current}
        queue={state?.queue || []}
        myId={me?.guestId}
        isHost={isHost}
        onRemove={remove}
        onMove={move}
        onSkip={isHost ? skip : undefined}
      />

      {!state?.partyStarted && (
        <p className="fair-note">⏳ The host hasn&apos;t started the party yet — add songs meanwhile!</p>
      )}
    </div>
  );
}
