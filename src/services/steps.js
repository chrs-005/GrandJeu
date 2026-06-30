export function isMotionSupported() {
  return 'DeviceMotionEvent' in window;
}

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 120)}`);
  }
}

export async function requestMotionPermission() {
  if (!isMotionSupported()) throw new Error('Motion sensor is not supported on this device.');

  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    const result = await DeviceMotionEvent.requestPermission();
    if (result !== 'granted') throw new Error(`Motion permission ${result}`);
  }

  return true;
}

export async function fetchStepChallenge(user) {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/step-challenge', {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const data = await parseJsonResponse(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Step challenge fetch failed: ${res.status}`);
  }

  return data;
}

export async function startStepChallenge(user, durationSeconds) {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/step-challenge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ durationSeconds }),
  });

  const data = await parseJsonResponse(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Step challenge start failed: ${res.status}`);
  }

  return data;
}

export async function saveStepResult(user, challengeId, steps) {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/save-steps', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ challengeId, steps }),
  });

  const data = await parseJsonResponse(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Step result save failed: ${res.status}`);
  }

  return data;
}
