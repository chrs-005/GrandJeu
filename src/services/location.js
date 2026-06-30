export function isLocationSupported() {
  return 'geolocation' in navigator;
}

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 120)}`);
  }
}

export async function saveLocation(user, position) {
  const idToken = await user.getIdToken();
  const { latitude, longitude, accuracy, heading, speed } = position.coords;

  const res = await fetch('/api/save-location', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      latitude,
      longitude,
      accuracy,
      heading,
      speed,
    }),
  });

  const data = await parseJsonResponse(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Location save failed: ${res.status}`);
  }

  return data;
}

export async function fetchPlayerLocations(user) {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/locations', {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const data = await parseJsonResponse(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Location fetch failed: ${res.status}`);
  }

  return data.locations || [];
}
