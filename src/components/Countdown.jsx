import { formatRemaining } from '../hooks/useNow';

export default function Countdown({ endAtMs, now, label = 'Temps restant', warningMs = 30000 }) {
  const remaining = endAtMs - now;
  const done = remaining <= 0;
  return (
    <div className={`countdown ${!done && remaining < warningMs ? 'countdown-warning' : ''} ${done ? 'countdown-done' : ''}`}>
      <span className="countdown-label">{done ? 'Terminé' : label}</span>
      <span className="countdown-time">{formatRemaining(remaining)}</span>
    </div>
  );
}
