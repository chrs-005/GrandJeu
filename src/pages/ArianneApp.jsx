import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useGame } from '../hooks/useGame';
import { gameAction } from '../services/api';
import { SCENE_LINES } from '../config/sceneConfig';
import ParcoursScreen from '../components/ParcoursScreen';
import ParcoursFoundOverlay from '../components/ParcoursFoundOverlay';

function FilPage({ currentUser, data, refresh }) {
  const parcours = data?.parcours;
  const seam = SCENE_LINES.parcours ?? 53;

  return (
    <section className="challenge-shell parcours-shell arianne-shell" style={{ '--seam': `${seam}%` }}>
      <div className="challenge-header challenge-scene" />
      <div className="challenge-body">
        {parcours?.active ? (
          <ParcoursScreen parcours={parcours} refresh={refresh} user={currentUser} />
        ) : (
          <div className="arianne-empty">
            <span className="found-icon">🧵</span>
            <h2 className="found-title">Le Fil dort encore</h2>
            <p className="found-sub">Ariane n’a pas encore ouvert le chemin.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PuzzlePage() {
  const seam = SCENE_LINES.parcours ?? 53;

  return (
    <section className="challenge-shell parcours-shell arianne-shell" style={{ '--seam': `${seam}%` }}>
      <div className="challenge-header challenge-scene" />
      <div className="challenge-body">
        <div className="arianne-empty">
          <span className="found-icon">□</span>
          <h2 className="found-title">Puzzle</h2>
          <p className="found-sub">À ouvrir plus tard.</p>
        </div>
      </div>
    </section>
  );
}

export default function ArianneApp() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const { data, error, refresh } = useGame(currentUser);
  const [tab, setTab] = useState('fil');
  const [found, setFound] = useState(null);
  const foundHandledRef = useRef(false);

  useEffect(() => {
    if (foundHandledRef.current || !currentUser) return;
    const token = localStorage.getItem('olympe-pending-found');
    if (!token) return;
    foundHandledRef.current = true;
    localStorage.removeItem('olympe-pending-found');
    setTab('fil');

    gameAction(currentUser, 'parcours-found', { token })
      .then((result) => {
        setFound(result);
        refresh();
      })
      .catch(() => setFound({ error: true }));
  }, [currentUser, refresh]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-shell arianne-app" style={{ '--team-color': '#6f7fc9' }}>
      <ParcoursFoundOverlay found={found} onClose={() => setFound(null)} />
      {error && <div className="alert alert-error toast-error">{error}</div>}

      <div className="app-view">
        {tab === 'puzzle' ? (
          <PuzzlePage />
        ) : (
          <FilPage currentUser={currentUser} data={data} refresh={refresh} />
        )}
      </div>

      <nav className="tab-bar arianne-tab-bar">
        <button
          className={`tab-btn ${tab === 'fil' ? 'is-active' : ''}`}
          onClick={() => setTab('fil')}
          type="button"
        >
          <span className="tab-icon">🧵</span>
          <span className="tab-label">Le Fil</span>
        </button>
        <button
          className={`tab-btn ${tab === 'puzzle' ? 'is-active' : ''}`}
          onClick={() => setTab('puzzle')}
          type="button"
        >
          <span className="tab-icon">□</span>
          <span className="tab-label">Puzzle</span>
        </button>
        <button className="tab-btn arianne-exit" onClick={handleLogout} type="button">
          <span className="tab-icon">↩</span>
        </button>
      </nav>
    </div>
  );
}
