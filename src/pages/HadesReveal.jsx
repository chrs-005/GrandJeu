import { useEffect, useRef, useState } from 'react';
import hadesTop from '../assets/hades-top.png';
import hadesBottom from '../assets/hades-bottom.png';
import { createHadesSoundscape } from '../audio/hadesSoundscape';

const IDLE_OFFSET = { x: 0, y: 0 };

export default function HadesReveal() {
  const [offset, setOffset] = useState(IDLE_OFFSET);
  const [dragging, setDragging] = useState(false);
  const [nearTarget, setNearTarget] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [origin, setOrigin] = useState({ x: 0, y: 0, fontSize: 16 });
  const dragRef = useRef(null);
  const wordRef = useRef(null);
  const dropRef = useRef(null);
  const soundscapeRef = useRef(null);

  const revealing = phase !== 'idle';
  const expanded = phase === 'expanded';

  useEffect(() => {
    if (phase !== 'snapped') return undefined;
    let secondFrame;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setPhase('expanded'));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [phase]);

  useEffect(() => () => soundscapeRef.current?.stop(), []);

  function soundscape() {
    if (!soundscapeRef.current) soundscapeRef.current = createHadesSoundscape();
    return soundscapeRef.current;
  }

  function solve() {
    if (revealing || !wordRef.current) return;
    const audio = soundscape();
    audio.start();
    audio.reveal();
    const rect = wordRef.current.getBoundingClientRect();
    const fontSize = Number.parseFloat(getComputedStyle(wordRef.current).fontSize) || 16;
    setOrigin({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      fontSize,
    });
    setOffset(IDLE_OFFSET);
    setNearTarget(false);
    setPhase('snapped');
  }

  function pointerPosition(event, drag) {
    const x = drag.originX + event.clientX - drag.startX;
    const y = drag.originY + event.clientY - drag.startY;
    return { x, y };
  }

  function isInsideDropZone(position) {
    const target = dropRef.current?.getBoundingClientRect();
    if (!target) return false;
    const centerX = target.left + target.width / 2;
    const centerY = target.top + target.height / 2;
    const snapDistance = Math.max(30, target.height * 0.85);
    return Math.hypot(position.x - centerX, position.y - centerY) <= snapDistance;
  }

  function startDrag(event) {
    if (revealing) return;
    soundscape().start();
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left + rect.width / 2,
      originY: rect.top + rect.height / 2,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextOffset = {
      x: event.clientX - drag.startX,
      y: event.clientY - drag.startY,
    };
    setOffset(nextOffset);
    setNearTarget(isInsideDropZone(pointerPosition(event, drag)));
  }

  function endDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const shouldSolve = isInsideDropZone(pointerPosition(event, drag));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
    if (shouldSolve) solve();
    else {
      setNearTarget(false);
      setOffset(IDLE_OFFSET);
    }
  }

  function cancelDrag(event) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    setNearTarget(false);
    setOffset(IDLE_OFFSET);
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    solve();
  }

  return (
    <main className={`hades-page ${revealing ? 'is-revealing' : ''} ${expanded ? 'is-expanded' : ''}`}>
      <img alt="" aria-hidden="true" className="hades-reveal-art hades-reveal-top" draggable="false" src={hadesTop} />
      <img alt="" aria-hidden="true" className="hades-reveal-art hades-reveal-bottom" draggable="false" src={hadesBottom} />

      <section className="hades-riddle" aria-label="Riddle of the shade">
        <div className="hades-riddle-copy">
          <p>
            I AM A{' '}
            <span className={`hades-inline-word ${nearTarget ? 'is-near' : ''}`} ref={wordRef}>
              {!revealing && (
                <button
                  aria-label="Drag the letter S to the end of SHADE"
                  className={`hades-letter-s ${dragging ? 'is-dragging' : ''}`}
                  onKeyDown={handleKeyDown}
                  onPointerCancel={cancelDrag}
                  onPointerDown={startDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
                  type="button"
                >
                  S
                </button>
              )}
              <span className="hades-word-core">HADE</span>
              {revealing && <span className="hades-snapped-s">S</span>}
              {!revealing && <span aria-hidden="true" className="hades-drop-target" ref={dropRef} />}
            </span>
            ,
          </p>
          <p>DRAGGING BEHIND YOU,</p>
          <p className="hades-riddle-wide-line">THE MONSTERS ARE NOT ENOUGH.</p>
          <p className="hades-riddle-wide-line">START BY DISCOVERING MY IDENTITY,</p>
          <p>TO SEEK MY HELP,</p>
          <p>THE ROAD IS NOT EASY.</p>
          <p>END.</p>
        </div>
      </section>

      {revealing && (
        <>
          <div
            aria-label="Hades"
            className={`hades-final-title ${expanded ? 'is-expanded' : ''}`}
            style={{
              '--hades-origin-x': `${origin.x}px`,
              '--hades-origin-y': `${origin.y}px`,
              '--hades-origin-size': `${origin.fontSize}px`,
            }}
          >
            HADES
          </div>
          <p className={`hades-final-message ${expanded ? 'is-expanded' : ''}`}>
            Go home now, you should lend me a visit soon
          </p>
        </>
      )}
    </main>
  );
}
