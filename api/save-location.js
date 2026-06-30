import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

function validateCoordinate(name, value, min, max) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}`);
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

  const { latitude, longitude, accuracy, heading, speed } = req.body || {};
  validateCoordinate('latitude', latitude, -90, 90);
  validateCoordinate('longitude', longitude, -180, 180);

  const db = getFirestore(app);
  const userRef = db.collection('users').doc(decoded.uid);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? userSnap.data() : {};

  await userRef.set(
    {
      uid: decoded.uid,
      email: decoded.email || user.email || '',
      username: user.username || decoded.email?.split('@')[0] || '',
      role: user.role || 'user',
      location: {
        latitude,
        longitude,
        accuracy: typeof accuracy === 'number' ? accuracy : null,
        heading: typeof heading === 'number' ? heading : null,
        speed: typeof speed === 'number' ? speed : null,
        updatedAt: FieldValue.serverTimestamp(),
      },
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
