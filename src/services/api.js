// Unified client for the /api/game and /api/admin endpoints.

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Le serveur a renvoyé une réponse invalide (${res.status}): ${text.slice(0, 120)}`);
  }
}

async function request(user, path, options = {}) {
  const idToken = await user.getIdToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await parseJsonResponse(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Erreur serveur: ${res.status}`);
  }
  return data;
}

// -- player ------------------------------------------------------------------
export function fetchGame(user) {
  return request(user, '/api/game');
}

export function gameAction(user, action, payload = {}) {
  return request(user, '/api/game', {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
  });
}

// -- admin -------------------------------------------------------------------
export function fetchAdmin(user, { images = false } = {}) {
  return request(user, `/api/admin${images ? '?images=1' : ''}`);
}

export function adminAction(user, action, payload = {}) {
  return request(user, '/api/admin', {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
  });
}
