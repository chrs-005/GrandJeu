import { useState } from 'react';
import { gameAction } from '../../services/api';

export default function RiddleChallenge({ user, challenge, now, refresh }) {
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState(null); // { correct, points, first }
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const running = challenge.status === 'active' && now >= challenge.startAtMs && now < challenge.endAtMs;
  const solved = challenge.solved || feedback?.correct;

  async function submit(e) {
    e.preventDefault();
    if (!answer.trim()) return;
    setSending(true);
    setError('');
    try {
      const result = await gameAction(user, 'riddle-answer', {
        challengeId: challenge.id,
        answer: answer.trim(),
      });
      setFeedback(result);
      if (result.correct) await refresh();
      else setAnswer('');
    } catch (err) {
      setError(err.message || 'Envoi impossible.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="riddle-challenge">
      <blockquote className="riddle-text">
        <span className="riddle-sphinx">🦁</span>
        {challenge.text}
      </blockquote>

      {solved ? (
        <div className="riddle-solved">
          <div className="reveal-banner reveal-good">
            ✅ Le Sphinx s’incline ! {challenge.wonPoints || feedback?.points ? `+${challenge.wonPoints || feedback.points} pts` : ''}
          </div>
          {feedback?.first && <p className="points-chip">🏆 Premiers à répondre !</p>}
        </div>
      ) : running ? (
        <>
          <form className="guess-form" onSubmit={submit}>
            <input
              disabled={sending}
              maxLength={120}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Votre réponse au Sphinx…"
              type="text"
              value={answer}
            />
            <button className="btn btn-primary" disabled={sending || !answer.trim()} type="submit">
              {sending ? '…' : 'Répondre'}
            </button>
          </form>
          {feedback && !feedback.correct && (
            <div className="reveal-banner reveal-bad">
              ❌ « Faux ! » gronde le Sphinx. ({feedback.attempts} essai{feedback.attempts > 1 ? 's' : ''})
            </div>
          )}
        </>
      ) : (
        <div className="alert alert-info">Le Sphinx s’est envolé. L’énigme est close.</div>
      )}

      <p className="hint-live">
        {challenge.solvedCount || 0} équipe{(challenge.solvedCount || 0) > 1 ? 's ont' : ' a'} résolu
        l’énigme.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
