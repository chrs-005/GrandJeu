import { useEffect, useMemo, useRef, useState } from 'react';
import { gameAction } from '../../services/api';
import { teamInfo } from '../../config/gameConfig';
import { haversineMeters, mpToLatLngPolygons, lngLatToLatLng, formatArea } from '../../utils/geo';
import SatMap from '../SatMap';

const MOVE_INTERVAL_MS = 4000;
const MIN_MOVE_METERS = 2;
const RANK_SUFFIX = ['ᵉʳ', 'ᵉ', 'ᵉ', 'ᵉ', 'ᵉ'];

export default function TerritoryChallenge({ user, challenge, refresh }) {
  const [pos, setPos] = useState(challenge.mockPos || null);
  const [capturedFlash, setCapturedFlash] = useState(false);
  const [error, setError] = useState('');
  const lastSentRef = useRef({ at: 0, lat: null, lng: null });
  const watchRef = useRef(null);

  const myUid = challenge.mockMeUid || user.uid;
  const running = challenge.running;

  // Own GPS watch: live blue-dot + feeds moves to the server.
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('GPS non supporté sur cet appareil.');
      return undefined;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setPos({ lat: latitude, lng: longitude });
        setError('');

        if (!running) return;
        const last = lastSentRef.current;
        const now = Date.now();
        if (now - last.at < MOVE_INTERVAL_MS) return;
        if (
          last.lat != null &&
          haversineMeters(last.lat, last.lng, latitude, longitude) < MIN_MOVE_METERS
        ) {
          return;
        }
        lastSentRef.current = { at: now, lat: latitude, lng: longitude };
        gameAction(user, 'territory-move', {
          challengeId: challenge.id,
          latitude,
          longitude,
        })
          .then((result) => {
            if (result.captured) {
              setCapturedFlash(true);
              setTimeout(() => setCapturedFlash(false), 2500);
              refresh();
            }
          })
          .catch(() => {});
      },
      (err) => setError(err.message || 'Active le GPS pour conquérir.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge.id, running, user]);

  const teams = challenge.teams || [];
  const myRankIndex = teams.findIndex((t) => t.uid === myUid);
  const me = teams[myRankIndex] || null;
  const myInfo = me ? teamInfo(me.username) : teamInfo('');

  const vectors = useMemo(() => {
    const polygons = [];
    const lines = [];
    teams.forEach((team) => {
      const info = teamInfo(team.username);
      mpToLatLngPolygons(challenge.territories?.[team.uid]).forEach((rings, i) => {
        polygons.push({ id: `${team.uid}-${i}`, rings, color: info.neon });
      });
      const trail = challenge.trails?.[team.uid];
      if (trail?.length > 1) {
        lines.push({
          id: `trail-${team.uid}`,
          points: lngLatToLatLng(trail),
          color: info.neon,
          weight: team.uid === myUid ? 6 : 4,
          casing: true,
        });
      }
    });
    // Run-tracker replay: once it's over, your full walked path in white.
    if (!running && challenge.tracks?.[myUid]?.length > 1) {
      lines.push({
        id: 'my-track',
        points: lngLatToLatLng(challenge.tracks[myUid]),
        color: '#ffffff',
        weight: 3,
        dashed: true,
        opacity: 0.9,
      });
    }
    return { polygons, lines };
  }, [teams, challenge.territories, challenge.trails, challenge.tracks, running, myUid]);

  const markers = pos
    ? [{ id: 'me', lat: pos.lat, lng: pos.lng, emblem: myInfo.emblem, color: myInfo.neon, big: true, pulse: running }]
    : [];

  const totalArea = teams.reduce((sum, t) => sum + (t.areaM2 || 0), 0);

  return (
    <div className="territory-challenge">
      {capturedFlash && <div className="alert alert-success">⚔️ Zone conquise pour {myInfo.god} !</div>}

      <div className="terr-stats">
        <div className="terr-stat">
          <span className="terr-stat-value" style={{ color: myInfo.neon }}>
            {formatArea(me?.areaM2 || 0)}
          </span>
          <span className="terr-stat-label">ton empire</span>
        </div>
        <div className="terr-stat">
          <span className="terr-stat-value">
            {myRankIndex >= 0 ? `${myRankIndex + 1}${RANK_SUFFIX[myRankIndex] || 'ᵉ'}` : '—'}
            <small> / {teams.length}</small>
          </span>
          <span className="terr-stat-label">rang</span>
        </div>
      </div>

      <SatMap
        basemap="dark"
        center={pos || undefined}
        fit="vectors"
        follow={running ? pos : null}
        height={380}
        markers={markers}
        vectors={vectors}
        zoom={17}
      />

      {!running && (
        <div className="alert alert-info">
          🏁 Conquête terminée ! Ton parcours complet est tracé en blanc sur la carte.
        </div>
      )}

      <ol className="mini-board">
        {teams.map((team, index) => {
          const info = teamInfo(team.username);
          const pct = totalArea > 0 ? Math.round(((team.areaM2 || 0) / totalArea) * 100) : 0;
          return (
            <li className={team.uid === myUid ? 'is-me' : ''} key={team.uid}>
              <span>
                {index + 1}. <span className="terr-dot" style={{ background: info.neon }} />{' '}
                {info.emblem} {info.title}
              </span>
              <strong>
                {formatArea(team.areaM2 || 0)} <small>({pct}%)</small>
              </strong>
            </li>
          );
        })}
      </ol>

      {running && (
        <p className="hint-live">
          Marche pour tracer ton sillage, boucle et reviens sur tes terres pour tout capturer —
          toute la ville est le champ de bataille !
        </p>
      )}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
