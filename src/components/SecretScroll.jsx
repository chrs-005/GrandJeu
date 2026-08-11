import { useEffect, useState } from 'react';
import { gameAction } from '../services/api';

const MAP_URL = 'https://maps.app.goo.gl/2FK2KBe7kycKC3R18?g_st=iw';
const LOCATION_LABEL = '33.8568304, 35.7256696';

export default function SecretScroll({ user, onClose, onSolved }) {
  const [secret, setSecret] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    gameAction(user, 'secret-open', {})
      .then((result) => {
        setSecret(result);
        if (!result.inactive) onSolved?.();
      })
      .catch(() => setError('Le parchemin refuse de s’ouvrir…'));
  }, [onSolved, user]);

  const inactive = secret?.inactive;

  return (
    <div className="scroll-overlay" onClick={onClose}>
      <div className="scroll-parchment" onClick={(e) => e.stopPropagation()}>
        <span className="scroll-seal">🦉</span>

        {inactive ? (
          <p className="scroll-location">La chouette n’a rien à révéler… pour l’instant.</p>
        ) : (
          <a
            className="scroll-location"
            href={secret?.mapUrl || MAP_URL}
            rel="noreferrer"
            target="_blank"
          >
            {secret?.location || LOCATION_LABEL}
          </a>
        )}

        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-ghost btn-sm" onClick={onClose} type="button">
          Fermer
        </button>
      </div>
    </div>
  );
}
