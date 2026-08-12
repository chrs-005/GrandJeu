// Le Fil d'Ariane — the persistent location hunt (not a challenge).
// Each team walks its own rotation of the same destinations. Reaching one is
// validated by GPS, which unlocks the walking route to the next.

export const FIXED_FINAL_DESTINATION = {
  id: 'arianne-final',
  name: 'Destination finale',
  lat: 33.8544286,
  lng: 35.7263093,
  hint: null,
  fixed: true,
};

function withoutFixedFinal(destinations = []) {
  return destinations.filter((d) => d?.id !== FIXED_FINAL_DESTINATION.id);
}

export function withFixedFinalDestination(destinations = []) {
  return [...withoutFixedFinal(destinations), FIXED_FINAL_DESTINATION];
}

// Same stops for everyone, rotated start per team, so teams spread out
// instead of trailing each other.
export function buildSequences(destIds, teamUids) {
  const sequences = {};
  teamUids.forEach((uid, teamIndex) => {
    const offset = destIds.length ? teamIndex % destIds.length : 0;
    sequences[uid] = destIds.map((_, i) => destIds[(offset + i) % destIds.length]);
  });
  return sequences;
}

export function normalizeParcours(parcours, teamUids = []) {
  const destinations = withFixedFinalDestination(parcours?.destinations || []);
  const knownUids = Array.from(new Set([
    ...Object.keys(parcours?.sequences || {}),
    ...Object.keys(parcours?.progress || {}),
    ...teamUids,
  ]));
  const sequences = { ...(parcours?.sequences || {}) };
  const progress = { ...(parcours?.progress || {}) };

  knownUids.forEach((uid) => {
    const existing = sequences[uid] || [];
    sequences[uid] = [...existing.filter((id) => id !== FIXED_FINAL_DESTINATION.id), FIXED_FINAL_DESTINATION.id];
    progress[uid] = progress[uid] || { index: 0, found: [], route: '', routeStraight: false };
  });

  return {
    ...(parcours || {}),
    active: true,
    destinations,
    sequences,
    progress,
  };
}

export function currentDestId(parcours, uid) {
  const sequence = parcours.sequences?.[uid] || [];
  const index = parcours.progress?.[uid]?.index ?? 0;
  return sequence[index] || null;
}

export function destinationById(parcours, id) {
  return (parcours.destinations || []).find((d) => d.id === id) || null;
}

// Player-facing view. Deliberately omits destination coordinates — the route
// breadcrumbs are all the compass needs, so nobody can paste the target into
// a maps app and skip the walk.
export function buildParcoursView(parcours, uid) {
  if (!parcours?.active) return null;
  const sequence = parcours.sequences?.[uid] || [];
  const progress = parcours.progress?.[uid] || { index: 0, found: [] };
  const index = progress.index ?? 0;
  const done = index >= sequence.length;
  const destination = done ? null : destinationById(parcours, sequence[index]);

  let route = [];
  try {
    route = progress.route ? JSON.parse(progress.route) : [];
  } catch {
    route = [];
  }

  return {
    active: true,
    index,
    total: sequence.length,
    done,
    destination: destination
      ? { name: destination.name, hint: destination.hint || null }
      : null,
    route,
    routeStraight: Boolean(progress.routeStraight),
    found: (progress.found || []).map((f) => ({
      name: f.name,
      atMs: f.atMs,
      rank: f.rank,
    })),
  };
}

// Admin dashboard view: where every team stands, plus the path each is
// currently following so it can be drawn on the console map.
export function buildParcoursAdminView(parcours) {
  if (!parcours) return null;
  const teams = Object.entries(parcours.sequences || {}).map(([uid, sequence]) => {
    const progress = parcours.progress?.[uid] || { index: 0, found: [] };
    const index = progress.index ?? 0;
    const target = destinationById(parcours, sequence[index]);
    let route = [];
    try {
      route = progress.route ? JSON.parse(progress.route) : [];
    } catch {
      route = [];
    }
    return {
      uid,
      index,
      total: sequence.length,
      done: index >= sequence.length,
      currentName: target?.name || null,
      routeStraight: Boolean(progress.routeStraight),
      route,
      found: (progress.found || []).map((f) => ({ name: f.name, atMs: f.atMs })),
    };
  });
  return {
    active: Boolean(parcours.active),
    destinations: (parcours.destinations || []).map((d) => ({
      id: d.id,
      name: d.name,
      lat: d.lat,
      lng: d.lng,
      hint: d.hint || null,
    })),
    teams,
  };
}
