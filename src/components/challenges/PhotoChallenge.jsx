import { useState } from 'react';
import { gameAction } from '../../services/api';
import PhotoCapture from '../PhotoCapture';

const STATUS_LABELS = {
  pending: { text: '⏳ En attente du jugement des dieux', cls: 'badge-neutral' },
  valid: { text: '✅ Validée par les dieux', cls: 'badge-success' },
  rejected: { text: '❌ Refusée…', cls: 'badge-error' },
};

// Shared view for "bounty" (Méduse) and "photo" (Héraclès) challenges.
export default function PhotoChallenge({ user, challenge, now, refresh }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const running = challenge.status === 'active' && now >= challenge.startAtMs && now < challenge.endAtMs;
  const own = challenge.ownSubmission;
  const statusInfo = own ? STATUS_LABELS[own.status] || STATUS_LABELS.pending : null;

  async function submit(imageDataUrl) {
    setError('');
    setStatus('');
    try {
      await gameAction(user, 'photo', { challengeId: challenge.id, imageDataUrl });
      setStatus('Photo envoyée aux dieux !');
      await refresh();
    } catch (err) {
      setError(err.message || 'Envoi impossible.');
      throw err;
    }
  }

  return (
    <div className="photo-challenge">
      <div className="mission-box">
        {challenge.type === 'bounty' ? (
          <>
            <span className="mission-label">Méduse a pris possession de :</span>
            <p className="mission-target">🐍 {challenge.target}</p>
          </>
        ) : (
          <>
            <span className="mission-label">Votre travail :</span>
            <p className="mission-target">{challenge.mission}</p>
          </>
        )}
      </div>

      {own && statusInfo && (
        <div className="submission-status">
          <span className={`badge ${statusInfo.cls}`}>{statusInfo.text}</span>
          {own.points > 0 && <span className="points-chip">+{own.points} pts</span>}
        </div>
      )}

      {running ? (
        <PhotoCapture
          disabled={!running}
          submitted={Boolean(own)}
          onSubmit={submit}
          buttonLabel={challenge.type === 'bounty' ? '🛡️ Pétrifier la cible !' : '📷 Prouver l’exploit'}
        />
      ) : (
        <div className="alert alert-info">
          {own ? 'L’épreuve est close. Les dieux délibèrent…' : 'Trop tard, l’épreuve est close.'}
        </div>
      )}

      {status && <div className="alert alert-success">{status}</div>}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
