import { challengeMeta } from '../config/gameConfig';
import Countdown from './Countdown';

// Immersive challenge page: the god's full painted artboard is a fixed backdrop
// (frame + illustration), the god plaque + timer are overlaid on the scene, and
// `children` float on the parchment zone below.
export default function ChallengeShell({ challenge, now, children, showTimer = true }) {
  const meta = challengeMeta(challenge.type);
  const started = now >= challenge.startAtMs;

  return (
    <section className={`challenge-shell challenge-${challenge.type}`}>
      <header className="challenge-header">
        <div className="challenge-scene-shade" />
        <div className="challenge-heading">
          <span className="challenge-god">{meta.god}</span>
          <h2 className="challenge-title">{meta.title}</h2>
          <p className="challenge-tagline">{meta.tagline}</p>
        </div>
        {started && showTimer && <Countdown endAtMs={challenge.endAtMs} now={now} />}
      </header>

      {!started && challenge.status === 'active' && (
        <div className="challenge-starting">
          <Countdown endAtMs={challenge.startAtMs} now={now} label="Début dans" warningMs={0} />
        </div>
      )}

      <div className="challenge-body">{children}</div>
    </section>
  );
}
