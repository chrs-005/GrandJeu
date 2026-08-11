export default function ParcoursFoundOverlay({ found, onClose }) {
  if (!found) return null;

  const rankOrdinal = found?.rank === 1 ? 're' : 'e';

  return (
    <div className="found-overlay" onClick={onClose}>
      <div className="found-card" onClick={(e) => e.stopPropagation()}>
        {found.found ? (
          <>
            <span className="found-icon">🧵</span>
            <h2 className="found-title">{found.name} — trouvé !</h2>
            <p className="found-sub">
              {found.rank === 1
                ? 'Première équipe sur ce lieu !'
                : `${found.rank}${rankOrdinal} équipe sur ce lieu`}
            </p>
            {found.points > 0 && <span className="points-chip">+{found.points} pts</span>}
            <p className="found-sub">
              {found.finished
                ? 'C’était le dernier lieu — parcours terminé !'
                : `Ariane déroule le fil vers : ${found.nextName || 'le lieu suivant'}`}
            </p>
          </>
        ) : found.alreadyFound ? (
          <>
            <span className="found-icon">✅</span>
            <h2 className="found-title">Déjà trouvé</h2>
            <p className="found-sub">Vous avez déjà validé « {found.name} ».</p>
          </>
        ) : found.done ? (
          <>
            <span className="found-icon">🏛️</span>
            <h2 className="found-title">Parcours terminé</h2>
            <p className="found-sub">Vous avez déjà retrouvé tous les lieux.</p>
          </>
        ) : found.inactive ? (
          <>
            <span className="found-icon">🧭</span>
            <h2 className="found-title">Aucune chasse en cours</h2>
            <p className="found-sub">Le Fil d’Ariane n’est pas actif pour l’instant.</p>
          </>
        ) : found.tooFar ? (
          <>
            <span className="found-icon">🧭</span>
            <h2 className="found-title">Encore un peu</h2>
            <p className="found-sub">Approche-toi du lieu pour valider.</p>
          </>
        ) : (
          <>
            <span className="found-icon">⚠️</span>
            <h2 className="found-title">Validation impossible</h2>
            <p className="found-sub">Réessaie quand le GPS est stable.</p>
          </>
        )}
        <button className="btn btn-primary" onClick={onClose} type="button">
          Continuer
        </button>
      </div>
    </div>
  );
}
