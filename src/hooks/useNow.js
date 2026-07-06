import { useEffect, useState } from 'react';

// Ticking clock (server-adjusted when a serverNow() getter is provided).
export function useNow(serverNow, intervalMs = 500) {
  const [now, setNow] = useState(() => (serverNow ? serverNow() : Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      setNow(serverNow ? serverNow() : Date.now());
    }, intervalMs);
    return () => clearInterval(id);
  }, [serverNow, intervalMs]);

  return now;
}

export function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
