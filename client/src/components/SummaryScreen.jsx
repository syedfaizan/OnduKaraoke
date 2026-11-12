import { useEffect } from 'react';
import NeonTitle from './NeonTitle.jsx';
import { confettiCelebration } from '../lib/confetti.js';

/**
 * "Night summary" — shown when the host presses "End party".
 * Holds the three badges plus the final ranking.
 */
export default function SummaryScreen({ summary, onNewParty }) {
  useEffect(() => {
    confettiCelebration();
  }, []);

  const badges = summary?.badges || [];
  const leaderboard = summary?.leaderboard || [];
  const totals = summary?.totals || { songs: 0, reactions: 0 };

  return (
    <div className="summary">
      <NeonTitle size="xl" tagline="night summary 🌙" />

      <div className="summary-totals">
        <span className="total-chip">🎤 {totals.songs} songs sung</span>
        <span className="total-chip">💜 {totals.reactions} reactions</span>
      </div>

      {badges.length > 0 ? (
        <div className="badges">
          {badges.map((badge) => (
            <div key={badge.title} className="badge-card card">
              <div className="badge-emoji">{badge.emoji}</div>
              <div className="badge-title">{badge.title}</div>
              <div className="badge-winners">{badge.winners.join(' & ')}</div>
              <div className="badge-value">
                {badge.value} {badge.unit}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="summary-empty">No badges tonight — sing more next time! 😄</p>
      )}

      <section className="summary-board card">
        <h2 className="panel-title">Final ranking</h2>
        <ol className="summary-list">
          {leaderboard.map((singer, index) => (
            <li key={singer.id} className="lb-row">
              <span className="lb-medal">{['🥇', '🥈', '🥉'][index] || `${index + 1}.`}</span>
              <span className="lb-name">{singer.name}</span>
              <span className="lb-stats">
                🎤 {singer.songsSung} · ❤️ {singer.reactionsReceived} · 📣 {singer.reactionsSent}
              </span>
              <span className="lb-score">{singer.score}</span>
            </li>
          ))}
          {leaderboard.length === 0 && <li className="summary-empty">Nobody joined — shy crowd?</li>}
        </ol>
      </section>

      <button type="button" className="btn btn-cyan big" onClick={onNewParty}>
        🎉 Start a new party
      </button>
    </div>
  );
}
