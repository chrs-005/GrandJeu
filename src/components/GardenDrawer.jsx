import { useEffect, useRef, useState } from 'react';

// The team card slides sideways like a drawer, uncovering an identical box
// behind it that reads "Jardin Secret". Let go and it springs shut — so you
// have to hold it open with one finger and tap the label with another.
const OPEN_RATIO = 0.78; // how far right the card can travel, as a share of its width
const TAPPABLE_AT = 0.45; // the label only accepts taps once it's this far out

export default function GardenDrawer({ children, onOpenGarden }) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [maxSlide, setMaxSlide] = useState(0);

  useEffect(() => {
    function measure() {
      const width = wrapRef.current?.getBoundingClientRect().width || 0;
      setMaxSlide(width * OPEN_RATIO);
    }
    measure();
    const observer = new ResizeObserver(measure);
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!dragging) return undefined;

    function move(e) {
      const drag = dragRef.current;
      if (!drag) return;
      const point = e.touches ? e.touches[0] : e;
      // Rightwards only, with a soft ceiling at the fully-open position.
      const dx = point.clientX - drag.startX;
      setOffset(Math.max(0, Math.min(maxSlide, dx)));
      e.preventDefault();
    }
    function end() {
      dragRef.current = null;
      setDragging(false);
      setOffset(0); // spring shut
    }

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, [dragging, maxSlide]);

  function start(e) {
    const point = e.touches ? e.touches[0] : e;
    dragRef.current = { startX: point.clientX };
    setDragging(true);
  }

  const openEnough = offset > maxSlide * TAPPABLE_AT;

  return (
    <div className="garden-drawer-wrap" ref={wrapRef}>
      {/* The box hiding underneath — no need to fade it, the card covers it */}
      <div className="garden-drawer">
        <button
          className="garden-drawer-label"
          disabled={!openEnough}
          onClick={onOpenGarden}
          type="button"
        >
          🌿 Jardin Secret
        </button>
      </div>

      {/* The team card itself, which the finger drags aside */}
      <div
        className={`garden-drawer-front ${dragging ? 'is-dragging' : ''}`}
        onMouseDown={start}
        onTouchStart={start}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
