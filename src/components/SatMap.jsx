import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Two label-free basemaps:
// - 'sat': satellite photo (Mapbox Satellite when VITE_MAPBOX_TOKEN is set,
//   otherwise Esri World Imagery — both keyless of street names).
// - 'dark': CARTO dark, no labels — run-tracker style, team colors pop.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const BASEMAPS = {
  sat: {
    url: MAPBOX_TOKEN
      ? `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: MAPBOX_TOKEN ? '© Mapbox © Maxar' : 'Esri, Maxar',
    maxZoom: 19,
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap © CARTO',
    maxZoom: 20,
  },
};

function emblemIcon(emblem, color, { big = false, pulse = false } = {}) {
  const size = big ? 34 : 28;
  return L.divIcon({
    className: 'sat-marker-wrap',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="sat-marker${big ? ' sat-marker-big' : ''}" style="border-color:${color}">${
      pulse ? `<span class="sat-marker-pulse" style="border-color:${color}"></span>` : ''
    }${emblem}</div>`,
  });
}

/**
 * Label-free map wrapper.
 * - basemap: 'sat' (default) | 'dark'
 * - center {lat,lng} + zoom: initial view
 * - onPick(latlng): map click callback (admin pin drop)
 * - pin {lat,lng,color?} + pinRadiusM: single target pin with radius circle
 * - markers: [{id, lat, lng, emblem, color, big?, pulse?, label?}]
 * - vectors: {polygons: [{id, rings, color, fillOpacity?}],
 *             lines: [{id, points, color, weight?, casing?, dashed?, opacity?}]}
 *   (rings/points already in Leaflet [lat,lng] order)
 * - follow {lat,lng}: keep this point in view (pans when it leaves the frame)
 * - fit: 'markers' | 'vectors' — what to auto-frame once data first arrives
 */
export default function SatMap({
  basemap = 'sat',
  center,
  zoom = 17,
  height = 320,
  onPick,
  pin,
  pinRadiusM,
  markers = [],
  vectors,
  follow,
  fit = null,
}) {
  const divRef = useRef(null);
  const [map, setMap] = useState(null);
  const objectsRef = useRef({ markers: new Map(), pin: null, pinCircle: null, vectors: null });
  const fittedRef = useRef(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    // Fresh layer cache for this map instance (StrictMode remounts the map).
    objectsRef.current = { markers: new Map(), pin: null, pinCircle: null, vectors: null };
    fittedRef.current = false;
    const instance = L.map(divRef.current, {
      center: [center?.lat ?? 33.8938, center?.lng ?? 35.5018],
      zoom,
      attributionControl: true,
    });
    instance.attributionControl.setPrefix(false);
    const base = BASEMAPS[basemap] || BASEMAPS.sat;
    L.tileLayer(base.url, { maxZoom: base.maxZoom, attribution: base.attribution }).addTo(instance);
    instance.on('click', (e) => onPickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    setMap(instance);
    return () => {
      instance.remove();
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

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
        icon: emblemIcon('📍', pin.color || '#e03d20', { big: true }),
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
          icon: emblemIcon(m.emblem, m.color, { big: m.big, pulse: m.pulse }),
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

  // Vector layers: territory polygons + trail/track ribbons.
  useEffect(() => {
    const objs = objectsRef.current;
    if (!map) return;
    if (objs.vectors) {
      objs.vectors.remove();
      objs.vectors = null;
    }
    if (!vectors) return;
    const group = L.featureGroup();
    (vectors.polygons || []).forEach((p) => {
      L.polygon(p.rings, {
        color: p.color,
        weight: 3,
        opacity: 0.95,
        fillColor: p.color,
        fillOpacity: p.fillOpacity ?? 0.35,
        lineJoin: 'round',
      }).addTo(group);
    });
    (vectors.lines || []).forEach((l) => {
      if (!l.points || l.points.length < 2) return;
      if (l.casing) {
        L.polyline(l.points, {
          color: 'rgba(0,0,0,0.55)',
          weight: (l.weight || 5) + 4,
          lineCap: 'round',
          lineJoin: 'round',
          smoothFactor: 1.5,
        }).addTo(group);
      }
      L.polyline(l.points, {
        color: l.color,
        weight: l.weight || 5,
        opacity: l.opacity ?? 1,
        lineCap: 'round',
        lineJoin: 'round',
        smoothFactor: 1.5,
        dashArray: l.dashed ? '1 12' : null,
      }).addTo(group);
    });
    group.addTo(map);
    objs.vectors = group;
    if (fit === 'vectors' && !fittedRef.current && group.getLayers().length) {
      fittedRef.current = true;
      map.fitBounds(group.getBounds().pad(0.25), { maxZoom: 18 });
    }
  }, [map, vectors, fit]);

  // Run-tracker follow: keep own position in frame without fighting user pans.
  useEffect(() => {
    if (!map || !follow) return;
    if (!map.getBounds().pad(-0.15).contains([follow.lat, follow.lng])) {
      map.panTo([follow.lat, follow.lng]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, follow?.lat, follow?.lng]);

  return <div className="sat-map" ref={divRef} style={{ height }} />;
}
