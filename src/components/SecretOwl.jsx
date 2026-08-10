import { useEffect, useRef, useState } from 'react';
import { loadOwlPosition, saveOwlPosition } from '../config/sceneConfig';

// Hidden easter egg on the home screen: tap the owl in Athena's hand five
// times and it flies off to the right, loops back in from the left carrying a
// scroll, and perches. Tapping the scroll opens the secret riddle.
//
// Phases: idle → flyout → flyin → perched
const TAPS_TO_WAKE = 5;
const FLYOUT_MS = 900;
const GONE_MS = 700;
const FLYIN_MS = 1500;

// Black-figure owl. `scroll` adds a rolled parchment in its talons.
function Owl({ scroll = false, flapping = false }) {
  return (
    <svg className={`owl-svg ${flapping ? 'is-flapping' : ''}`} viewBox="0 0 120 100">
      {/* wings (animated by CSS when flapping) */}
      <g className="owl-wing owl-wing-l">
        <path d="M52 46 C34 30 14 34 6 48 C18 52 34 56 50 58 Z" />
      </g>
      <g className="owl-wing owl-wing-r">
        <path d="M68 46 C86 30 106 34 114 48 C102 52 86 56 70 58 Z" />
      </g>

      {/* body + ear tufts */}
      <path d="M60 14 C74 14 84 26 84 44 C84 66 74 80 60 80 C46 80 36 66 36 44 C36 26 46 14 60 14 Z" />
      <path d="M41 22 L38 8 L52 17 Z" />
      <path d="M79 22 L82 8 L68 17 Z" />

      {/* eyes — cream rings, dark pupils */}
      <circle className="owl-eye" cx="51" cy="38" r="9" />
      <circle className="owl-eye" cx="69" cy="38" r="9" />
      <circle className="owl-pupil" cx="51" cy="38" r="4" />
      <circle className="owl-pupil" cx="69" cy="38" r="4" />
      {/* beak */}
      <path className="owl-beak" d="M60 44 L65 52 L55 52 Z" />

      {/* talons */}
      <path d="M52 78 L50 88 M60 80 L60 90 M68 78 L70 88" className="owl-legs" />

      {scroll && (
        <g className="owl-scroll">
          <rect height="12" rx="3" width="44" x="38" y="84" />
          <circle cx="38" cy="90" r="7" />
          <circle cx="82" cy="90" r="7" />
          <path className="owl-scroll-line" d="M48 88 H72 M48 92 H68" />
        </g>
      )}
    </svg>
  );
}

export default function SecretOwl({ solved, onOpen, tuning = false }) {
  const [taps, setTaps] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [pos, setPos] = useState(loadOwlPosition);
  const [dragging, setDragging] = useState(false);
  const timersRef = useRef([]);
  const hotspotRef = useRef(null);

  useEffect(
    () => () => timersRef.current.forEach(clearTimeout),
    []
  );

  // ?tune=1 → drag the hotspot onto the painted owl, position persists.
  useEffect(() => {
    if (!dragging) return undefined;
    const scene = hotspotRef.current?.parentElement;
    if (!scene) return undefined;

    function move(e) {
      const rect = scene.getBoundingClientRect();
      const point = e.touches ? e.touches[0] : e;
      const x = Math.min(100, Math.max(0, ((point.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(100, Math.max(0, ((point.clientY - rect.top) / rect.height) * 100));
      setPos(saveOwlPosition(x, y));
      e.preventDefault();
    }
    const end = () => setDragging(false);

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
    };
  }, [dragging]);

  function tapHotspot() {
    if (phase !== 'idle') return;
    const next = taps + 1;
    setTaps(next);
    if (navigator.vibrate) navigator.vibrate(next >= TAPS_TO_WAKE ? [40, 60, 40] : 15);

    if (next >= TAPS_TO_WAKE) {
      setPhase('flyout');
      timersRef.current.push(
        setTimeout(() => setPhase('flyin'), FLYOUT_MS + GONE_MS),
        setTimeout(() => setPhase('perched'), FLYOUT_MS + GONE_MS + FLYIN_MS)
      );
    }
  }

  // Already-solved teams still get the owl, just without the mystery.
  if (phase === 'idle') {
    return (
      <button
        aria-label="chouette"
        className={`owl-hotspot ${taps > 0 ? 'is-stirring' : ''} ${tuning ? 'is-tuning' : ''}`}
        onClick={tuning ? undefined : tapHotspot}
        onMouseDown={tuning ? () => setDragging(true) : undefined}
        onTouchStart={tuning ? () => setDragging(true) : undefined}
        ref={hotspotRef}
        style={{ '--owl-x': `${pos.x}%`, '--owl-y': `${pos.y}%` }}
        type="button"
      >
        {/* invisible in play: the owl they tap is the one painted on the artboard */}
        {taps >= 3 && !tuning && <span className="owl-glimmer" />}
        {tuning && <span className="owl-tune-label">🦉 {Math.round(pos.x)},{Math.round(pos.y)}</span>}
      </button>
    );
  }

  return (
    <div className={`owl-flight is-${phase}`}>
      <button
        className="owl-actor"
        disabled={phase !== 'perched'}
        onClick={phase === 'perched' ? onOpen : undefined}
        type="button"
      >
        <Owl flapping={phase !== 'perched'} scroll={phase !== 'flyout'} />
        {phase === 'perched' && (
          <span className="owl-call">{solved ? 'Relire le secret' : 'Ouvre le parchemin !'}</span>
        )}
      </button>
    </div>
  );
}
