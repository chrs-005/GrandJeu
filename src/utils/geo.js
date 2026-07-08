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

export function formatArea(m2) {
  if (m2 >= 20000) {
    return `${(m2 / 10000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ha`;
  }
  return `${Math.round(m2).toLocaleString('fr-FR')} m²`;
}
