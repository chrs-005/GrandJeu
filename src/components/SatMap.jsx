import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fieldBounds } from '../utils/geo';

// Pure satellite imagery, zero labels/street names.
// Mapbox Satellite when a token is configured (VITE_MAPBOX_TOKEN), otherwise
// Esri World Imagery (free, keyless). Both are label-free photo layers.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const SAT_URL = MAPBOX_TOKEN
  ? `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`
  : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SAT_ATTRIBUTION = MAPBOX_TOKEN ? '© Mapbox © Maxar' : 'Esri, Maxar';

function emblemIcon(emblem, color, big = false) {
  const size = big ? 34 : 28;
  return L.divIcon({
    className: 'sat-marker-wrap',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="sat-marker${big ? ' sat-marker-big' : ''}" style="border-color:${color}">${emblem}</div>`,
  });
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Paint the territory grid + trails onto a canvas → data URL for an image overlay.
// The grid is square cells, but we render organic paper.io-style shapes:
// each team's cells are blurred then alpha-thresholded (rounds every corner),
// and trails are drawn as smooth ribbons through the cell centers.
function territoryToDataUrl(territory) {
  const { field, grid, trails, colors } = territory;
  const scale = 12;
  const width = field.cols * scale;
  const height = field.rows * scale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const offCtx = off.getContext('2d');

  colors.forEach((color, teamIdx) => {
    if (!color) return;
    const teamCode = 48 + teamIdx; // '0' + idx
    offCtx.clearRect(0, 0, width, height);
    offCtx.filter = `blur(${scale * 0.6}px)`;
    offCtx.fillStyle = '#fff';
    for (let i = 0; i < grid.length; i++) {
      if (grid.charCodeAt(i) !== teamCode) continue;
      offCtx.fillRect(
        (i % field.cols) * scale - 1,
        Math.floor(i / field.cols) * scale - 1,
        scale + 2,
        scale + 2
      );
    }
    offCtx.filter = 'none';

    // Threshold the blur into a crisp rounded region in the team color.
    const img = offCtx.getImageData(0, 0, width, height);
    const [r, g, b] = hexToRgb(color);
    const data = img.data;
    for (let p = 3; p < data.length; p += 4) {
      if (data[p] > 110) {
        data[p - 3] = r;
        data[p - 2] = g;
        data[p - 1] = b;
        data[p] = 155;
      } else {
        data[p] = 0;
      }
    }
    offCtx.putImageData(img, 0, 0);
    ctx.drawImage(off, 0, 0);
  });

  // Trails: smooth ribbons through cell centers (quadratic midpoint curve).
  Object.values(trails || {}).forEach(({ cells, color }) => {
    if (!cells?.length) return;
    const pts = cells.map((c) => [
      ((c % field.cols) + 0.5) * scale,
      (Math.floor(c / field.cols) + 0.5) * scale,
    ]);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = scale * 0.75;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], scale * 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.quadraticCurveTo(
          pts[i][0],
          pts[i][1],
          (pts[i][0] + pts[i + 1][0]) / 2,
          (pts[i][1] + pts[i + 1][1]) / 2
        );
      }
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });

  return canvas.toDataURL();
}

/**
 * Satellite map wrapper.
 * - center {lat,lng} + zoom: initial view
 * - onPick(latlng): map click callback (admin pin drop)
 * - pin {lat,lng,color?}: single target pin
 * - pinRadiusM: circle around the pin
 * - markers: [{id, lat, lng, emblem, color, big?, label?}]
 * - territory: {field, grid, trails: {uid:{cells,color}}, colors: [by index]}
 * - rectBounds: [[n,w],[s,e]] preview rectangle
 * - fit: 'territory' | 'markers' | null — what to auto-frame once data arrives
 */
export default function SatMap({
  center,
  zoom = 17,
  height = 320,
  onPick,
  pin,
  pinRadiusM,
  markers = [],
  territory,
  rectBounds,
  fit = null,
}) {
  const divRef = useRef(null);
  const [map, setMap] = useState(null);
  const objectsRef = useRef({ markers: new Map(), pin: null, pinCircle: null, overlay: null, rect: null });
  const fittedRef = useRef(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    // Fresh layer cache for this map instance (StrictMode remounts the map).
    objectsRef.current = { markers: new Map(), pin: null, pinCircle: null, overlay: null, rect: null };
    fittedRef.current = false;
    const instance = L.map(divRef.current, {
      center: [center?.lat ?? 33.8938, center?.lng ?? 35.5018],
      zoom,
      attributionControl: true,
    });
    instance.attributionControl.setPrefix(false);
    L.tileLayer(SAT_URL, { maxZoom: 19, attribution: SAT_ATTRIBUTION }).addTo(instance);
    instance.on('click', (e) => onPickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    setMap(instance);
    return () => {
      instance.remove();
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Target pin + arrival radius
  useEffect(() => {
    const objs = objectsRef.current;
    if (!map) return;
    if (objs.pin) {
      objs.pin.remove();
      objs.pin = null;
    }
    if (objs.pinCircle) {
      objs.pinCircle.remove();
      objs.pinCircle = null;
    }
    if (pin) {
      objs.pin = L.marker([pin.lat, pin.lng], {
        icon: emblemIcon('📍', pin.color || '#e03d20', true),
      }).addTo(map);
      // Typed coordinates can land far outside the current view.
      if (!map.getBounds().contains([pin.lat, pin.lng])) {
        map.panTo([pin.lat, pin.lng]);
      }
      if (pinRadiusM) {
        objs.pinCircle = L.circle([pin.lat, pin.lng], {
          radius: pinRadiusM,
          color: pin.color || '#e03d20',
          weight: 2,
          fillOpacity: 0.15,
        }).addTo(map);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pin?.lat, pin?.lng, pin?.color, pinRadiusM]);

  // Team markers (diff by id)
  useEffect(() => {
    const objs = objectsRef.current;
    if (!map) return;
    const seen = new Set();
    markers.forEach((m) => {
      seen.add(m.id);
      const existing = objs.markers.get(m.id);
      if (existing) {
        existing.setLatLng([m.lat, m.lng]);
      } else {
        const marker = L.marker([m.lat, m.lng], {
          icon: emblemIcon(m.emblem, m.color, m.big),
          title: m.label || '',
        }).addTo(map);
        objs.markers.set(m.id, marker);
      }
    });
    [...objs.markers.keys()].forEach((id) => {
      if (!seen.has(id)) {
        objs.markers.get(id).remove();
        objs.markers.delete(id);
      }
    });
    if (fit === 'markers' && !fittedRef.current && markers.length) {
      fittedRef.current = true;
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng]));
      map.fitBounds(bounds.pad(0.3), { maxZoom: 17 });
    }
  }, [map, markers, fit]);

  // Territory grid overlay
  useEffect(() => {
    const objs = objectsRef.current;
    if (!map) return;
    if (!territory) {
      if (objs.overlay) {
        objs.overlay.remove();
        objs.overlay = null;
      }
      return;
    }
    const url = territoryToDataUrl(territory);
    const bounds = fieldBounds(territory.field);
    if (objs.overlay) {
      objs.overlay.setUrl(url);
    } else {
      objs.overlay = L.imageOverlay(url, bounds, {
        opacity: 1,
        interactive: false,
        className: 'territory-overlay',
      }).addTo(map);
      if (fit === 'territory' && !fittedRef.current) {
        fittedRef.current = true;
        map.fitBounds(bounds, { padding: [12, 12] });
      }
    }
  }, [map, territory, fit]);

  // Launch-preview rectangle
  useEffect(() => {
    const objs = objectsRef.current;
    if (!map) return;
    if (objs.rect) {
      objs.rect.remove();
      objs.rect = null;
    }
    if (rectBounds) {
      objs.rect = L.rectangle(rectBounds, {
        color: '#ecd9a8',
        weight: 2,
        dashArray: '6 6',
        fillColor: '#c9711f',
        fillOpacity: 0.12,
      }).addTo(map);
    }
  }, [map, rectBounds]);

  return <div className="sat-map" ref={divRef} style={{ height }} />;
}
