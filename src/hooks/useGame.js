import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGame } from '../services/api';

const ACTIVE_INTERVAL = 3000;
const IDLE_INTERVAL = 7000;

// Polls /api/game and keeps a server-clock offset so countdowns are
// synchronized across phones even if a device clock is off.
export function useGame(user) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const offsetRef = useRef(0);
  const timerRef = useRef(null);
  const stoppedRef = useRef(false);
  // Keep latest data accessible inside the polling loop.
  const dataRef = useRef(null);
  dataRef.current = data;

  const load = useCallback(async () => {
    if (!user) return;
    // Dev preview: ?mock=<type> renders a fake game state (no backend needed).
    if (import.meta.env.DEV) {
      const mockType = new URLSearchParams(window.location.search).get('mock');
      if (mockType) {
        const { buildMockGame } = await import('../dev/mockGame');
        setData(buildMockGame(mockType));
        setError('');
        return;
      }
    }
    try {
      const started = Date.now();
      const result = await fetchGame(user);
      // Half the round-trip is a decent approximation of network latency.
      const latency = (Date.now() - started) / 2;
      offsetRef.current = result.serverNow + latency - Date.now();
      setData(result);
      setError('');
    } catch (err) {
      setError(err.message || 'Erreur de connexion aux dieux.');
    }
  }, [user]);

  useEffect(() => {
    stoppedRef.current = false;

    async function tick() {
      await load();
      if (stoppedRef.current) return;
      const running = Boolean(dataRef.current?.challenge?.running);
      timerRef.current = setTimeout(tick, running ? ACTIVE_INTERVAL : IDLE_INTERVAL);
    }

    tick();
    return () => {
      stoppedRef.current = true;
      clearTimeout(timerRef.current);
    };
  }, [load]);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { data, error, refresh: load, serverNow };
}
