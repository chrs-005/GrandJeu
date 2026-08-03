import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameAction } from '../services/api';
import { followRoute, cardinalFr, formatDistance, warmthFor } from '../utils/geo';

const OFF_ROUTE_M = 70; // beyond this we ask the server for a fresh route
const RECOMPUTE_COOLDOWN_MS = 60_000;
const ARRIVAL_M = 30; // "you're there, hunt for the tag"

function needsCompassPermission() {
  return (
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function'
  );
}

export default function ParcoursScreen({ user, parcours, refresh }) {
  const [pos, setPos] = useState(null);
  const [heading, setHeading] = useState(null);
  const [compassOn, setCompassOn] = useState(false);
  const [error, setError] = useState('');
  const [targetIdx, setTargetIdx] = useState(0);
  const [routing, setRouting] = useState(false);
  const lastRouteReqRef = useRef(0);

  // The poll hands back a fresh array each time; key it so identity is stable.
  const routeKey = parcours.route?.length
    ? `${parcours.route.length}:${parcours.route[0]?.join()}`
    : 'none';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const route = useMemo(() => parcours.route || [], [routeKey]);

  // New leg → start from the first breadcrumb again.
  useEffect(() => {
    setTargetIdx(0);
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

  // No route yet, or we've wandered far off it → ask the server for one.
  useEffect(() => {
    if (!pos || routing || parcours.done) return;
    const stale = nav && nav.offRoute > OFF_ROUTE_M;
    if (!route.length) {
      requestRoute(pos);
    } else if (stale && Date.now() - lastRouteReqRef.current > RECOMPUTE_COOLDOWN_MS) {
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
        {arrived && <div className="compass-nfc-hint">Tu y es ! Cherche le tag et touche-le 📲</div>}
      </div>

      {!compassOn && (
        <button className="btn btn-primary" onClick={enableCompass} type="button">
          🧭 Activer la boussole
        </button>
      )}
      {compassOn && heading == null && nav && (
        <p className="hint-live">Boussole en éveil… le chemin part vers le {cardinalFr(nav.bearing)}.</p>
      )}
      {nav && nav.offRoute > OFF_ROUTE_M && !routing && (
        <p className="hint-live">Tu t’es éloigné du chemin — Ariane le recalcule…</p>
      )}
      {parcours.destination?.hint && arrived && (
        <p className="hint-live">💡 {parcours.destination.hint}</p>
      )}

      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
