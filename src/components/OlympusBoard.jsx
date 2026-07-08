import { teamInfo } from '../config/gameConfig';
import olympusImg from '../assets/bg-home.jpg';

const RANK_LABELS = ['🥇', '🥈', '🥉'];

// The Mount Olympus leaderboard: teams climb the amphora mountain with their score.
export default function OlympusBoard({ teams, highlightUid }) {
  const maxScore = Math.max(1, ...teams.map((t) => t.score));

  return (
    <div className="olympus-board">
      <div className="olympus-sky">
        <img alt="Mont Olympe" className="olympus-art" src={olympusImg} />
        <div className="olympus-title">Mont Olympe</div>
        <div className="olympus-climbers">
          {teams.map((team) => {
            const info = teamInfo(team.username);
            const ratio = team.score / maxScore;
            return (
              <div
                className="olympus-climber"
                key={team.uid}
                style={{ bottom: `${8 + ratio * 56}%`, borderColor: info.color }}
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
