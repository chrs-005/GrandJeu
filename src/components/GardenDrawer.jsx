import { useEffect, useRef, useState } from 'react';

// The team card slides sideways like a drawer, uncovering an identical box
// behind it that reads "Jardin Secret". Let go and it springs shut. Keep it
// held open for a short beat — a ring fills beside the leaf — and the keypad
// appears on its own, so it never needs a second finger.
const OPEN_RATIO = 0.78; // how far right the card can travel, as a share of its width
const ARM_AT = 0.45; // the hold only counts once the drawer is this far out
const HOLD_MS = 1200;

const RING_R = 13;
const RING_C = 2 * Math.PI * RING_R;

export default function GardenDrawer({ children, onOpenGarden, peekSignal = 0 }) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const rafRef = useRef(0);
  const firedRef = useRef(false);
  const openRef = useRef(onOpenGarden);
  openRef.current = onOpenGarden;

  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [maxSlide, setMaxSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const [peeking, setPeeking] = useState(false);

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
      // Rightwards only, with a hard stop at the fully-open position.
      setOffset(Math.max(0, Math.min(maxSlide, point.clientX - drag.startX)));
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

  useEffect(() => {
    if (dragging) return undefined;
    setPeeking(false);
    const frame = requestAnimationFrame(() => setPeeking(true));
    return () => cancelAnimationFrame(frame);
  }, [dragging, peekSignal]);

  // Held far enough? Fill the ring; slipping back or letting go resets it.
  // Depending on the boolean (not the raw offset) keeps finger jitter from
  // restarting the countdown.
  const holding = dragging && maxSlide > 0 && offset > maxSlide * ARM_AT;

  useEffect(() => {
    if (!holding) {
      clearInterval(rafRef.current);
      setProgress(0);
      firedRef.current = false;
      return undefined;
    }
    // A timer rather than requestAnimationFrame: rAF is paused whenever the
    // page is hidden or throttled, which would strand the hold at zero.
    const started = performance.now();
    rafRef.current = setInterval(() => {
      const p = Math.min(1, (performance.now() - started) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        clearInterval(rafRef.current);
        if (!firedRef.current) {
          firedRef.current = true;
          if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
          openRef.current();
        }
      }
    }, 40);
    return () => clearInterval(rafRef.current);
  }, [holding]);

  function start(e) {
    const point = e.touches ? e.touches[0] : e;
    dragRef.current = { startX: point.clientX };
    setDragging(true);
  }

  return (
    <div className="garden-drawer-wrap" ref={wrapRef}>
      {/* The box hiding underneath — no need to fade it, the card covers it */}
      <div className="garden-drawer">
        <span className={`garden-drawer-label ${holding ? 'is-holding' : ''}`}>
          <span className="garden-ring">
            <svg viewBox="0 0 32 32">
              <circle className="garden-ring-track" cx="16" cy="16" r={RING_R} />
              <circle
                className="garden-ring-fill"
                cx="16"
                cy="16"
                r={RING_R}
                style={{ strokeDasharray: RING_C, strokeDashoffset: RING_C * (1 - progress) }}
              />
            </svg>
            <span className="garden-ring-leaf">🌿</span>
          </span>
          Jardin Secret
        </span>
      </div>

      {/* The team card itself, which the finger drags aside */}
      <div
        className={`garden-drawer-front ${dragging ? 'is-dragging' : ''}`}
        onMouseDown={start}
        onTouchStart={start}
        style={{ transform: `translateX(${offset}px)` }}
      >
        <div
          className={`garden-drawer-peek ${peeking ? 'is-peeking' : ''}`}
          onAnimationEnd={() => setPeeking(false)}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
