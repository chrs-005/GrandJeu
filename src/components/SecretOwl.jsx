import { useEffect, useRef, useState } from 'react';
import { loadOwlPosition, saveOwlPosition } from '../config/sceneConfig';

// Hidden easter egg on the home screen: tap the owl in Athena's hand and open
// the secret Google Maps location directly.

export default function SecretOwl({
  onOpen,
  tuning = false,
  debug = false,
  armed = true,
}) {
  const [pos, setPos] = useState(loadOwlPosition);
  const [dragging, setDragging] = useState(false);
  const hotspotRef = useRef(null);

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
    if (!armed && !debug) return;
    if (navigator.vibrate) navigator.vibrate(25);
    onOpen();
  }

  return (
      <button
        aria-label="chouette"
        className={`owl-hotspot ${tuning ? 'is-tuning' : ''} ${debug ? 'is-debug' : ''}`}
        onClick={tuning ? undefined : tapHotspot}
        onMouseDown={tuning ? () => setDragging(true) : undefined}
        onTouchStart={tuning ? () => setDragging(true) : undefined}
        ref={hotspotRef}
        style={{ '--owl-x': `${pos.x}%`, '--owl-y': `${pos.y}%` }}
        type="button"
      >
        {tuning && <span className="owl-tune-label">🦉 {Math.round(pos.x)},{Math.round(pos.y)}</span>}
        {debug && !tuning && (
          <span className="owl-tune-label">
            {armed ? 'ouvre Maps' : 'AUCUN SECRET'}
          </span>
        )}
      </button>
  );
}
