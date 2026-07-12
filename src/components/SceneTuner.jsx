import { useEffect, useRef, useState } from 'react';
import { SCENE_LINES, loadLineOverrides, saveLineOverride, clearLineOverrides } from '../config/sceneConfig';

// Dev tuning overlay (?tune=1): drag the horizontal line to set where the
// content box may start on the current screen. Values persist on this device
// (localStorage); "Copier" exports the full config to paste into sceneConfig.js.
export default function SceneTuner({ screen, line, onChange }) {
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!dragging) return undefined;
    const view = rootRef.current?.parentElement;
    if (!view) return undefined;

    function move(e) {
      const rect = view.getBoundingClientRect();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const pct = Math.min(85, Math.max(8, ((clientY - rect.top) / rect.height) * 100));
      onChange(saveLineOverride(screen, pct)[screen]);
      e.preventDefault();
    }
    function end() {
      setDragging(false);
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
  }, [dragging, screen, onChange]);

  async function copyConfig() {
    const merged = { ...SCENE_LINES, ...loadLineOverrides() };
    const body = Object.entries(merged)
      .map(([key, value]) => `  ${key}: ${value},`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(`export const SCENE_LINES = {\n${body}\n};`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard unavailable (non-HTTPS) — show the values instead.
      window.prompt('Copie ces valeurs :', JSON.stringify(merged));
    }
  }

  function reset() {
    clearLineOverrides();
    onChange(SCENE_LINES[screen] ?? 45);
  }

  return (
    <div className="scene-tuner" ref={rootRef}>
      <div className="tuner-line" style={{ top: `${line}%` }}>
        <button
          className="tuner-handle"
          onMouseDown={() => setDragging(true)}
          onTouchStart={() => setDragging(true)}
          type="button"
        >
          ⇕ {screen} · {Math.round(line)}%
        </button>
      </div>
      <div className="tuner-actions">
        <button className="tuner-btn" onClick={copyConfig} type="button">
          {copied ? '✓ Copié' : '📋 Copier config'}
        </button>
        <button className="tuner-btn" onClick={reset} type="button">
          ↺ Reset
        </button>
      </div>
    </div>
  );
}
