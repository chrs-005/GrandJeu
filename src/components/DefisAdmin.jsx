import { useCallback, useEffect, useState } from 'react';
import { fetchAdminDefis } from '../services/api';
import { teamInfo } from '../config/gameConfig';
import { formatRemaining } from '../hooks/useNow';

// Admin panel for Les Défis: live sheet list, hot windows, creation and the
// review queue for the photos/videos teams send in.
export default function DefisAdmin({ user, now, busy, onAction }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({ title: '', description: '', media: 'any', category: '' });
  const [hotMinutes, setHotMinutes] = useState(15);

  const load = useCallback(async () => {
    try {
      setData(await fetchAdminDefis(user));
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement impossible.');
    }
  }, [user]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  async function run(action, payload, message) {
    await onAction(action, payload, message);
    await load();
  }

  async function create() {
    if (!draft.title.trim()) return;
    const result = await onAction('defi-create', draft, 'Défi ajouté !');
    if (result) setDraft({ title: '', description: '', media: 'any', category: '' });
    await load();
  }

  // Flatten every team's submissions into one review queue, pending first.
  const queue = (data?.submissions || [])
    .flatMap((team) =>
      Object.values(team.items || {}).map((item) => ({ ...item, uid: team.uid, username: team.username }))
    )
    .sort((a, b) => {
      const pa = a.status === 'pending' ? 0 : 1;
      const pb = b.status === 'pending' ? 0 : 1;
      return pa - pb || b.atMs - a.atMs;
    });

  const pendingCount = queue.filter((s) => s.status === 'pending').length;

  return (
    <div className="defis-admin">
      {error && <div className="alert alert-error">{error}</div>}
      {data?.sheetError && (
        <div className="alert alert-error">
          Google Sheet : {data.sheetError.slice(0, 160)}
        </div>
      )}
      {data && !data.sheetConfigured && (
        <div className="alert alert-info">
          Feuille non configurée — ajoutez <code>CHALLENGES_SHEET_ID</code> dans Vercel.
        </div>
      )}

      {/* Review queue */}
      <h4 className="defis-admin-sub">
        Preuves reçues {pendingCount > 0 && <span className="badge badge-error">{pendingCount} à juger</span>}
      </h4>
      <div className="submission-grid">
        {queue.map((sub) => (
          <article className="submission-card" key={`${sub.uid}-${sub.challengeId}`}>
            {sub.mediaType === 'video' ? (
              <video controls playsInline src={sub.mediaUrl} />
            ) : (
              <img alt={`Preuve de ${sub.username}`} src={sub.mediaUrl} />
            )}
            <div className="submission-meta">
              <strong>{teamInfo(sub.username).emblem} {sub.username}</strong>
              <span>{sub.title}</span>
              <span className={`badge ${sub.status === 'valid' ? 'badge-success' : sub.status === 'rejected' ? 'badge-error' : 'badge-neutral'}`}>
                {sub.status === 'valid' ? 'Accepté' : sub.status === 'rejected' ? 'Refusé' : 'À juger'}
              </span>
            </div>
            <div className="review-buttons">
              <button
                className="btn btn-sm btn-secondary"
                disabled={busy}
                onClick={() => run('defi-review', { uid: sub.uid, challengeId: sub.challengeId, status: 'valid' })}
                type="button"
              >
                ✓ Accepter
              </button>
              <button
                className="btn btn-sm btn-danger"
                disabled={busy}
                onClick={() => run('defi-review', { uid: sub.uid, challengeId: sub.challengeId, status: 'rejected' })}
                type="button"
              >
                ✗
              </button>
            </div>
          </article>
        ))}
        {!queue.length && <p className="form-hint">Aucune preuve envoyée pour l’instant.</p>}
      </div>

      {/* The list itself */}
      <h4 className="defis-admin-sub">
        Liste des défis ({data?.defis?.length || 0})
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run('defi-refresh-sheet', {}, 'Feuille rechargée.')} type="button">
          ↻ Recharger la feuille
        </button>
      </h4>
      <div className="defis-admin-list">
        {(data?.defis || []).map((defi) => (
          <div className={`defis-admin-row ${defi.hot ? 'is-hot' : ''}`} key={defi.id}>
            <div className="defis-admin-info">
              <strong>{defi.title}</strong>
              <span>
                {defi.media} · {defi.source === 'sheet' ? '📄 feuille' : '⚙️ console'}
                {defi.hot && ` · 🔥 ${formatRemaining(defi.hotEndAtMs - now)}`}
              </span>
            </div>
            <div className="btn-group">
              {defi.hot ? (
                <button className="btn btn-sm btn-secondary" disabled={busy} onClick={() => run('defi-hot', { challengeId: defi.id, stop: true }, 'Défi refroidi.')} type="button">
                  ❄️ Stop
                </button>
              ) : (
                <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => run('defi-hot', { challengeId: defi.id, title: defi.title, minutes: Number(hotMinutes) }, 'Défi brûlant lancé !')} type="button">
                  🔥 Brûlant
                </button>
              )}
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run('defi-hide', { challengeId: defi.id, hidden: true }, 'Défi masqué.')} type="button">
                Masquer
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="form-grid">
        <label>
          Défi brûlant — durée (min)
          <input min="1" max="240" onChange={(e) => setHotMinutes(e.target.value)} type="number" value={hotMinutes} />
        </label>
      </div>

      {/* Create */}
      <h4 className="defis-admin-sub">Ajouter un défi</h4>
      <div className="form-grid">
        <input onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Titre du défi" type="text" value={draft.title} />
        <textarea onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Description / consigne" rows={2} value={draft.description} />
        <div className="dest-fields">
          <input onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Catégorie" type="text" value={draft.category} />
          <select onChange={(e) => setDraft({ ...draft, media: e.target.value })} value={draft.media}>
            <option value="any">Photo ou vidéo</option>
            <option value="photo">Photo</option>
            <option value="video">Vidéo</option>
          </select>
        </div>
        <button className="btn btn-primary" disabled={busy || !draft.title.trim()} onClick={create} type="button">
          ➕ Ajouter {data?.sheetConfigured ? '(écrit dans la feuille)' : ''}
        </button>
      </div>
    </div>
  );
}
