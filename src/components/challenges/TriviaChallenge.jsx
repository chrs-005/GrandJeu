import { useState } from 'react';
import { gameAction } from '../../services/api';
import { formatRemaining } from '../../hooks/useNow';

const OPTION_STYLES = ['option-a', 'option-b', 'option-c', 'option-d'];
const OPTION_ICONS = ['🔺', '🔷', '🟡', '🟢'];

function questionKind(question) {
  return question.type || 'choice';
}

function answerStatusText(answer) {
  if (!answer) return 'Pas de réponse...';
  if (answer.status === 'pending') return 'Réponse envoyée, en validation.';
  if (answer.correct) return 'Correct !';
  if (answer.status === 'rejected') return 'Refusé.';
  return 'Raté...';
}

// Kahoot-style synchronized quiz. The timeline lives in the challenge config;
// every phone computes the current question from the shared server clock.
export default function TriviaChallenge({ user, challenge, now, refresh }) {
  const [pending, setPending] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState('');

  const questions = challenge.questions || [];
  const ownAnswers = challenge.ownAnswers || {};

  const currentIndex = questions.findIndex((q) => now >= q.startAtMs && now < q.endAtMs);
  const nextQuestion = questions.find((q) => now < q.startAtMs);
  const finished = now >= challenge.endAtMs || challenge.status === 'ended';

  async function submit(question, payload) {
    if (pending || ownAnswers[question.index]) return;
    setPending(true);
    setError('');
    try {
      await gameAction(user, 'trivia-answer', {
        challengeId: challenge.id,
        questionIndex: question.index,
        ...payload,
      });
      await refresh();
    } catch (err) {
      setError(err.message || 'Réponse refusée.');
    } finally {
      setPending(false);
    }
  }

  function submitText(question) {
    const text = String(drafts[question.index]?.text || '').trim();
    if (!text) {
      setError('Écris une réponse avant de valider.');
      return;
    }
    submit(question, { text });
  }

  function submitList(question) {
    const slots = question.slots || 1;
    const items = Array.from({ length: slots }, (_, index) =>
      String(drafts[question.index]?.items?.[index] || '').trim()
    );
    if (items.some((item) => !item)) {
      setError(`Remplis les ${slots} cases avant de valider.`);
      return;
    }
    submit(question, { items });
  }

  function setListDraft(question, index, value) {
    setDrafts((prev) => {
      const current = prev[question.index]?.items || [];
      const next = [...current];
      next[index] = value;
      return { ...prev, [question.index]: { ...prev[question.index], items: next } };
    });
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
          {correctCount} réponse{correctCount > 1 ? 's' : ''} validée{correctCount > 1 ? 's' : ''} sur{' '}
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
        <p className="oracle-quote">« Les vapeurs sacrées s’élèvent... »</p>
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
    const revealClass = !own
      ? 'reveal-none'
      : own.correct
        ? 'reveal-good'
        : own.status === 'pending'
          ? 'reveal-none'
          : 'reveal-bad';
    return (
      <div className="trivia-reveal">
        {lastFinished && (
          <>
            <p className="trivia-question-text">{lastFinished.q}</p>
            <div className={`reveal-banner ${revealClass}`}>
              {answerStatusText(own)}
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
  const kind = questionKind(question);
  const own = ownAnswers[question.index];
  const answered = Boolean(own) || pending;
  const slots = question.slots || 1;

  return (
    <div className="trivia-active">
      <div className="trivia-progress">
        <span className="trivia-count">Question {currentIndex + 1}/{questions.length}</span>
        <span className="trivia-timer">{formatRemaining(question.endAtMs - now)}</span>
      </div>
      <p className="trivia-question-text">{question.q}</p>

      {kind === 'choice' && (
        <div className="trivia-options">
          {(question.options || []).map((option, i) => {
            const isChosen = own?.choice === i || drafts[question.index]?.choice === i;
            return (
              <button
                className={`trivia-option ${OPTION_STYLES[i]} ${isChosen ? 'is-chosen' : ''} ${answered && !isChosen ? 'is-dimmed' : ''}`}
                disabled={answered}
                key={option}
                onClick={() => {
                  setDrafts((prev) => ({ ...prev, [question.index]: { choice: i } }));
                  submit(question, { choice: i });
                }}
                type="button"
              >
                <span className="option-icon">{OPTION_ICONS[i]}</span>
                {option}
              </button>
            );
          })}
        </div>
      )}

      {kind === 'text' && (
        <div className="trivia-written">
          <textarea
            disabled={answered}
            maxLength={1000}
            onChange={(event) =>
              setDrafts((prev) => ({ ...prev, [question.index]: { text: event.target.value } }))
            }
            placeholder="Écris ta réponse..."
            rows={6}
            value={drafts[question.index]?.text || ''}
          />
          <button className="btn btn-primary" disabled={answered} onClick={() => submitText(question)} type="button">
            Valider
          </button>
        </div>
      )}

      {kind === 'list' && (
        <div className="trivia-written">
          <div className="trivia-list-inputs">
            {Array.from({ length: slots }, (_, index) => (
              <input
                disabled={answered}
                key={index}
                maxLength={160}
                onChange={(event) => setListDraft(question, index, event.target.value)}
                placeholder={`${index + 1}.`}
                type="text"
                value={drafts[question.index]?.items?.[index] || ''}
              />
            ))}
          </div>
          <button className="btn btn-primary" disabled={answered} onClick={() => submitList(question)} type="button">
            Valider
          </button>
        </div>
      )}

      {answered && <p className="hint-live">Réponse verrouillée. L’Oracle délibère...</p>}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
