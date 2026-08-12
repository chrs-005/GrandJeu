import { useState } from 'react';
import { gameAction } from '../../services/api';
import { useStepCounter, isMotionSupported, requestMotionPermission } from '../../hooks/useStepCounter';

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
  const ownRank = challenge.ranking?.findIndex((entry) => entry.uid === user.uid) ?? -1;

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

      {finished && (
        <div className="alert alert-info">
          Course terminée. Ton compte final a été envoyé aux administrateurs.
          <button className="btn btn-ghost btn-sm" onClick={refresh} type="button">
            Actualiser
          </button>
        </div>
      )}

      {finished && challenge.ranking?.length > 0 && (
        <div className="steps-final">
          <div className="trivia-rank-big">
            {ownRank >= 0 ? `${ownRank + 1}${ownRank === 0 ? 'er' : 'e'}` : '—'}
          </div>
          <p>Classement final</p>
          <ol className="mini-board">
            {challenge.ranking.map((entry, index) => (
              <li className={entry.uid === user.uid ? 'is-me' : ''} key={entry.uid}>
                <span>{index + 1}. {entry.username}</span>
                <strong>{entry.steps || 0} pas</strong>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
