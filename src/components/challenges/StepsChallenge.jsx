import { useState } from 'react';
import { gameAction } from '../../services/api';
import { useStepCounter, isMotionSupported, requestMotionPermission } from '../../hooks/useStepCounter';
import { teamInfo } from '../../config/gameConfig';

export default function StepsChallenge({ user, challenge, now, serverNow, refresh }) {
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [error, setError] = useState('');

  const steps = useStepCounter({
    enabled: motionEnabled,
    challenge,
    serverNow,
    initialSteps: challenge.ownSteps || 0,
    onSave: (count) =>
      gameAction(user, 'steps', { challengeId: challenge.id, steps: count }).catch((err) =>
        setError(err.message)
      ),
  });

  async function enableMotion() {
    setError('');
    try {
      await requestMotionPermission();
      setMotionEnabled(true);
    } catch (err) {
      setError(err.message || 'Impossible d’activer le capteur.');
    }
  }

  const running = challenge.status === 'active' && now >= challenge.startAtMs && now < challenge.endAtMs;
  const finished = challenge.status === 'ended' || now >= challenge.endAtMs;
  const shownSteps = Math.max(steps, challenge.ownSteps || 0);

  return (
    <div className="steps-challenge">
      {!motionEnabled && !finished && (
        <div className="ritual-box">
          <p>
            {isMotionSupported()
              ? 'Active le capteur de pas pour que Hermès compte ta course !'
              : 'Capteur de mouvement non supporté sur cet appareil.'}
          </p>
          <button className="btn btn-primary" disabled={!isMotionSupported()} onClick={enableMotion} type="button">
            ⚡ Activer le capteur de pas
          </button>
        </div>
      )}

      <div className="steps-counter">
        <span className="steps-value">{shownSteps}</span>
        <span className="steps-label">pas</span>
      </div>

      {running && motionEnabled && <p className="hint-live">Garde le téléphone en main et cours !</p>}
      {error && <div className="alert alert-error">{error}</div>}

      {challenge.leaderboardHidden ? (
        <div className="veiled-board">
          <span className="veiled-icon">🌫️</span>
          <p>Les Moires ont voilé le classement…</p>
          <p className="veiled-sub">Tout se joue maintenant. Courez !</p>
        </div>
      ) : (
        challenge.leaderboard && (
          <ol className="mini-board">
            {challenge.leaderboard.map((entry, index) => {
              const info = teamInfo(entry.username);
              return (
                <li className={entry.uid === user.uid ? 'is-me' : ''} key={entry.uid}>
                  <span>
                    {index + 1}. {info.emblem} {info.title}
                  </span>
                  <strong>{entry.steps} pas</strong>
                </li>
              );
            })}
          </ol>
        )
      )}

      {finished && (
        <div className="alert alert-info">
          La course est terminée. Hermès rend son verdict — les points arrivent !
          <button className="btn btn-ghost btn-sm" onClick={refresh} type="button">
            Actualiser
          </button>
        </div>
      )}
    </div>
  );
}
