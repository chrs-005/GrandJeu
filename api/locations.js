import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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

function serializeLocation(doc) {
  const data = doc.data();
  const location = data.location;
  if (!location?.latitude || !location?.longitude) return null;

  return {
    uid: doc.id,
    username: data.username || data.email || doc.id,
    email: data.email || '',
    role: data.role || 'user',
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    heading: location.heading ?? null,
    speed: location.speed ?? null,
    updatedAt: location.updatedAt?.toMillis ? location.updatedAt.toMillis() : null,
  };
}

async function handleGet(req, res) {
  if (req.method !== 'GET') {
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

  const db = getFirestore(app);
  const adminSnap = await db.collection('users').doc(decoded.uid).get();
  if (!adminSnap.exists || adminSnap.data().role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Admin role required' });
  }

  const usersSnap = await db.collection('users').get();
  const locations = usersSnap.docs
    .map(serializeLocation)
    .filter(Boolean)
    .sort((a, b) => a.username.localeCompare(b.username));

  return res.status(200).json({ ok: true, locations });
}

export default async function handler(req, res) {
  try {
    return await handleGet(req, res);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'Unexpected server error',
      code: err.code || null,
    });
  }
}
