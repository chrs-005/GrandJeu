async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 120)}`);
  }
}

export async function fetchDrawingChallenge(user) {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/drawing-challenge', {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const data = await parseJsonResponse(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Drawing challenge fetch failed: ${res.status}`);
  }

  return data;
}

export async function startDrawingChallenge(user, prompt, durationSeconds) {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/drawing-challenge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ prompt, durationSeconds }),
  });

  const data = await parseJsonResponse(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Drawing challenge start failed: ${res.status}`);
  }

  return data;
}

export async function saveDrawingSubmission(user, challengeId, imageDataUrl) {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/save-drawing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ challengeId, imageDataUrl }),
  });

  const data = await parseJsonResponse(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Drawing save failed: ${res.status}`);
  }

  return data;
}
