import webpush from 'web-push';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin only once (Vercel may reuse the process)
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel stores the private key with literal \n — replace them
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

function initWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ── 1. Verify Firebase ID token ───────────────────────────────────────────
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Missing or malformed Authorization header' });
  }
  const idToken = authHeader.slice(7);

  let uid;
  try {
    const app = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }

  // ── 2. Check admin role in Firestore ─────────────────────────────────────
  const app = getAdminApp();
  const db = getFirestore(app);

  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists || userSnap.data().role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Admin role required' });
  }

  // ── 3. Validate payload ───────────────────────────────────────────────────
  const { title, body, target } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ ok: false, error: 'title and body are required' });
  }

  // ── 4. Collect subscriptions ──────────────────────────────────────────────
  initWebPush();

  let subscriptionDocs = [];
  try {
    if (target === 'self') {
      // Only the calling admin's subscriptions
      const snap = await db
        .collection('users')
        .doc(uid)
        .collection('pushSubscriptions')
        .where('active', '==', true)
        .get();
      snap.forEach((d) => subscriptionDocs.push({ ref: d.ref, data: d.data() }));
    } else {
      // All users
      const usersSnap = await db.collection('users').get();
      const subPromises = usersSnap.docs.map((u) =>
        db
          .collection('users')
          .doc(u.id)
          .collection('pushSubscriptions')
          .where('active', '==', true)
          .get()
          .then((snap) => snap.docs.map((d) => ({ ref: d.ref, data: d.data() })))
      );
      const nested = await Promise.all(subPromises);
      subscriptionDocs = nested.flat();
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to load subscriptions: ' + err.message });
  }

  // ── 5. Send notifications ─────────────────────────────────────────────────
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
        // 404 / 410 means the subscription is no longer valid
        if (err.statusCode === 404 || err.statusCode === 410) {
          removed++;
          try {
            await ref.update({ active: false });
          } catch {
            // best-effort
          }
        } else {
          failed++;
        }
      }
    })
  );

  return res.status(200).json({ ok: true, sent, failed, removed });
}
