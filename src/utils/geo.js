// Client-side geometry helpers (mirrors api/_lib/territory.js where needed).

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Initial bearing in degrees (0 = north, clockwise) from point 1 to point 2.
export function bearingDeg(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLng = (lng2 - lng1) * rad;
  const y = Math.sin(dLng) * Math.cos(lat2 * rad);
  const x =
    Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
    Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function cardinalFr(bearing) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(bearing / 45) % 8];
}

export function formatDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

// Hot/cold ladder for the guide challenge.
const WARMTH = [
  { max: 25, label: 'BRÛLANT !', color: '#e03d20', glow: '#ff6a3c' },
  { max: 75, label: 'Très chaud', color: '#c9501f', glow: '#e07a3c' },
  { max: 150, label: 'Chaud', color: '#c97a1f', glow: '#e0a03c' },
  { max: 300, label: 'Tiède', color: '#b3952e', glow: '#cbb44e' },
  { max: 600, label: 'Frais', color: '#5d8a8a', glow: '#7dabab' },
  { max: 1200, label: 'Froid', color: '#4a6b8a', glow: '#6a8cab' },
  { max: Infinity, label: 'Glacial…', color: '#35496e', glow: '#54688e' },
];

export function warmthFor(meters) {
  return WARMTH.find((w) => meters <= w.max);
}

// GeoJSON-style MultiPolygon ([lng,lat]) → Leaflet polygons ([lat,lng] rings).
export function mpToLatLngPolygons(mp) {
  return (mp || []).map((polygon) => polygon.map((ring) => ring.map(([lng, lat]) => [lat, lng])));
}

export function lngLatToLatLng(points) {
  return (points || []).map(([lng, lat]) => [lat, lng]);
}

// Shoelace area in m² (mirror of the server helper, for admin display).
export function multiPolygonAreaM2(mp) {
  let total = 0;
  for (const polygon of mp || []) {
    polygon.forEach((ring, r) => {
      if (ring.length < 3) return;
      const mLat = 111320;
      const mLng = 111320 * Math.cos((ring[0][1] * Math.PI) / 180);
      let sum = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        sum += (ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]) * mLng * mLat;
      }
      const area = Math.abs(sum / 2);
      total += r === 0 ? area : -area;
    });
  }
  return Math.max(0, total);
}

/**
 * Route following for Le Fil d'Ariane. Given the walker's position, the
 * breadcrumb trail ([[lng,lat], …]) and the breadcrumb we were heading to,
 * work out which one to aim at now and how far is left along the path.
 * Advances (and skips ahead within `lookahead`) so cutting a corner or a GPS
 * jump never leaves the arrow pointing backwards at a passed breadcrumb.
 */
export function followRoute(pos, route, fromIdx = 0, { advanceM = 14, lookahead = 6 } = {}) {
  if (!pos || !route?.length) return null;

  let targetIdx = Math.min(Math.max(fromIdx, 0), route.length - 1);
  const limit = Math.min(route.length - 1, targetIdx + lookahead);
  for (let i = targetIdx; i <= limit; i++) {
    if (haversineMeters(pos.lat, pos.lng, route[i][1], route[i][0]) <= advanceM) {
      targetIdx = Math.min(i + 1, route.length - 1);
    }
  }

  let target = route[targetIdx];
  let toTarget = haversineMeters(pos.lat, pos.lng, target[1], target[0]);

  // GPS dropped out while they kept walking: the target is far behind them.
  // Snap forward to the nearest breadcrumb ahead (never backwards) so the
  // arrow doesn't send them back the way they came.
  if (toTarget > 40) {
    let nearest = targetIdx;
    let nearestDist = toTarget;
    for (let i = targetIdx + 1; i < route.length; i++) {
      const d = haversineMeters(pos.lat, pos.lng, route[i][1], route[i][0]);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    }
    if (nearest > targetIdx && nearestDist < toTarget - 10) {
      targetIdx = Math.min(nearest + (nearestDist <= advanceM ? 1 : 0), route.length - 1);
      target = route[targetIdx];
      toTarget = haversineMeters(pos.lat, pos.lng, target[1], target[0]);
    }
  }

  let remaining = toTarget;
  for (let i = targetIdx; i < route.length - 1; i++) {
    remaining += haversineMeters(route[i][1], route[i][0], route[i + 1][1], route[i + 1][0]);
  }

  let offRoute = Infinity;
  for (let i = 0; i < route.length; i++) {
    const d = haversineMeters(pos.lat, pos.lng, route[i][1], route[i][0]);
    if (d < offRoute) offRoute = d;
  }

  return {
    targetIdx,
    bearing: bearingDeg(pos.lat, pos.lng, target[1], target[0]),
    toTarget,
    remaining,
    offRoute,
    atEnd: targetIdx >= route.length - 1,
  };
}

export function formatArea(m2) {
  if (m2 >= 20000) {
    return `${(m2 / 10000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ha`;
  }
  return `${Math.round(m2).toLocaleString('fr-FR')} m²`;
}
