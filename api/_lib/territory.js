// Vector territory engine — paper.io on foot, unbounded (the whole map is
// the arena). Teams own MultiPolygons; walking outside your territory leaves
// a GPS trail, and re-entering your territory closes the loop: the enclosed
// polygon is unioned into your land and subtracted from everyone else's.
//
// Geometry format: GeoJSON-style MultiPolygon = [polygon...],
// polygon = [ring...] (first = outer, rest = holes), ring = [[lng,lat]...].
// Firestore cannot store nested arrays, so geometries live in the challenge
// doc as JSON strings: territories.{uid}, trails.{uid}, tracks.{uid}.

import polygonClipping from 'polygon-clipping';

export const SEED_RADIUS_M = 25;
const MIN_CAPTURE_M2 = 150;
const MIN_TRAIL_POINT_M = 3;
const MAX_TRAIL_POINTS = 500;
const MAX_TRACK_POINTS = 700;
const GPS_JUMP_M = 200;
const SIMPLIFY_M = 2;

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function metersPerDeg(lat) {
  return { mLat: 111320, mLng: 111320 * Math.cos((lat * Math.PI) / 180) };
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

export function parseGeom(json, fallback) {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

// A near-circle polygon used to seed a team's home base.
export function circleMultiPolygon(lat, lng, radiusM, steps = 16) {
  const { mLat, mLng } = metersPerDeg(lat);
  const ring = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([
      round6(lng + (Math.cos(a) * radiusM) / mLng),
      round6(lat + (Math.sin(a) * radiusM) / mLat),
    ]);
  }
  ring.push(ring[0]);
  return [[ring]];
}

export function pointInMultiPolygon(mp, lng, lat) {
  let inside = false;
  for (const polygon of mp || []) {
    for (let r = 0; r < polygon.length; r++) {
      const ring = polygon[r];
      let hit = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
          hit = !hit;
        }
      }
      if (r === 0 && hit) inside = !inside ? true : inside;
      if (r === 0 && !hit) break; // not in outer ring → holes irrelevant
      if (r > 0 && hit) return false; // inside a hole of this polygon
    }
    if (inside) return true;
  }
  return inside;
}

