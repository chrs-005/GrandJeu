import { useState } from 'react';
import { gameAction } from '../../services/api';
import DrawingCanvas from '../DrawingCanvas';
import Countdown from '../Countdown';

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
          <div className="mission-box">
            <span className="mission-label">Les Muses vous inspirent :</span>
            <p className="mission-target">🎨 {challenge.prompt}</p>
            <p className="mission-detail">
              Dessinez — une autre équipe devra deviner ce que c’est. Pas de lettres ni de chiffres !
            </p>
          </div>
          <Countdown endAtMs={challenge.drawEndAtMs} now={now} label="Fin du dessin dans" />
          <DrawingCanvas
            disabled={now < challenge.startAtMs}
            submitted={challenge.drawingSubmitted}
            onSubmit={submitDrawing}
            resetKey={challenge.id}
          />
          {challenge.drawingSubmitted && (
            <p className="hint-live">Tu peux encore modifier et renvoyer avant la fin du temps.</p>
          )}
        </>
      )}

      {phase === 'guess' && (
        <>
          <div className="mission-box">
            <span className="mission-label">Une fresque mystérieuse vous parvient…</span>
            <p className="mission-detail">Que représente ce dessin ? Répondez avant la fin du temps !</p>
          </div>
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
