import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchPlayerLocations } from '../services/location';

const MAP_ZOOM = 16;
const TILE_SIZE = 256;

function latLngToWorld(latitude, longitude, zoom) {
  const sinLat = Math.sin((latitude * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function formatAge(updatedAt) {
  if (!updatedAt) return 'unknown';
  const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function LocationMap({ locations }) {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const center = useMemo(() => {
    if (!locations.length) return { latitude: 33.8938, longitude: 35.5018 };
    return {
      latitude: locations.reduce((sum, item) => sum + item.latitude, 0) / locations.length,
      longitude: locations.reduce((sum, item) => sum + item.longitude, 0) / locations.length,
    };
  }, [locations]);

  const centerWorld = latLngToWorld(center.latitude, center.longitude, MAP_ZOOM);
  const minTileX = Math.floor((centerWorld.x - size.width / 2) / TILE_SIZE);
  const maxTileX = Math.floor((centerWorld.x + size.width / 2) / TILE_SIZE);
  const minTileY = Math.floor((centerWorld.y - size.height / 2) / TILE_SIZE);
  const maxTileY = Math.floor((centerWorld.y + size.height / 2) / TILE_SIZE);
  const tileCount = 2 ** MAP_ZOOM;
  const tiles = [];

  if (size.width && size.height) {
    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        if (y < 0 || y >= tileCount) continue;
        const wrappedX = ((x % tileCount) + tileCount) % tileCount;
        tiles.push({
          key: `${x}:${y}`,
          x,
          y,
          src: `https://tile.openstreetmap.org/${MAP_ZOOM}/${wrappedX}/${y}.png`,
          left: x * TILE_SIZE - centerWorld.x + size.width / 2,
          top: y * TILE_SIZE - centerWorld.y + size.height / 2,
        });
      }
    }
  }

  return (
    <div className="location-map" ref={ref}>
      {tiles.map((tile) => (
        <img
          alt=""
          className="map-tile"
          key={tile.key}
          src={tile.src}
          style={{ left: tile.left, top: tile.top }}
        />
      ))}
      {locations.map((location) => {
        const world = latLngToWorld(location.latitude, location.longitude, MAP_ZOOM);
        return (
          <div
            className="map-marker"
            key={location.uid}
            style={{
              left: world.x - centerWorld.x + size.width / 2,
              top: world.y - centerWorld.y + size.height / 2,
            }}
            title={`${location.username} - ${formatAge(location.updatedAt)}`}
          >
            <span>{location.username.slice(0, 2).toUpperCase()}</span>
          </div>
        );
      })}
      {!locations.length && <div className="map-empty">No shared locations yet</div>}
    </div>
  );
}

export default function Admin() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [locations, setLocations] = useState([]);
  const [locationError, setLocationError] = useState('');
  const [locationsLoading, setLocationsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadLocations() {
      if (!currentUser) return;
      setLocationsLoading(true);
      try {
        const items = await fetchPlayerLocations(currentUser);
        if (!cancelled) {
          setLocations(items);
          setLocationError('');
        }
      } catch (err) {
        if (!cancelled) setLocationError(err.message || 'Failed to load locations.');
      } finally {
        if (!cancelled) setLocationsLoading(false);
      }
    }

    loadLocations();
    const interval = setInterval(loadLocations, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser]);

  async function sendNotification(target) {
    setError('');
    setResult(null);
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required.');
      return;
    }
    setSending(true);
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), target }),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 160)}`);
      }

      if (!res.ok || !data.ok) {
        setError(data.error || `Server error: ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err.message || 'Network error. Is the server running?');
    } finally {
      setSending(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="page-center" style={{ alignItems: 'flex-start', paddingTop: 32 }}>
      <div className="card" style={{ maxWidth: 860, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="logo-title">Grand Jeu</h1>
            <span className="badge badge-admin" style={{ marginBottom: 12 }}>Admin</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          Signed in as <strong>{currentUser?.email}</strong>
        </p>

        <section className="info-section">
          <h3 className="section-title">Player Map</h3>
          <LocationMap locations={locations} />
          {locationError && <div className="alert alert-error">{locationError}</div>}
          <div className="location-list">
            {locations.map((location) => (
              <div className="location-list-row" key={location.uid}>
                <strong>{location.username}</strong>
                <span>{formatAge(location.updatedAt)}</span>
              </div>
            ))}
            {!locations.length && (
              <div className="location-list-row">
                <span>{locationsLoading ? 'Loading locations...' : 'No players are sharing yet.'}</span>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 className="section-title">Send Push Notification</h3>

          <div className="field">
            <label htmlFor="notif-title">Title</label>
            <input
              id="notif-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title"
              disabled={sending}
              maxLength={120}
            />
          </div>

          <div className="field">
            <label htmlFor="notif-body">Message</label>
            <textarea
              id="notif-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Notification body text…"
              rows={3}
              disabled={sending}
              maxLength={500}
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="btn-group">
            <button
              className="btn btn-primary"
              onClick={() => sendNotification('all')}
              disabled={sending}
            >
              {sending ? 'Sending…' : 'Send to all users'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => sendNotification('self')}
              disabled={sending}
            >
              Send to myself only
            </button>
          </div>
        </section>

        {result && (
          <div className="result-box">
            <h4 style={{ marginBottom: 8, color: 'var(--success)' }}>Notification sent</h4>
            <div className="result-grid">
              <div className="result-item">
                <span className="result-num">{result.sent ?? 0}</span>
                <span className="result-label">Sent</span>
              </div>
              <div className="result-item">
                <span className="result-num">{result.found ?? 0}</span>
                <span className="result-label">Found</span>
              </div>
              <div className="result-item">
                <span className="result-num" style={{ color: 'var(--warning)' }}>{result.failed ?? 0}</span>
                <span className="result-label">Failed</span>
              </div>
              <div className="result-item">
                <span className="result-num" style={{ color: 'var(--text-muted)' }}>{result.removed ?? 0}</span>
                <span className="result-label">Removed</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <a
            href="/app"
            onClick={(e) => { e.preventDefault(); navigate('/app'); }}
            className="btn btn-ghost"
          >
            ← Back to App
          </a>
        </div>
      </div>
    </div>
  );
}
