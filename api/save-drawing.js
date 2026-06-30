import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const MAX_IMAGE_CHARS = 850000;

function requiredEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is missing in Vercel environment variables`);
  }
  return process.env[name];
}

function normalizePrivateKey(value) {
  return value.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
}

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  return initializeApp({
    credential: cert({
      projectId: requiredEnv('FIREBASE_PROJECT_ID'),
      clientEmail: requiredEnv('FIREBASE_CLIENT_EMAIL'),
      privateKey: normalizePrivateKey(requiredEnv('FIREBASE_PRIVATE_KEY')),
    }),
  });
}

function validateImageDataUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,')) {
    throw new Error('Drawing must be a PNG data URL');
  }
  if (value.length > MAX_IMAGE_CHARS) {
    throw new Error('Drawing is too large. Clear the canvas or use fewer strokes.');
  }
}

async function handlePost(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Missing or malformed Authorization header' });
  }

  const app = getAdminApp();
  let decoded;
  try {
    decoded = await getAuth(app).verifyIdToken(authHeader.slice(7));
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }

  const { challengeId, imageDataUrl } = req.body || {};
  if (!challengeId || typeof challengeId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing drawing challenge id' });
  }
  validateImageDataUrl(imageDataUrl);

  const db = getFirestore(app);
  const challengeRef = db.collection('drawingChallenges').doc(challengeId);
  const challengeSnap = await challengeRef.get();
  if (!challengeSnap.exists) {
    return res.status(404).json({ ok: false, error: 'Drawing challenge not found' });
  }

  const challenge = challengeSnap.data();
  if (Date.now() > challenge.endAtMs + 5000) {
    return res.status(400).json({ ok: false, error: 'Drawing challenge is closed' });
  }

  const userSnap = await db.collection('users').doc(decoded.uid).get();
  const user = userSnap.exists ? userSnap.data() : {};

  await challengeRef.collection('submissions').doc(decoded.uid).set(
    {
      uid: decoded.uid,
      username: user.username || decoded.email?.split('@')[0] || decoded.uid,
      email: decoded.email || user.email || '',
      imageDataUrl,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  try {
    return await handlePost(req, res);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'Unexpected server error',
      code: err.code || null,
    });
  }
}
