import { useEffect, useRef, useState } from 'react';
import { gameAction } from '../../services/api';
import { teamInfo } from '../../config/gameConfig';
import { haversineMeters, bearingDeg, cardinalFr, formatDistance, warmthFor } from '../../utils/geo';

const NEAR_FACTOR = 1.5; // within radius×1.5 → AirTag-style "you're here" pulse

function needsCompassPermission() {
  return typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function';
}

export default function GuideChallenge({ user, challenge, refresh }) {
  const [pos, setPos] = useState(challenge.mockPos || null);
  const [heading, setHeading] = useState(null);
  const [compassOn, setCompassOn] = useState(false);
  const [error, setError] = useState('');
  const arrivingRef = useRef(false);
  const watchRef = useRef(null);

  // Own GPS watch: drives distance, warmth and arrival detection.
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('GPS non supporté sur cet appareil.');
      return undefined;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setPos({ lat: latitude, lng: longitude, accuracy });
        setError('');
      },
      (err) => setError(err.message || 'Active le GPS pour suivre le fil.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  // Compass heading (iOS needs an explicit permission tap).
  useEffect(() => {
    if (!compassOn) return undefined;
    function onOrientation(e) {
      if (typeof e.webkitCompassHeading === 'number') {
        setHeading(e.webkitCompassHeading);
      } else if (e.absolute && typeof e.alpha === 'number') {
        setHeading((360 - e.alpha) % 360);
      }
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

  const distance = pos
    ? haversineMeters(pos.lat, pos.lng, challenge.targetLat, challenge.targetLng)
    : null;
  const bearing = pos
    ? bearingDeg(pos.lat, pos.lng, challenge.targetLat, challenge.targetLng)
    : null;
  const warmth = distance != null ? warmthFor(distance) : null;
  const arrowRotation = heading != null && bearing != null ? bearing - heading : null;

  // Auto-arrival: fire once when inside the radius.
  useEffect(() => {
    if (
      !challenge.running ||
      challenge.arrived ||
      arrivingRef.current ||
      distance == null ||
      distance > challenge.radiusM
    ) {
      return;
    }
    arrivingRef.current = true;
    gameAction(user, 'arrive', {
      challengeId: challenge.id,
      latitude: pos.lat,
      longitude: pos.lng,
      accuracy: pos.accuracy,
    })
      .then((result) => {
        if (!result.arrived && !result.alreadyArrived) arrivingRef.current = false;
        refresh();
      })
      .catch(() => {
        arrivingRef.current = false;
      });
  }, [challenge, distance, pos, user, refresh]);

  const finished = challenge.status === 'ended' || !challenge.running;

  return (
    <div className="guide-challenge">
      {challenge.arrived ? (
        <div className="guide-arrived">
          <span className="guide-arrived-icon">🏛️</span>
          <p className="oracle-quote">Vous avez suivi le fil jusqu’au bout !</p>
          <p>
            <span className="points-chip">
              {challenge.arrived.rank}
              {challenge.arrived.rank === 1 ? 'ʳᵉ' : 'ᵉ'} équipe arrivée — +{challenge.arrived.points} pts
            </span>
          </p>
        </div>
      ) : (
        <>
          <div
            className="compass-hero"
            style={
              warmth
                ? { background: `radial-gradient(circle at 50% 40%, ${warmth.glow}, ${warmth.color} 75%)` }
                : undefined
            }
          >
            {pos ? (
              <>
                {distance <= challenge.radiusM * NEAR_FACTOR ? (
                  <div className="compass-near">
                    <span className="compass-near-ring" />
                    <span className="compass-near-ring compass-near-ring-2" />
                    <span className="compass-near-dot">📍</span>
                  </div>
                ) : arrowRotation != null ? (
                  <svg
                    className="compass-arrow"
                    style={{ transform: `rotate(${arrowRotation}deg)` }}
                    viewBox="0 0 100 100"
                  >
                    <path
                      d="M50 3 L81 76 L50 58 L19 76 Z"
                      fill="#17100a"
                      stroke="rgba(236,217,168,0.9)"
                      strokeWidth="3.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <div className="compass-cardinal">{bearing != null ? cardinalFr(bearing) : '…'}</div>
                )}
                <div className="compass-distance">{formatDistance(distance)}</div>
              </>
            ) : (
              <div className="compass-waiting">
                <span>📡</span>
                <p>Recherche du signal des dieux…</p>
              </div>
            )}
          </div>

          {!compassOn && !finished && (
            <button className="btn btn-primary" onClick={enableCompass} type="button">
              🧭 Activer la boussole
            </button>
          )}
          {compassOn && heading == null && (
            <p className="hint-live">Boussole en éveil… bouge un peu le téléphone en huit.</p>
          )}
          {compassOn && heading == null && pos && (
            <p className="hint-live">En attendant, la destination est au {bearing != null ? cardinalFr(bearing) : '…'}.</p>
          )}
        </>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {challenge.arrivals?.length > 0 && (
        <ol className="mini-board">
          {challenge.arrivals.map((entry) => {
            const info = teamInfo(entry.username);
            return (
              <li className={entry.uid === user.uid ? 'is-me' : ''} key={entry.uid}>
                <span>
                  {entry.rank}. {info.emblem} {info.title}
                </span>
                <strong>+{entry.points} pts</strong>
              </li>
            );
          })}
        </ol>
      )}
      {challenge.arrivals?.length === 0 && !challenge.arrived && (
        <p className="hint">Aucune équipe n’est encore arrivée. Soyez les premiers !</p>
      )}
    </div>
  );
}
