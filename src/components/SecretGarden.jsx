import { useCallback, useEffect, useRef, useState } from 'react';
import bgGame from '../assets/bg-game.png';
import bottomBar from '../assets/bottom-bar.png';
import top1 from '../assets/top1-trans.png';
import top2 from '../assets/top2-trans.png';

// Le Jardin Secret — hidden behind the team card on the home screen.
//
// Everything is laid out inside a "canvas" that is exactly the background
// image's rendered box (cover-fitted to the screen). Positions and sizes are
// then percentages of that box, so the sprites keep their exact relationship
// to the painting on every phone.
const ART_W = 768;
const ART_H = 1376;

// The sprites are shown at exactly 18.5% of their native pixel size, expressed
// as a share of the artwork's width so the ratio survives any screen size.
const SCALE = 0.185;
const SPRITES = [
  { id: 'top1', src: top1, nativeW: 2065, x: 8, y: 84 },
  { id: 'top2', src: top2, nativeW: 2005, x: 50, y: 85 },
];

function spriteWidthPct(nativeW) {
  return ((nativeW * SCALE) / ART_W) * 100;
}

export default function SecretGarden({ onClose }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [canvas, setCanvas] = useState({ w: 0, h: 0, left: 0, top: 0 });
  const [pos, setPos] = useState(() =>
    Object.fromEntries(SPRITES.map((s) => [s.id, { x: s.x, y: s.y }]))
  );
  const [moved, setMoved] = useState(false);
  const dragRef = useRef(null);

  // Fit (not crop) the artwork inside the safe area: it's an aligning game, so
  // the whole board has to be visible and everything must share one scale.
  const measure = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (!width || !height) return;
    const scale = Math.min(width / ART_W, height / ART_H);
    const w = ART_W * scale;
    const h = ART_H * scale;
    setCanvas({ w, h, left: (width - w) / 2, top: (height - h) / 2 });
  }, []);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [measure]);

  function startDrag(e, id) {
    const point = e.touches ? e.touches[0] : e;
    dragRef.current = { id, startX: point.clientX, startY: point.clientY, origin: pos[id] };
    e.preventDefault();
    e.stopPropagation();
  }

  useEffect(() => {
    if (!canvas.w) return undefined;

    function move(e) {
      const drag = dragRef.current;
      if (!drag) return;
      const point = e.touches ? e.touches[0] : e;
      const dx = ((point.clientX - drag.startX) / canvas.w) * 100;
      const dy = ((point.clientY - drag.startY) / canvas.h) * 100;
      setPos((prev) => ({
        ...prev,
        // Keep a sliver on screen so a sprite can never be lost off-canvas.
        [drag.id]: {
          x: Math.min(95, Math.max(-45, drag.origin.x + dx)),
          y: Math.min(98, Math.max(-45, drag.origin.y + dy)),
        },
      }));
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) setMoved(true);
      e.preventDefault();
    }
    function end() {
      dragRef.current = null;
    }

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
  }, [canvas.w, canvas.h]);

  return (
    <div className="garden-overlay" ref={wrapRef}>
      <div
        className="garden-canvas"
        ref={canvasRef}
        style={{ width: canvas.w, height: canvas.h, left: canvas.left, top: canvas.top }}
      >
        <img alt="" className="garden-bg" src={bgGame} />

        {SPRITES.map((sprite) => (
        /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */
          <img
            alt=""
            className="garden-sprite"
            draggable={false}
            key={sprite.id}
            onMouseDown={(e) => startDrag(e, sprite.id)}
            onTouchStart={(e) => startDrag(e, sprite.id)}
            src={sprite.src}
            style={{
              width: `${spriteWidthPct(sprite.nativeW)}%`,
              left: `${pos[sprite.id].x}%`,
              top: `${pos[sprite.id].y}%`,
            }}
          />
        ))}

        {/* Painted bar sits above everything, so the sprites emerge from under it */}
        <img alt="" className="garden-bar" src={bottomBar} />
      </div>

      <button className="garden-close" onClick={onClose} type="button">
        ✕
      </button>
      {!moved && <p className="garden-hint">Tire les tiges hors de l’ombre…</p>}
    </div>
  );
}
