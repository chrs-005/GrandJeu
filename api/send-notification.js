import webpush from 'web-push';
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

function initWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    requiredEnv('VAPID_PUBLIC_KEY'),
    requiredEnv('VAPID_PRIVATE_KEY')
  );
}

async function loadSubscriptions(db, uid, target) {
  if (target === 'self') {
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('pushSubscriptions')
      .where('active', '==', true)
      .get();

    return snap.docs.map((doc) => ({ ref: doc.ref, data: doc.data() }));
  }

  const usersSnap = await db.collection('users').get();
  const subPromises = usersSnap.docs.map((userDoc) =>
    userDoc.ref
      .collection('pushSubscriptions')
      .where('active', '==', true)
      .get()
      .then((snap) => snap.docs.map((doc) => ({ ref: doc.ref, data: doc.data() })))
  );

  return (await Promise.all(subPromises)).flat();
}

async function handlePost(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Missing or malformed Authorization header' });
  }

  let uid;
  const app = getAdminApp();
  try {
    const decoded = await getAuth(app).verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }

  const db = getFirestore(app);
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists || userSnap.data().role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Admin role required' });
  }

  const { title, body, target } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ ok: false, error: 'title and body are required' });
  }

  initWebPush();

  let subscriptionDocs;
  try {
    subscriptionDocs = await loadSubscriptions(db, uid, target);
  } catch (err) {
    return res.status(500).json({ ok: false, error: `Failed to load subscriptions: ${err.message}` });
  }

  const payload = JSON.stringify({ title, body, url: '/app' });
  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.all(
    subscriptionDocs.map(async ({ ref, data }) => {
      try {
        await webpush.sendNotification(data.subscription, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          removed++;
          try {
            await ref.update({ active: false });
          } catch {
            // Best effort cleanup only.
          }
        } else {
          failed++;
        }
      }
    })
  );

  return res.status(200).json({ ok: true, sent, failed, removed });
}

export default async function handler(req, res) {
  try {
    return await handlePost(req, res);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'Unexpected server error',
    });
  }
}
