// Le Fil d'Ariane — the persistent location hunt (not a challenge).
// Each team walks its own rotation of the same destinations. Reaching one is
// proven by tapping its NFC tag, which unlocks the walking route to the next.

const TOKEN_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes

export function makeToken(length = 6) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return out;
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

export function findDestinationByToken(parcours, token) {
  const clean = String(token || '').trim().toLowerCase();
  if (!clean) return null;
  return (parcours.destinations || []).find((d) => d.token === clean) || null;
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
      ? { name: destination.name, hint: destination.hint || null, points: destination.points }
      : null,
    route,
    routeStraight: Boolean(progress.routeStraight),
    found: (progress.found || []).map((f) => ({
      name: f.name,
      atMs: f.atMs,
      points: f.points,
      rank: f.rank,
    })),
  };
}

// Admin dashboard view: where every team stands.
export function buildParcoursAdminView(parcours) {
  if (!parcours) return null;
  const teams = Object.entries(parcours.sequences || {}).map(([uid, sequence]) => {
    const progress = parcours.progress?.[uid] || { index: 0, found: [] };
    const index = progress.index ?? 0;
    const target = destinationById(parcours, sequence[index]);
    return {
      uid,
      index,
      total: sequence.length,
      done: index >= sequence.length,
      currentName: target?.name || null,
      routeStraight: Boolean(progress.routeStraight),
      found: (progress.found || []).map((f) => ({ name: f.name, atMs: f.atMs, points: f.points })),
    };
  });
  return {
    active: Boolean(parcours.active),
    destinations: (parcours.destinations || []).map((d) => ({
      id: d.id,
      name: d.name,
      token: d.token,
      points: d.points,
      lat: d.lat,
      lng: d.lng,
      hint: d.hint || null,
    })),
    teams,
  };
}
