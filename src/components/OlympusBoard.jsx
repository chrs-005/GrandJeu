import { teamInfo } from '../config/gameConfig';

const RANK_LABELS = ['🥇', '🥈', '🥉'];

// The Mount Olympus leaderboard: teams climb the mountain with their score.
export default function OlympusBoard({ teams, highlightUid }) {
  const maxScore = Math.max(1, ...teams.map((t) => t.score));

  return (
    <div className="olympus-board">
      <div className="olympus-sky">
        <div className="olympus-title">⚡ Mont Olympe ⚡</div>
        <svg className="olympus-mountain" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
          <polygon points="0,60 38,8 50,16 64,4 100,60" fill="var(--mountain)" />
          <polygon points="38,8 44,14 50,16 46,11" fill="var(--mountain-snow)" />
          <polygon points="64,4 58,12 70,14" fill="var(--mountain-snow)" />
        </svg>
        <div className="olympus-climbers">
          {teams.map((team) => {
            const info = teamInfo(team.username);
            const ratio = team.score / maxScore;
            return (
              <div
                className="olympus-climber"
                key={team.uid}
                style={{ bottom: `${8 + ratio * 78}%`, borderColor: info.color }}
                title={`${info.title} — ${team.score} pts`}
              >
                <span>{info.emblem}</span>
              </div>
            );
          })}
        </div>
      </div>

      <ol className="olympus-list">
        {teams.map((team, index) => {
          const info = teamInfo(team.username);
          return (
            <li
              className={`olympus-row ${team.uid === highlightUid ? 'is-me' : ''}`}
              key={team.uid}
              style={{ '--team-color': info.color }}
            >
              <span className="olympus-rank">{RANK_LABELS[index] || `${index + 1}.`}</span>
              <span className="olympus-emblem">{info.emblem}</span>
              <span className="olympus-name">
                {info.title}
                <small>{info.god}</small>
              </span>
              <span className="olympus-score">{team.score}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