// Shoelace area in m² (equirectangular approximation — fine at camp scale).
export function multiPolygonAreaM2(mp) {
  let total = 0;
  for (const polygon of mp || []) {
    polygon.forEach((ring, r) => {
      if (ring.length < 3) return;
      const { mLat, mLng } = metersPerDeg(ring[0][1]);
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

// Drop ring points closer than `tolM` meters to the previously kept one.
function simplifyMultiPolygon(mp, tolM = SIMPLIFY_M) {
  return (mp || [])
    .map((polygon) =>
      polygon
        .map((ring) => {
          if (ring.length <= 8) return ring;
          const kept = [ring[0]];
          for (let i = 1; i < ring.length - 1; i++) {
            const prev = kept[kept.length - 1];
            if (haversineMeters(prev[1], prev[0], ring[i][1], ring[i][0]) >= tolM) {
              kept.push(ring[i]);
            }
          }
          kept.push(ring[ring.length - 1]);
          return kept.length >= 4 ? kept : ring;
        })
        .filter((ring) => ring.length >= 4)
    )
    .filter((polygon) => polygon.length > 0);
}

function safeUnion(a, b) {
  try {
    return simplifyMultiPolygon(polygonClipping.union(a, b));
  } catch {
    return a;
  }
}

function safeDifference(a, b) {
  try {
    return simplifyMultiPolygon(polygonClipping.difference(a, b));
  } catch {
    return a;
  }
}

// Normalize a (possibly self-intersecting) closed trail loop into a valid
// MultiPolygon; returns null when degenerate.
function loopToPolygon(trail, closingPoint) {
  const ring = [...trail, closingPoint, trail[0]].map(([x, y]) => [round6(x), round6(y)]);
  const deduped = ring.filter(
    (p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]
  );
  if (deduped.length < 4) return null;
  try {
    const normalized = polygonClipping.union([deduped]);
    return normalized.length ? normalized : null;
  } catch {
    return null;
  }
}

/**
 * Apply one GPS move. `challenge` carries the raw Firestore fields
 * (territories/trails/tracks maps of JSON strings + config.teamNames).
 * Returns { updates, captured, areaM2 } where `updates` are Firestore
 * field-path updates (JSON strings), or null if the uid is not a team.
 */
export function applyTerritoryMove(challenge, uid, lat, lng) {
  if (!challenge.config?.teamNames?.[uid]) return null;
  const point = [round6(lng), round6(lat)];
  const updates = {};

  let territory = parseGeom(challenge.territories?.[uid], []);
  let trail = parseGeom(challenge.trails?.[uid], []);
  const track = parseGeom(challenge.tracks?.[uid], []);

  // Run-tracker history: keep the walked path for the end-of-game replay.
  const lastTrack = track[track.length - 1];
  const jumped =
    lastTrack && haversineMeters(lastTrack[1], lastTrack[0], lat, lng) > GPS_JUMP_M;
  if (!lastTrack || haversineMeters(lastTrack[1], lastTrack[0], lat, lng) >= MIN_TRAIL_POINT_M) {
    track.push(point);
    if (track.length > MAX_TRACK_POINTS) track.splice(0, track.length - MAX_TRACK_POINTS);
    updates[`tracks.${uid}`] = JSON.stringify(track);
  }

  // Bad GPS fix: don't connect a capture line across a teleport.
  if (jumped) {
    updates[`trails.${uid}`] = JSON.stringify([]);
    return { updates, captured: false, areaM2: multiPolygonAreaM2(territory) };
  }

  // No land yet (or fully eaten): seed a home disc right here, stealing it
  // from whoever holds the ground.
  if (!territory.length) {
    territory = circleMultiPolygon(lat, lng, challenge.config.seedRadiusM || SEED_RADIUS_M);
    updates[`territories.${uid}`] = JSON.stringify(territory);
    updates[`trails.${uid}`] = JSON.stringify([]);
    for (const otherUid of Object.keys(challenge.config.teamNames)) {
      if (otherUid === uid) continue;
      const other = parseGeom(challenge.territories?.[otherUid], []);
      if (other.length) {
        updates[`territories.${otherUid}`] = JSON.stringify(safeDifference(other, territory));
      }
    }
    return { updates, captured: true, areaM2: multiPolygonAreaM2(territory) };
  }

  const inside = pointInMultiPolygon(territory, point[0], point[1]);

  if (!inside) {
    const lastTrail = trail[trail.length - 1];
    if (!lastTrail || haversineMeters(lastTrail[1], lastTrail[0], lat, lng) >= MIN_TRAIL_POINT_M) {
      trail.push(point);
      if (trail.length > MAX_TRAIL_POINTS) trail.splice(0, trail.length - MAX_TRAIL_POINTS);
      updates[`trails.${uid}`] = JSON.stringify(trail);
    }
    return { updates, captured: false, areaM2: multiPolygonAreaM2(territory) };
  }

  // Back home: close the loop and capture.
  let captured = false;
  if (trail.length >= 3) {
    const loop = loopToPolygon(trail, point);
    if (loop && multiPolygonAreaM2(loop) >= MIN_CAPTURE_M2) {
      territory = safeUnion(territory, loop);
      updates[`territories.${uid}`] = JSON.stringify(territory);
      for (const otherUid of Object.keys(challenge.config.teamNames)) {
        if (otherUid === uid) continue;
        const other = parseGeom(challenge.territories?.[otherUid], []);
        if (other.length) {
          updates[`territories.${otherUid}`] = JSON.stringify(safeDifference(other, loop));
        }
      }
      captured = true;
    }
  }
  if (trail.length) updates[`trails.${uid}`] = JSON.stringify([]);

  return { updates, captured, areaM2: multiPolygonAreaM2(territory) };
}

// Per-team areas for views and final ranking.
export function territoryAreas(challenge) {
  const areas = {};
  for (const uid of Object.keys(challenge.config?.teamNames || {})) {
    areas[uid] = Math.round(multiPolygonAreaM2(parseGeom(challenge.territories?.[uid], [])));
  }
  return areas;
}
