import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameAction } from '../services/api';
import { followRoute, cardinalFr, formatDistance, warmthFor } from '../utils/geo';

// Rerouting is deliberately reluctant: wandering off is the team's problem,
// but once they're genuinely lost we retie the thread like a maps app would.
const WAY_OFF_M = 150; // must be REALLY off the path
const WAY_OFF_SUSTAIN_MS = 10_000; // …and stay off for this long (not a GPS blip)
const RECOMPUTE_COOLDOWN_MS = 90_000;
const ARRIVAL_M = 30; // close enough to complete this stop

function needsCompassPermission() {
  return (
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function'
  );
}

export default function ParcoursScreen({ user, parcours, refresh, onFound }) {
  const [pos, setPos] = useState(null);
  const [heading, setHeading] = useState(null);
  const [compassOn, setCompassOn] = useState(false);
  const [error, setError] = useState('');
  const [targetIdx, setTargetIdx] = useState(0);
  const [routing, setRouting] = useState(false);
  const [rerouted, setRerouted] = useState(false);
  const lastRouteReqRef = useRef(0);
  const wayOffSinceRef = useRef(0);
  const arrivingRef = useRef(false);

  // The poll hands back a fresh array each time; key it so identity is stable.
  const routeKey = parcours.route?.length
    ? `${parcours.route.length}:${parcours.route[0]?.join()}`
    : 'none';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const route = useMemo(() => parcours.route || [], [routeKey]);

  // New leg → start from the first breadcrumb again.
  useEffect(() => {
    setTargetIdx(0);
    arrivingRef.current = false;
  }, [routeKey]);

  // GPS watch drives everything on this screen.
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('GPS non supporté sur cet appareil.');
      return undefined;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        setError('');
      },
      (err) => setError(err.message || 'Active le GPS pour suivre le fil.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Compass heading (iOS needs an explicit permission tap).
  useEffect(() => {
    if (!compassOn) return undefined;
    function onOrientation(e) {
      if (typeof e.webkitCompassHeading === 'number') setHeading(e.webkitCompassHeading);
      else if (e.absolute && typeof e.alpha === 'number') setHeading((360 - e.alpha) % 360);
    }
    window.addEventListener('deviceorientationabsolute', onOrientation, true);
    window.addEventListener('deviceorientation', onOrientation, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrientation, true);
      window.removeEventListener('deviceorientation', onOrientation, true);
    };
  }, [compassOn]);

  async function enableCompass() {
    setError('');
    try {
      if (needsCompassPermission()) {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') throw new Error('Permission boussole refusée.');
      }
      setCompassOn(true);
    } catch (err) {
      setError(err.message || 'Boussole indisponible.');
    }
  }

  const requestRoute = useCallback(
    async (from) => {
      const now = Date.now();
      if (now - lastRouteReqRef.current < 5000) return;
      lastRouteReqRef.current = now;
      setRouting(true);
      try {
        await gameAction(user, 'parcours-route', { latitude: from.lat, longitude: from.lng });
        await refresh();
      } catch {
        setError('Impossible de calculer le chemin.');
      } finally {
        setRouting(false);
      }
    },
    [user, refresh]
  );

  // Which breadcrumb to aim at, and how far is left along the path.
  const nav = useMemo(() => followRoute(pos, route, targetIdx), [pos, route, targetIdx]);

  // Keep the advanced breadcrumb for the next tick.
  useEffect(() => {
    if (nav && nav.targetIdx !== targetIdx) setTargetIdx(nav.targetIdx);
  }, [nav, targetIdx]);

  // No route yet → fetch one. Already have one → only retie the thread if
  // they're WAY off it and have stayed off for a while (a single bad fix or a
  // short detour must not trigger a reroute).
  useEffect(() => {
    if (!pos || routing || parcours.done) return;

    if (!route.length) {
      requestRoute(pos);
      return;
    }
    if (!nav) return;

    if (nav.offRoute <= WAY_OFF_M) {
      wayOffSinceRef.current = 0;
      return;
    }
    const now = Date.now();
    if (!wayOffSinceRef.current) {
      wayOffSinceRef.current = now;
      return;
    }
    if (
      now - wayOffSinceRef.current >= WAY_OFF_SUSTAIN_MS &&
      now - lastRouteReqRef.current > RECOMPUTE_COOLDOWN_MS
    ) {
      wayOffSinceRef.current = 0;
      setRerouted(true);
      setTimeout(() => setRerouted(false), 6000);
      requestRoute(pos);
    }
  }, [pos, route.length, nav, routing, parcours.done, requestRoute]);

  if (parcours.done) {
    return (
      <div className="parcours-screen">
        <div className="found-done">
          <span className="found-icon">🏛️</span>
          <h2 className="found-title">Parcours terminé !</h2>
          <p className="found-sub">Vous avez retrouvé tous les lieux d’Ariane.</p>
        </div>
        {parcours.found?.length > 0 && (
          <ol className="mini-board">
            {parcours.found.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <span>
                  {i + 1}. {f.name}
                </span>
                <strong>+{f.points}</strong>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  const warmth = nav ? warmthFor(nav.remaining) : null;
  const arrowRotation = heading != null && nav ? nav.bearing - heading : null;
  const arrived = nav && nav.atEnd && nav.toTarget <= ARRIVAL_M;

  useEffect(() => {
    if (!arrived || !pos || arrivingRef.current || parcours.done) return;
    arrivingRef.current = true;
    gameAction(user, 'parcours-arrive', {
      latitude: pos.lat,
      longitude: pos.lng,
      accuracy: pos.accuracy,
    })
      .then((result) => {
        if (!result.found && !result.alreadyFound && !result.done) {
          arrivingRef.current = false;
          if (result.tooFar) setError(`Encore ${formatDistance(result.distance)}.`);
        }
        if (result.found || result.alreadyFound || result.done) onFound?.(result);
        refresh();
      })
      .catch(() => {
        arrivingRef.current = false;
        setError('Impossible de valider le lieu.');
      });
  }, [arrived, pos, parcours.done, user, refresh, onFound]);

  return (
    <div className="parcours-screen">
      <div className="parcours-head">
        <span className="parcours-step">
          Lieu {Math.min(parcours.index + 1, parcours.total)} / {parcours.total}
        </span>
        {parcours.destination?.name && (
          <span className="parcours-name">{parcours.destination.name}</span>
        )}
      </div>

      <div className="compass-hero">
        {!pos ? (
          <div className="compass-waiting">
            <span>📡</span>
            <p>Recherche du signal des dieux…</p>
          </div>
        ) : !route.length ? (
          <div className="compass-waiting">
            <span>🧵</span>
            <p>{routing ? 'Ariane déroule son fil…' : 'Préparation du chemin…'}</p>
          </div>
        ) : arrived ? (
          <div className="compass-near">
            <span className="compass-near-ring" />
            <span className="compass-near-ring compass-near-ring-2" />
            <span className="compass-near-dot">📲</span>
          </div>
        ) : arrowRotation != null ? (
          <svg
            className="compass-arrow"
            style={{ transform: `rotate(${arrowRotation}deg)` }}
            viewBox="0 0 100 100"
          >
            <path
              d="M50 3 L81 76 L50 58 L19 76 Z"
              fill={warmth ? warmth.color : '#241608'}
              stroke="rgba(36,22,8,0.6)"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <div className="compass-cardinal">{cardinalFr(nav.bearing)}</div>
        )}

        {nav && !arrived && <div className="compass-distance">{formatDistance(nav.remaining)}</div>}
        {arrived && <div className="compass-arrival-hint">Tu y es ! Ariane noue le fil...</div>}
      </div>

      {!compassOn && (
        <button className="btn btn-primary" onClick={enableCompass} type="button">
          🧭 Activer la boussole
        </button>
      )}
      {compassOn && heading == null && nav && (
        <p className="hint-live">Boussole en éveil… le chemin part vers le {cardinalFr(nav.bearing)}.</p>
      )}
      {rerouted || routing ? (
        <p className="hint-live">🧵 Ariane retisse son fil depuis ta position…</p>
      ) : (
        nav &&
        nav.offRoute > WAY_OFF_M && (
          <p className="hint-live">Tu es loin du chemin — reviens vers la flèche.</p>
        )
      )}
      {parcours.destination?.hint && arrived && (
        <p className="hint-live">💡 {parcours.destination.hint}</p>
      )}

      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
