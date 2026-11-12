/**
 * Live ranking for the night.
 * Score = 10 points per song sung + 1 point per reaction received.
 */
export default function Leaderboard({ singerStats = [] }) {
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <section className="leaderboard card">
      <h2 className="panel-title">Leaderboard</h2>

      {singerStats.length === 0 ? (
        <p className="lb-empty">Nobody&apos;s singing yet — invite the crowd! 📣</p>
      ) : (
        <ol className="lb-list">
          {singerStats.slice(0, 6).map((singer, index) => (
            <li key={singer.id} className={`lb-row ${index === 0 ? 'top' : ''}`}>
              <span className="lb-medal">{medals[index] || `${index + 1}.`}</span>
              <span className="lb-name">{singer.name}</span>
              <span className="lb-stats">
                🎤 {singer.songsSung} · ❤️ {singer.reactionsReceived}
              </span>
              <span className="lb-score">{singer.score}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
