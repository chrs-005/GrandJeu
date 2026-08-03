// Walking-route fetching + breadcrumb generation for the Fil d'Ariane.
// Routes come from OpenRouteService (foot-walking profile) and are chopped
// into evenly spaced points so the compass can guide along the real footpath
// one breadcrumb at a time. Falls back to a straight line if the API is
// unavailable, so the hunt always works.

import { haversineMeters } from './territory.js';

const ORS_URL = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';
const BREADCRUMB_SPACING_M = 20;
const ROUTE_TIMEOUT_MS = 8000;

// Walk the polyline and emit a point every `spacing` metres (interpolating
// inside long segments), always keeping the final destination.
export function decimateRoute(coords, spacing = BREADCRUMB_SPACING_M) {
  if (!coords?.length) return [];
  const out = [coords[0]];
  let carry = 0;

  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const segment = haversineMeters(lat1, lng1, lat2, lng2);
    if (segment < 0.5) continue;

    let travelled = spacing - carry;
    while (travelled <= segment) {
      const t = travelled / segment;
      out.push([
        Math.round((lng1 + (lng2 - lng1) * t) * 1e6) / 1e6,
        Math.round((lat1 + (lat2 - lat1) * t) * 1e6) / 1e6,
      ]);
      travelled += spacing;
    }
    carry = segment - (travelled - spacing);
  }

  const last = coords[coords.length - 1];
  const tail = out[out.length - 1];
  if (haversineMeters(tail[1], tail[0], last[1], last[0]) > 3) out.push(last);
  return out;
}

export function routeLengthMeters(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1][1], points[i - 1][0], points[i][1], points[i][0]);
  }
  return Math.round(total);
}

function straightLine(from, to) {
  // ~20 m steps along the direct line, so the compass still has breadcrumbs.
  const distance = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  const steps = Math.max(1, Math.round(distance / BREADCRUMB_SPACING_M));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push([
      Math.round((from.lng + (to.lng - from.lng) * t) * 1e6) / 1e6,
      Math.round((from.lat + (to.lat - from.lat) * t) * 1e6) / 1e6,
    ]);
  }
  return points;
}

/**
 * Walking route between two {lat,lng} points.
 * Returns { points: [[lng,lat], …], distanceM, straight: bool }.
 */
export async function fetchWalkingRoute(from, to) {
  const key = process.env.ORS_API_KEY;
  if (!key) {
    const points = straightLine(from, to);
    return { points, distanceM: routeLengthMeters(points), straight: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  try {
    const res = await fetch(ORS_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
        instructions: false,
      }),
    });
    if (!res.ok) throw new Error(`ORS ${res.status}`);
    const data = await res.json();
    const coords = data?.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) throw new Error('Empty route');
    const points = decimateRoute(coords);
    return {
      points,
      distanceM: Math.round(data.features[0]?.properties?.summary?.distance || routeLengthMeters(points)),
      straight: false,
    };
  } catch {
    // Network/quota/no-path — never block the game on routing.
    const points = straightLine(from, to);
    return { points, distanceM: routeLengthMeters(points), straight: true };
  } finally {
    clearTimeout(timer);
  }
}
