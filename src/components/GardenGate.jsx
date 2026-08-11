import { useState } from 'react';

// 4-digit keypad guarding the Jardin Secret.
const CODE = '4763';

export default function GardenGate({ onUnlock, onClose }) {
  const [entered, setEntered] = useState('');
  const [wrong, setWrong] = useState(false);

  function press(digit) {
    if (entered.length >= 4) return;
    const next = entered + digit;
    setEntered(next);
    setWrong(false);
    if (navigator.vibrate) navigator.vibrate(12);

    if (next.length === 4) {
      if (next === CODE) {
        if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
        setTimeout(onUnlock, 220);
      } else {
        setWrong(true);
        if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
        setTimeout(() => {
          setEntered('');
          setWrong(false);
        }, 700);
      }
    }
  }

  return (
    <div className="gate-overlay" onClick={onClose}>
      <div className="gate-card" onClick={(e) => e.stopPropagation()}>
        <span className="gate-icon">🌿</span>
        <h2 className="gate-title">Jardin Secret</h2>
        <p className="gate-sub">Quatre chiffres pour franchir la haie.</p>

        <div className={`gate-dots ${wrong ? 'is-wrong' : ''}`}>
          {[0, 1, 2, 3].map((i) => (
            <span className={`gate-dot ${entered.length > i ? 'is-filled' : ''}`} key={i} />
          ))}
        </div>

        <div className="gate-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button className="gate-key" key={d} onClick={() => press(d)} type="button">
              {d}
            </button>
          ))}
          <button className="gate-key is-ghost" onClick={onClose} type="button">
            ✕
          </button>
          <button className="gate-key" onClick={() => press('0')} type="button">
            0
          </button>
          <button
            className="gate-key is-ghost"
            onClick={() => setEntered((v) => v.slice(0, -1))}
            type="button"
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}
