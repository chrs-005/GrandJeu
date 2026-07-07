import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fieldBounds } from '../utils/geo';

// Esri World Imagery: free satellite tiles, no API key, no place labels.
// The transportation reference layer adds roads only; rendered translucent.
const SAT_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ROADS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';

function emblemIcon(emblem, color, big = false) {
  const size = big ? 34 : 28;
  return L.divIcon({
    className: 'sat-marker-wrap',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="sat-marker${big ? ' sat-marker-big' : ''}" style="border-color:${color}">${emblem}</div>`,
  });
}

// Paint the territory grid + trails onto a canvas → data URL for an image overlay.
function territoryToDataUrl(territory) {
  const { field, grid, trails, colors } = territory;
  const scale = 8;
  const canvas = document.createElement('canvas');
  canvas.width = field.cols * scale;
  canvas.height = field.rows * scale;
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < grid.length; i++) {
    const idx = grid.charCodeAt(i) - 48;
    if (idx < 0 || idx >= colors.length) continue;
    ctx.fillStyle = colors[idx];
    ctx.globalAlpha = 0.55;
    ctx.fillRect((i % field.cols) * scale, Math.floor(i / field.cols) * scale, scale, scale);
  }

  // Trails: lighter dots so pending paths read differently from owned land.
  ctx.globalAlpha = 0.85;
  Object.entries(trails || {}).forEach(([, info]) => {
    const { cells, color } = info;
    ctx.fillStyle = color;
    (cells || []).forEach((c) => {
      const x = (c % field.cols) * scale;
      const y = Math.floor(c / field.cols) * scale;
      ctx.fillRect(x + scale / 4, y + scale / 4, scale / 2, scale / 2);
    });
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
    L.tileLayer(SAT_URL, { maxZoom: 19, attribution: 'Esri' }).addTo(instance);
    L.tileLayer(ROADS_URL, { maxZoom: 19, opacity: 0.45 }).addTo(instance);
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
