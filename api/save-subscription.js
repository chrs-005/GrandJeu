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

function validateSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object') {
    throw new Error('Missing subscription object');
  }
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error('Invalid push subscription payload');
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

  const { id, subscription, userAgent } = req.body || {};
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing subscription id' });
  }

  validateSubscription(subscription);

  const db = getFirestore(app);
  await db.collection('users').doc(decoded.uid).collection('pushSubscriptions').doc(id).set(
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      subscription,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      userAgent: userAgent || '',
    },
    { merge: true }
  );

  return res.status(200).json({ ok: true, id });
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
