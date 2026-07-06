import { useEffect, useRef, useState } from 'react';

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;
const DRAWING_COLORS = ['#111827', '#dc2626', '#2563eb', '#059669', '#f59e0b', '#7c3aed', '#ffffff'];

// Touch/mouse drawing canvas. onSubmit receives a PNG data URL.
export default function DrawingCanvas({ disabled, submitted, submitLabel, onSubmit, resetKey }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [color, setColor] = useState(DRAWING_COLORS[0]);
  const [size, setSize] = useState(8);
  const [tool, setTool] = useState('pen');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, [resetKey]);

  function getPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const pointer = event.touches?.[0] || event;
    return {
      x: ((pointer.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((pointer.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  }

  function drawLine(from, to) {
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size;
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  function startDrawing(event) {
    if (disabled || submitted) return;
    event.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPoint(event);
    // A dot for single taps.
    drawLine(lastPointRef.current, lastPointRef.current);
  }

  function moveDrawing(event) {
    if (!drawingRef.current || !lastPointRef.current) return;
    event.preventDefault();
    const nextPoint = getPoint(event);
    drawLine(lastPointRef.current, nextPoint);
    lastPointRef.current = nextPoint;
  }

  function stopDrawing() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearCanvas() {
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  async function submitDrawing() {
    setSaving(true);
    try {
      // JPEG keeps the payload well under the Firestore document limit.
      await onSubmit(canvasRef.current.toDataURL('image/jpeg', 0.8));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="drawing-tool">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="drawing-canvas"
        onMouseDown={startDrawing}
        onMouseMove={moveDrawing}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={moveDrawing}
        onTouchEnd={stopDrawing}
      />

      <div className="drawing-toolbar">
        <div className="drawing-colors">
          {DRAWING_COLORS.map((item) => (
            <button
              aria-label={`Couleur ${item}`}
              className={`color-swatch ${color === item && tool === 'pen' ? 'is-active' : ''}`}
              key={item}
              onClick={() => {
                setColor(item);
                setTool('pen');
              }}
              style={{ background: item }}
              type="button"
            />
          ))}
        </div>

        <label className="drawing-size">
          <span>Taille</span>
          <input
            max="28"
            min="2"
            onChange={(e) => setSize(Number(e.target.value))}
            type="range"
            value={size}
          />
        </label>

        <div className="drawing-actions">
          <button
            className={`btn btn-sm ${tool === 'eraser' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTool(tool === 'eraser' ? 'pen' : 'eraser')}
            type="button"
          >
            Gomme
          </button>
          <button className="btn btn-secondary btn-sm" onClick={clearCanvas} type="button">
            Effacer
          </button>
        </div>
      </div>

      <button
        className="btn btn-primary"
        disabled={saving || submitted || disabled}
        onClick={submitDrawing}
        type="button"
      >
        {saving ? 'Envoi…' : submitted ? 'Œuvre envoyée ✓' : submitLabel || 'Envoyer l’œuvre'}
      </button>
    </div>
  );
}
