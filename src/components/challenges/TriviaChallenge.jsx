import { useState } from 'react';
import { gameAction } from '../../services/api';
import { formatRemaining } from '../../hooks/useNow';

const OPTION_STYLES = ['option-a', 'option-b', 'option-c', 'option-d'];
const OPTION_ICONS = ['🔺', '🔷', '🟡', '🟢'];

// Kahoot-style synchronized quiz. The timeline lives in the challenge config;
// every phone computes the current question from the shared server clock.
export default function TriviaChallenge({ user, challenge, now, refresh }) {
  const [pendingChoice, setPendingChoice] = useState(null);
  const [error, setError] = useState('');

  const questions = challenge.questions || [];
  const ownAnswers = challenge.ownAnswers || {};

  const currentIndex = questions.findIndex((q) => now >= q.startAtMs && now < q.endAtMs);
  const nextQuestion = questions.find((q) => now < q.startAtMs);
  const finished = now >= challenge.endAtMs || challenge.status === 'ended';

  async function answer(question, choice) {
    if (pendingChoice != null || ownAnswers[question.index]) return;
    setPendingChoice(choice);
    setError('');
    try {
      await gameAction(user, 'trivia-answer', {
        challengeId: challenge.id,
        questionIndex: question.index,
        choice,
      });
      await refresh();
    } catch (err) {
      setError(err.message || 'Réponse refusée.');
    } finally {
      setPendingChoice(null);
    }
  }

  // -------------------------------------------------------------------------
  if (finished) {
    const correctCount = Object.values(ownAnswers).filter((a) => a.correct).length;
    const ownRank = challenge.ranking?.findIndex((entry) => entry.uid === user.uid) ?? -1;
    return (
      <div className="trivia-final">
        <p className="oracle-quote">« L’Oracle a parlé. »</p>
        <div className="trivia-rank-big">
          {ownRank >= 0 ? `${ownRank + 1}${ownRank === 0 ? 'er' : 'e'}` : '—'}
        </div>
        <p>Classement final</p>
        <p>
          {correctCount} bonne{correctCount > 1 ? 's' : ''} réponse{correctCount > 1 ? 's' : ''} sur{' '}
          {questions.length}
        </p>
        {challenge.ranking?.length > 0 && (
          <ol className="mini-board">
            {challenge.ranking.map((entry, index) => (
              <li className={entry.uid === user.uid ? 'is-me' : ''} key={entry.uid}>
                <span>{index + 1}. {entry.username}</span>
                <strong>{entry.correct}/{questions.length}</strong>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  // Lobby before the first question.
  if (currentIndex === -1 && nextQuestion && questions.indexOf(nextQuestion) === 0) {
    return (
      <div className="trivia-lobby">
        <p className="oracle-quote">« Les vapeurs sacrées s’élèvent… »</p>
        <p>
          Première question dans <strong>{formatRemaining(nextQuestion.startAtMs - now)}</strong>
        </p>
        <p className="hint-live">Les bonnes réponses comptent, puis la rapidité départage les équipes.</p>
      </div>
    );
  }

  // Reveal window between two questions.
  if (currentIndex === -1) {
    const lastFinished = [...questions].reverse().find((q) => now >= q.endAtMs);
    const own = lastFinished ? ownAnswers[lastFinished.index] : null;
    return (
      <div className="trivia-reveal">
        {lastFinished && (
          <>
            <p className="trivia-question-text">{lastFinished.q}</p>
            <div className={`reveal-banner ${own?.correct ? 'reveal-good' : own ? 'reveal-bad' : 'reveal-none'}`}>
              {own?.correct
                ? '✅ Correct !'
                : own
                  ? '❌ Raté…'
                  : '⏳ Pas de réponse…'}
            </div>
            {lastFinished.correct != null && (
              <p className="reveal-answer">
                La réponse : <strong>{lastFinished.options[lastFinished.correct]}</strong>
              </p>
            )}
          </>
        )}
        {nextQuestion && (
          <p className="reveal-next">
            Question suivante dans {formatRemaining(nextQuestion.startAtMs - now)}
          </p>
        )}
      </div>
    );
  }

  // Active question.
  const question = questions[currentIndex];
  const own = ownAnswers[question.index];
  const answered = Boolean(own) || pendingChoice != null;

  return (
    <div className="trivia-active">
      <div className="trivia-progress">
        <span className="trivia-count">Question {currentIndex + 1}/{questions.length}</span>
        <span className="trivia-timer">{formatRemaining(question.endAtMs - now)}</span>
      </div>
      <p className="trivia-question-text">{question.q}</p>

      <div className="trivia-options">
        {question.options.map((option, i) => {
          const isChosen = own?.choice === i || pendingChoice === i;
          return (
            <button
              className={`trivia-option ${OPTION_STYLES[i]} ${isChosen ? 'is-chosen' : ''} ${answered && !isChosen ? 'is-dimmed' : ''}`}
              disabled={answered}
              key={i}
              onClick={() => answer(question, i)}
              type="button"
            >
              <span className="option-icon">{OPTION_ICONS[i]}</span>
              {option}
            </button>
          );
        })}
      </div>

      {answered && <p className="hint-live">Réponse verrouillée. L’Oracle délibère…</p>}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
