// Shared helpers for the Grand Jeu serverless functions.
// Files under api/_lib are NOT deployed as functions (underscore prefix).
import webpush from 'web-push';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export { FieldValue };

export function requiredEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is missing in Vercel environment variables`);
  }
  return process.env[name];
}

function normalizePrivateKey(value) {
  return value.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
}

export function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: requiredEnv('FIREBASE_PROJECT_ID'),
      clientEmail: requiredEnv('FIREBASE_CLIENT_EMAIL'),
      privateKey: normalizePrivateKey(requiredEnv('FIREBASE_PRIVATE_KEY')),
    }),
  });
}

export function getDb() {
  return getFirestore(getAdminApp());
}

// ---------------------------------------------------------------------------
// In-memory caches (survive across requests on a warm lambda).
// They keep Firestore reads far below the free-tier quota even with 6 clients
// polling every few seconds during the whole game.
// ---------------------------------------------------------------------------
const userCache = new Map(); // uid -> { data, ts }
const USER_CACHE_TTL = 60_000;

let stateCache = null; // { data: { current, challenge, parcours, secret }, ts }
const STATE_CACHE_TTL = 2_500;

export function invalidateStateCache() {
  stateCache = null;
}

export async function verifyUser(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: { status: 401, message: 'Missing or malformed Authorization header' } };
  }

  const app = getAdminApp();
  const db = getFirestore(app);
  let decoded;
  try {
    decoded = await getAuth(app).verifyIdToken(authHeader.slice(7));
  } catch {
    return { error: { status: 401, message: 'Invalid or expired token' } };
  }

  const cached = userCache.get(decoded.uid);
  if (cached && Date.now() - cached.ts < USER_CACHE_TTL) {
    return { app, db, decoded, user: cached.data };
  }

  const snap = await db.collection('users').doc(decoded.uid).get();
  const user = snap.exists ? snap.data() : {};
  if (!user.username) {
    user.username = decoded.email?.split('@')[0] || decoded.uid.slice(0, 6);
  }
  userCache.set(decoded.uid, { data: user, ts: Date.now() });
  return { app, db, decoded, user };
}

// ---------------------------------------------------------------------------
// Game state loading (cached)
// ---------------------------------------------------------------------------
export async function loadGameState(db) {
  if (stateCache && Date.now() - stateCache.ts < STATE_CACHE_TTL) {
    return stateCache.data;
  }

  const [currentSnap, parcoursSnap, secretSnap] = await Promise.all([
    db.collection('gameState').doc('current').get(),
    db.collection('gameState').doc('parcours').get(),
    db.collection('gameState').doc('secret').get(),
  ]);

  const current = currentSnap.exists ? currentSnap.data() : {};
  let challenge = null;
  if (current.challengeId) {
    const challengeSnap = await db.collection('challenges').doc(current.challengeId).get();
    if (challengeSnap.exists) {
      challenge = { id: challengeSnap.id, ...challengeSnap.data() };
    }
  }

  const data = {
    current,
    challenge,
    parcours: parcoursSnap.exists ? parcoursSnap.data() : null,
    secret: secretSnap.exists ? secretSnap.data() : null,
  };
  stateCache = { data, ts: Date.now() };
  return data;
}

export async function loadTeams(db) {
  const usersSnap = await db.collection('users').get();
  return usersSnap.docs
    .map((doc) => ({ uid: doc.id, ...doc.data() }))
    .filter((user) => {
      const email = String(user.email || '').toLowerCase();
      return user.role !== 'admin' && email !== 'arianne@grandjeu.local' && !email.startsWith('arianne-');
    })
    .map((user) => ({
      uid: user.uid,
      username: user.username || user.email?.split('@')[0] || user.uid,
    }))
    .sort((a, b) => a.username.localeCompare(b.username));
}

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------
function initWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    requiredEnv('VAPID_PUBLIC_KEY'),
    requiredEnv('VAPID_PRIVATE_KEY')
  );
}

async function loadSubscriptions(db, targetUid = null) {
  if (targetUid) {
    const snap = await db
      .collection('users')
      .doc(targetUid)
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

export async function sendPush(db, { title, body, url = '/app', targetUid = null }) {
  initWebPush();
  const subscriptionDocs = await loadSubscriptions(db, targetUid);
  const payload = JSON.stringify({ title, body, url });

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

  return { found: subscriptionDocs.length, sent, failed, removed };
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------
export function normalizeAnswer(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]/g, '');
}

export function challengeIsActive(challenge, now = Date.now()) {
  return challenge && challenge.status === 'active' && now < challenge.endAtMs;
}

export function sendError(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

export function withErrorHandling(handler) {
  return async function wrapped(req, res) {
    try {
      return await handler(req, res);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message || 'Unexpected server error',
        code: err.code || null,
      });
    }
  };
}
