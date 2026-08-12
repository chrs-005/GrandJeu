import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDefis, gameAction } from '../services/api';
import { uploadSubmission } from '../services/upload';
import { formatRemaining } from '../hooks/useNow';

const REFRESH_MS = 6_000; // admin changes and sheet edits land within seconds

const STATUS = {
  pending: { label: '⏳ En attente du jugement', cls: 'is-pending' },
  valid: { label: '✅ Validé', cls: 'is-valid' },
  rejected: { label: '❌ Refusé', cls: 'is-rejected' },
};

const MEDIA_LABEL = { photo: '📷 Photo', video: '🎥 Vidéo', any: '📷 Photo ou 🎥 vidéo' };

function DefiCard({ defi, now, onOpen, index }) {
  const status = defi.submission ? STATUS[defi.submission.status] || STATUS.pending : null;
  const remaining = defi.hot ? defi.hotEndAtMs - now : 0;

  return (
    <button
      className={`defi-card ${defi.hot ? 'is-hot' : ''} ${status ? status.cls : ''}`}
      onClick={() => onOpen(defi)}
      style={{ '--tilt': `${(index % 2 ? 0.35 : -0.35).toFixed(2)}deg` }}
      type="button"
    >
      {defi.hot && (
        <span className="defi-flame">
          🔥 Brûlant · {formatRemaining(remaining)}
        </span>
      )}

      <span className="defi-body">
        {defi.category && <span className="defi-cat">{defi.category}</span>}
        <span className="defi-title">{defi.title}</span>
        {defi.description && <span className="defi-desc">{defi.description}</span>}
        <span className="defi-foot">
          <span className="defi-media">{MEDIA_LABEL[defi.media] || MEDIA_LABEL.any}</span>
          {status && (
            <span className="defi-status">
              {status.label}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function SubmitSheet({ user, defi, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const accept =
    defi.media === 'photo' ? 'image/*' : defi.media === 'video' ? 'video/*' : 'image/*,video/*';

  async function send(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setProgress(0);
    try {
      const media = await uploadSubmission(user, defi.id, file, setProgress);
      await gameAction(user, 'defi-submit', { challengeId: defi.id, ...media });
      onDone();
    } catch (err) {
      setError(err.message || 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="defi-sheet-overlay" onClick={busy ? undefined : onClose}>
      <div className="defi-sheet" onClick={(e) => e.stopPropagation()}>
        {defi.hot && <span className="defi-sheet-hot">🔥 Défi brûlant</span>}
        <h2 className="defi-sheet-title">{defi.title}</h2>
        {defi.description && <p className="defi-sheet-desc">{defi.description}</p>}

        {defi.submission && (
          <div className="defi-sheet-current">
            {defi.submission.mediaType === 'video' ? (
              <video className="defi-preview" controls playsInline src={defi.submission.mediaUrl} />
            ) : (
              <img alt="Ta preuve" className="defi-preview" src={defi.submission.mediaUrl} />
            )}
            <span className="defi-status">
              {(STATUS[defi.submission.status] || STATUS.pending).label}
            </span>
          </div>
        )}

        {busy ? (
          <div className="defi-progress">
            <div className="defi-progress-bar" style={{ width: `${progress}%` }} />
            <span>{progress < 100 ? `Envoi… ${progress}%` : 'Presque fini…'}</span>
          </div>
        ) : (
          <div className="defi-sheet-actions">
            <button className="btn btn-primary" onClick={() => cameraRef.current?.click()} type="button">
              {defi.media === 'video' ? '🎥 Filmer' : '📷 Prendre'}
            </button>
            <button className="btn btn-secondary" onClick={() => galleryRef.current?.click()} type="button">
              🖼️ Galerie
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose} type="button">
              Fermer
            </button>
          </div>
        )}

        <input
          accept={accept}
          capture="environment"
          hidden
          onChange={(e) => send(e.target.files?.[0])}
          ref={cameraRef}
          type="file"
        />
        <input
          accept={accept}
          hidden
          onChange={(e) => send(e.target.files?.[0])}
          ref={galleryRef}
          type="file"
        />

        {error && <div className="alert alert-error">{error}</div>}
        {defi.submission && !busy && (
          <p className="defi-sheet-hint">Tu peux renvoyer une nouvelle preuve : elle remplacera l’ancienne.</p>
        )}
      </div>
    </div>
  );
}

export default function DefisScreen({ user, now }) {
  const [defis, setDefis] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchDefis(user);
      setDefis(result.defis || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Impossible de charger les défis.');
    }
  }, [user]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    // Timers freeze while the PWA is backgrounded — refresh on return.
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Keep the open sheet in sync with refreshed data (status, hot countdown).
  const openDefi = open ? defis?.find((d) => d.id === open.id) || open : null;

  const done = (defis || []).filter((d) => d.submission).length;

  return (
    <div className="defis-screen">
      <header className="defis-hero">
        <h2 className="defis-hero-title">Les Travaux</h2>
        {defis && (
          <span className="defis-hero-count">
            {done} / {defis.length} relevés
          </span>
        )}
      </header>

      <div className="defis-list">
        {error && <div className="alert alert-error">{error}</div>}
        {!defis && !error && <p className="hint-live">Les dieux dressent la liste…</p>}
        {defis?.length === 0 && (
          <p className="hint-live">Aucun défi pour l’instant — les dieux réfléchissent.</p>
        )}
        {defis?.map((defi, index) => (
          <DefiCard defi={defi} index={index} key={defi.id} now={now} onOpen={setOpen} />
        ))}
      </div>

      {openDefi && (
        <SubmitSheet
          defi={openDefi}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            load();
          }}
          user={user}
        />
      )}
    </div>
  );
}
