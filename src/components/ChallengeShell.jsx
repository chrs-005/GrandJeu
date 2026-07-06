import { challengeMeta } from '../config/gameConfig';
import Countdown from './Countdown';

// Themed wrapper around every challenge view: god header + timer + content.
export default function ChallengeShell({ challenge, now, children, showTimer = true }) {
  const meta = challengeMeta(challenge.type);
  const started = now >= challenge.startAtMs;

  return (
    <section className={`challenge-shell challenge-${challenge.type}`}>
      <header className="challenge-header">
        <div className="challenge-icon">{meta.icon}</div>
        <div className="challenge-heading">
          <span className="challenge-god">{meta.god}</span>
          <h2 className="challenge-title">{meta.title}</h2>
          <p className="challenge-tagline">{meta.tagline}</p>
        </div>
      </header>

      {!started && challenge.status === 'active' && (
        <div className="challenge-starting">
          <Countdown endAtMs={challenge.startAtMs} now={now} label="Début dans" warningMs={0} />
        </div>
      )}

      {started && showTimer && (
        <Countdown endAtMs={challenge.endAtMs} now={now} />
      )}

      <div className="challenge-body">{children}</div>
    </section>
  );
}
