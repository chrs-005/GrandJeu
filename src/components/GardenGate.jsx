import { useEffect, useRef, useState } from 'react';

const CODE = '4786';

export default function GardenGate({ onUnlock, onClose }) {
  const inputRef = useRef(null);
  const [entered, setEntered] = useState('');
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, []);

  function focusInput() {
    inputRef.current?.focus();
  }

  function change(e) {
    const next = e.target.value.replace(/\D/g, '').slice(0, 4);
    setEntered(next);
    setWrong(false);

    if (next.length !== 4) return;

    if (next === CODE) {
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
      setTimeout(onUnlock, 160);
      return;
    }

    setWrong(true);
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    setTimeout(() => {
      setEntered('');
      setWrong(false);
      inputRef.current?.focus();
    }, 560);
  }

  return (
    <div className="gate-overlay" onClick={onClose}>
      <div
        aria-label="Entrer le code du Jardin Secret"
        className={`gate-lock ${wrong ? 'is-wrong' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          focusInput();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') focusInput();
        }}
        role="button"
        tabIndex={0}
      >
        <span className="gate-squares" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span className={`gate-square ${entered.length > i ? 'is-filled' : ''}`} key={i} />
          ))}
        </span>
        <input
          aria-label="Code"
          autoComplete="one-time-code"
          className="gate-input"
          inputMode="numeric"
          maxLength={4}
          onChange={change}
          pattern="[0-9]*"
          ref={inputRef}
          type="text"
          value={entered}
        />
      </div>
    </div>
  );
}
