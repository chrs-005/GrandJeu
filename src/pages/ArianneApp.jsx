import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useGame } from '../hooks/useGame';
import { SCENE_LINES } from '../config/sceneConfig';
import ParcoursScreen from '../components/ParcoursScreen';
import ParcoursFoundOverlay from '../components/ParcoursFoundOverlay';
import puzzleBg from '../assets/bg-puzzle.png';
import puzzleOuter from '../assets/puzzle_1.png';
import puzzleMiddle from '../assets/puzzle_2.png';
import puzzleCenter from '../assets/puzzle_3.png';

function FilPage({ currentUser, data, refresh, onFound }) {
  const parcours = data?.parcours;
  const seam = SCENE_LINES.parcours ?? 53;

  return (
    <section className="challenge-shell parcours-shell arianne-shell" style={{ '--seam': `${seam}%` }}>
      <div className="challenge-header challenge-scene" />
      <div className="challenge-body">
        {parcours?.active ? (
          <ParcoursScreen onFound={onFound} parcours={parcours} refresh={refresh} user={currentUser} />
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
  const [turns, setTurns] = useState([28, -42, 17]);
  const dragRef = useRef(null);

  function pointerPosition(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (bounds.left + bounds.width / 2);
    const y = event.clientY - (bounds.top + bounds.height / 2);
    return {
      angle: Math.atan2(y, x) * (180 / Math.PI),
      radius: Math.hypot(x, y) / (bounds.width / 2),
    };
  }

  function handlePointerDown(event) {
    const { angle, radius } = pointerPosition(event);
    if (radius > 1) return;

    const index = radius <= 0.5986 ? 2 : radius <= 0.7993 ? 1 : 0;
    dragRef.current = { index, lastAngle: angle };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;

    const { angle } = pointerPosition(event);
    let delta = angle - drag.lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    drag.lastAngle = angle;
    setTurns((values) => values.map((value, index) => (
      index === drag.index ? value + delta : value
    )));
  }

  function handlePointerUp(event) {
    const drag = dragRef.current;
    if (!drag) return;

    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePointerCancel() {
    dragRef.current = null;
  }

  return (
    <section className="puzzle-shell" style={{ '--puzzle-bg': `url(${puzzleBg})` }}>
      <div
        aria-label="Puzzle concentrique"
        className="puzzle-stack"
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {[
          { src: puzzleOuter, className: 'puzzle-layer-outer', label: 'Anneau extérieur' },
          { src: puzzleMiddle, className: 'puzzle-layer-middle', label: 'Anneau central' },
          { src: puzzleCenter, className: 'puzzle-layer-center', label: 'Centre' },
        ].map((layer, index) => (
          <div
            aria-label={layer.label}
            className={`puzzle-layer ${layer.className}`}
            key={layer.className}
            style={{ '--turn': `${turns[index]}deg` }}
          >
            <img alt="" draggable="false" src={layer.src} />
          </div>
        ))}
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
          <FilPage currentUser={currentUser} data={data} onFound={setFound} refresh={refresh} />
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
