import { useEffect } from 'react';
import { gameAction } from '../services/api';

// Keeps a GPS watch alive for the whole session (once the player granted the
// location ritual) and POSTs the position every ~10s so the admin team map
// stays fed. Gameplay challenges (guide, territory) run their own watches;
// this one exists purely for the shared map and survives screen changes.
export function useLocationBroadcast(user, enabled) {
  useEffect(() => {
    if (!enabled || !user || !('geolocation' in navigator)) return undefined;
    let last = 0;
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - last < 10000) return;
        last = now;
        const { latitude, longitude, accuracy, heading, speed } = position.coords;
        gameAction(user, 'location', { latitude, longitude, accuracy, heading, speed }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [user, enabled]);
}
