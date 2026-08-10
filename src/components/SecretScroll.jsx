import { useEffect, useState } from 'react';
import { gameAction } from '../services/api';

// The unrolled parchment: fetches the hidden riddle (kept off the normal poll
// so it can't be read before the owl is found) and takes the answer.
export default function SecretScroll({ user, onClose, onSolved }) {
  const [secret, setSecret] = useState(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    gameAction(user, 'secret-open', {})
      .then(setSecret)
      .catch(() => setError('Le parchemin refuse de s’ouvrir…'));
  }, [user]);

  async function submit(e) {
    e.preventDefault();
    if (!answer.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const result = await gameAction(user, 'secret-answer', { answer: answer.trim() });
      setFeedback(result);
      if (result.correct) onSolved?.();
      else setAnswer('');
    } catch (err) {
      setError(err.message || 'Envoi impossible.');
    } finally {
      setSending(false);
    }
  }

  const solved = secret?.solved || feedback?.correct || feedback?.alreadySolved;

  return (
    <div className="scroll-overlay" onClick={onClose}>
      <div className="scroll-parchment" onClick={(e) => e.stopPropagation()}>
        <span className="scroll-seal">🦉</span>
        <h2 className="scroll-title">Le Secret de la Chouette</h2>

        {!secret && !error && <p className="hint-live">Le parchemin se déroule…</p>}
        {secret?.inactive && (
          <p className="scroll-riddle">La chouette n’a rien à révéler… pour l’instant.</p>
        )}

        {secret?.text && (
          <>
            <blockquote className="scroll-riddle">{secret.text}</blockquote>

            {solved ? (
              <div className="reveal-banner reveal-good">
                ✅ Secret percé !
                {(feedback?.points || secret.wonPoints) > 0 &&
                  ` +${feedback?.points || secret.wonPoints} pts`}
                {feedback?.rank === 1 && ' — première équipe, points doublés !'}
              </div>
            ) : (
              <>
                <form className="guess-form" onSubmit={submit}>
                  <input
                    disabled={sending}
                    maxLength={120}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Ta réponse…"
                    type="text"
                    value={answer}
                  />
                  <button className="btn btn-primary" disabled={sending || !answer.trim()} type="submit">
                    {sending ? '…' : 'Répondre'}
                  </button>
                </form>
                {feedback && feedback.correct === false && (
                  <div className="reveal-banner reveal-bad">
                    ❌ La chouette secoue la tête. ({feedback.attempts} essai
                    {feedback.attempts > 1 ? 's' : ''})
                  </div>
                )}
                {secret.hint && <p className="scroll-hint">💡 {secret.hint}</p>}
                <p className="scroll-hint">
                  Personne d’autre ne sait que ce parchemin existe. Gardez-le pour vous…
                </p>
              </>
            )}
          </>
        )}

        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-ghost btn-sm" onClick={onClose} type="button">
          Fermer
        </button>
      </div>
    </div>
  );
}
