import { useState } from 'react';
import { gameAction } from '../../services/api';
import { formatRemaining } from '../../hooks/useNow';
import DrawingCanvas from '../DrawingCanvas';

// Gartic-phone style: phase 1 each team draws its prompt, phase 2 each team
// guesses another team's drawing.
export default function DrawGuessChallenge({ user, challenge, now, refresh }) {
  const [guess, setGuess] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function submitDrawing(imageDataUrl) {
    setError('');
    try {
      await gameAction(user, 'drawing', { challengeId: challenge.id, imageDataUrl });
      setStatus('Les Muses ont reçu votre œuvre !');
      await refresh();
    } catch (err) {
      setError(err.message || 'Envoi impossible.');
    }
  }

  async function submitGuess(e) {
    e.preventDefault();
    if (!guess.trim()) return;
    setSending(true);
    setError('');
    try {
      await gameAction(user, 'guess', { challengeId: challenge.id, guess: guess.trim() });
      setStatus('Réponse envoyée !');
      await refresh();
    } catch (err) {
      setError(err.message || 'Envoi impossible.');
    } finally {
      setSending(false);
    }
  }

  const { phase } = challenge;

  return (
    <div className="drawguess-challenge">
      {phase === 'draw' && (
        <>
          <div className="draw-prompt">
            <span className="draw-prompt-word">🎨 {challenge.prompt}</span>
            <span className="draw-deadline">✎ {formatRemaining(challenge.drawEndAtMs - now)}</span>
          </div>
          <DrawingCanvas
            disabled={now < challenge.startAtMs}
            submitted={challenge.drawingSubmitted}
            onSubmit={submitDrawing}
            resetKey={challenge.id}
          />
        </>
      )}

      {phase === 'guess' && (
        <>
          {challenge.sourceDrawing ? (
            <img alt="Dessin à deviner" className="guess-drawing" src={challenge.sourceDrawing} />
          ) : (
            <div className="alert alert-info">
              L’autre équipe n’a pas terminé son œuvre… Les Muses sont déçues.
            </div>
          )}
          <form className="guess-form" onSubmit={submitGuess}>
            <input
              disabled={sending}
              maxLength={120}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Votre réponse…"
              type="text"
              value={guess}
            />
            <button className="btn btn-primary" disabled={sending || !guess.trim()} type="submit">
              {sending ? 'Envoi…' : 'Deviner'}
            </button>
          </form>
          {challenge.ownGuess && (
            <p className="hint-live">
              Réponse actuelle : <strong>{challenge.ownGuess}</strong> (tu peux la changer)
            </p>
          )}
        </>
      )}

      {phase === 'done' && (
        <div className="drawguess-results">
          <p className="oracle-quote">« Les Muses contemplent les œuvres… »</p>
          {challenge.sourceDrawing && (
            <img alt="Dessin deviné" className="guess-drawing" src={challenge.sourceDrawing} />
          )}
          <div className="result-lines">
            {challenge.sourcePrompt && (
              <p>
                C’était : <strong>{challenge.sourcePrompt}</strong>
              </p>
            )}
            <p>
              Votre réponse : <strong>{challenge.ownGuess || '—'}</strong>
            </p>
            {challenge.guessResult != null && challenge.guessResult > 0 && (
              <p className="points-chip">+{challenge.guessResult} pts</p>
            )}
          </div>
        </div>
      )}

      {status && <div className="alert alert-success">{status}</div>}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
