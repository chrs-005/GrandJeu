import { useEffect, useRef, useState } from 'react';
import { loadOwlPosition, saveOwlPosition } from '../config/sceneConfig';
import owlVideo from '../assets/bg-home-whileowl.mp4';
import owlEndFrame from '../assets/bg-home-afterowl.jpg';

// Hidden easter egg on the home screen: tap the owl in Athena's hand five
// times and the whole artboard comes alive — the owl flies off and returns
// with a scroll. The clip's last frame matches bg-home-afterowl.jpg, so the
// scene freezes into it seamlessly and stays there.
//
// Phases: idle (counting taps) → playing (video) → revealed (tap to open)
const TAPS_TO_WAKE = 5;

export default function SecretOwl({
  onOpen,
  onRevealed,
  revealed = false,
  tuning = false,
  debug = false,
  armed = true,
}) {
  const [taps, setTaps] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(loadOwlPosition);
  const [dragging, setDragging] = useState(false);
  const hotspotRef = useRef(null);
  const videoRef = useRef(null);
  const finishingRef = useRef(false);

  // Decode the final still before it is needed. Otherwise the video can be
  // removed one paint before the browser has the replacement background ready.
  useEffect(() => {
    const image = new Image();
    image.src = owlEndFrame;
    image.decode?.().catch(() => {});
  }, []);

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
    if (revealed) {
      onOpen();
      return;
    }
    if (playing) return;

    const next = taps + 1;
    setTaps(next);
    // No visual hint — only a growing buzz from the third tap so it feels
    // like something is waking up without giving the secret away.
    if (navigator.vibrate) {
      if (next === TAPS_TO_WAKE) navigator.vibrate([40, 60, 40]);
      else if (next >= 3) navigator.vibrate(25);
    }
    if (next >= TAPS_TO_WAKE) setPlaying(true);
  }

  // The 5th tap is a user gesture, so iOS allows play() here.
  useEffect(() => {
    if (!playing || !videoRef.current) return;
    videoRef.current.play().catch(() => finish()); // autoplay blocked → skip to the end state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;

    // Switch the artboard first, then leave the video's final frame covering it
    // long enough for the replacement background to be painted underneath.
    onRevealed?.();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPlaying(false);
        finishingRef.current = false;
      });
    });
  }

  return (
    <>
      {playing && (
        <video
          className="owl-video"
          muted
          onEnded={finish}
          onError={finish}
          playsInline
          preload="auto"
          ref={videoRef}
          src={owlVideo}
        />
      )}

      <button
        aria-label="chouette"
        className={`owl-hotspot ${tuning ? 'is-tuning' : ''} ${debug ? 'is-debug' : ''} ${
          revealed ? 'is-revealed' : ''
        }`}
        onClick={tuning || playing ? undefined : tapHotspot}
        onMouseDown={tuning ? () => setDragging(true) : undefined}
        onTouchStart={tuning ? () => setDragging(true) : undefined}
        ref={hotspotRef}
        style={{ '--owl-x': `${pos.x}%`, '--owl-y': `${pos.y}%` }}
        type="button"
      >
        {tuning && <span className="owl-tune-label">🦉 {Math.round(pos.x)},{Math.round(pos.y)}</span>}
        {debug && !tuning && (
          <span className="owl-tune-label">
            {revealed ? 'ouvre le parchemin' : `${taps}/${TAPS_TO_WAKE}`} ·{' '}
            {armed ? 'énigme armée' : 'AUCUNE ÉNIGME'}
          </span>
        )}
      </button>
    </>
  );
}
