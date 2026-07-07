import { useEffect, useMemo, useRef, useState } from 'react';
import { gameAction } from '../../services/api';
import { teamInfo } from '../../config/gameConfig';
import { haversineMeters } from '../../utils/geo';
import SatMap from '../SatMap';

const MOVE_INTERVAL_MS = 4000;
const MIN_MOVE_METERS = 2;

export default function TerritoryChallenge({ user, challenge, refresh }) {
  const [pos, setPos] = useState(challenge.mockPos || null);
  const [outside, setOutside] = useState(false);
  const [capturedFlash, setCapturedFlash] = useState(false);
  const [error, setError] = useState('');
  const lastSentRef = useRef({ at: 0, lat: null, lng: null });
  const watchRef = useRef(null);

  // Own GPS watch: shows "me" on the map and feeds moves to the server.
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

        if (!challenge.running) return;
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
            setOutside(Boolean(result.outside));
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
  }, [challenge.id, challenge.running, user]);

  const colorByIndex = useMemo(() => {
    const colors = [];
    (challenge.teams || []).forEach((team) => {
      colors[team.index] = teamInfo(team.username).color;
    });
    return colors;
  }, [challenge.teams]);

  const territory = useMemo(() => {
    if (!challenge.field || !challenge.grid) return null;
    const trails = {};
    Object.entries(challenge.trails || {}).forEach(([uid, cells]) => {
      const team = (challenge.teams || []).find((t) => t.uid === uid);
      if (team) trails[uid] = { cells, color: colorByIndex[team.index] || '#fff' };
    });
    return { field: challenge.field, grid: challenge.grid, trails, colors: colorByIndex };
  }, [challenge.field, challenge.grid, challenge.trails, challenge.teams, colorByIndex]);

  const me =
    (challenge.teams || []).find((t) => t.uid === user.uid) ||
    (challenge.teams || []).find((t) => t.index === challenge.ownIndex);
  const myInfo = me ? teamInfo(me.username) : null;
  const markers = pos && myInfo
    ? [{ id: 'me', lat: pos.lat, lng: pos.lng, emblem: myInfo.emblem, color: myInfo.color, big: true }]
    : [];

  const totalCells = challenge.field ? challenge.field.cols * challenge.field.rows : 1;

  return (
    <div className="territory-challenge">
      {capturedFlash && <div className="alert alert-success">⚔️ Zone conquise pour {myInfo?.god} !</div>}
      {outside && (
        <div className="alert alert-error">
          🚧 Vous êtes hors du champ de bataille ! Revenez dans la zone.
        </div>
      )}

      <SatMap
        center={challenge.field ? { lat: challenge.field.centerLat, lng: challenge.field.centerLng } : null}
        fit="territory"
        height={340}
        markers={markers}
        territory={territory}
        zoom={16}
      />

      <ol className="mini-board">
        {(challenge.teams || []).map((team, index) => {
          const info = teamInfo(team.username);
          const pct = Math.round((team.cells / totalCells) * 100);
          return (
            <li className={team.uid === user.uid ? 'is-me' : ''} key={team.uid}>
              <span>
                {index + 1}. {info.emblem} {info.title}
              </span>
              <strong>
                {team.cells} <small>({pct}%)</small>
              </strong>
            </li>
          );
        })}
      </ol>

      <p className="hint-live">
        Sors de ton territoire, marche en boucle et reviens chez toi pour capturer la zone !
      </p>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
