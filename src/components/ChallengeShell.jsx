import { formatRemaining } from '../hooks/useNow';
import Countdown from './Countdown';

// Immersive challenge page: the god's painted artboard is the fixed backdrop.
// No title plaque (the bottom tab already names the challenge) — just a small
// transparent timer up top and the challenge content filling the parchment
// below the illustration.
export default function ChallengeShell({ challenge, now, children, showTimer = true }) {
  const started = now >= challenge.startAtMs;

  return (
    <section className={`challenge-shell challenge-${challenge.type}`}>
      {started && showTimer && (
        <div className="challenge-timer-top">{formatRemaining(challenge.endAtMs - now)}</div>
      )}

      <div className="challenge-header challenge-scene" />

      {!started && challenge.status === 'active' && (
        <div className="challenge-starting">
          <Countdown endAtMs={challenge.startAtMs} now={now} label="Début dans" warningMs={0} />
        </div>
      )}

      <div className="challenge-body">{children}</div>
    </section>
  );
}
