import webpush from 'web-push';
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

function initWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    requiredEnv('VAPID_PUBLIC_KEY'),
    requiredEnv('VAPID_PRIVATE_KEY')
  );
}

async function verifyUser(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: { status: 401, message: 'Missing or malformed Authorization header' } };
  }

  const app = getAdminApp();
  try {
    const decoded = await getAuth(app).verifyIdToken(authHeader.slice(7));
    const db = getFirestore(app);
    const snap = await db.collection('users').doc(decoded.uid).get();
    return { db, decoded, user: snap.exists ? snap.data() : {} };
  } catch {
    return { error: { status: 401, message: 'Invalid or expired token' } };
  }
}

function serializeChallenge(doc) {
  if (!doc.exists) return null;
  const data = doc.data();
  return {
    id: doc.id,
    active: data.active === true && Date.now() < data.endAtMs,
    prompt: data.prompt || '',
    durationSeconds: data.durationSeconds,
    startAtMs: data.startAtMs,
    endAtMs: data.endAtMs,
    createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : null,
  };
}

async function loadSubscriptions(db) {
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

async function sendChallengePush(db, challenge) {
  initWebPush();
  const subscriptionDocs = await loadSubscriptions(db);
  const payload = JSON.stringify({
    title: 'Drawing Challenge',
    body: `Draw: ${challenge.prompt}`,
    url: '/app',
  });

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

async function getSubmissions(challengeRef) {
  const snap = await challengeRef.collection('submissions').orderBy('updatedAt', 'desc').get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      username: data.username || doc.id,
      email: data.email || '',
      imageDataUrl: data.imageDataUrl || '',
      updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : null,
    };
  });
}

async function handleGet(req, res) {
  const verified = await verifyUser(req);
  if (verified.error) return res.status(verified.error.status).json({ ok: false, error: verified.error.message });

  const { db, decoded, user } = verified;
  const stateSnap = await db.collection('gameState').doc('drawingChallenge').get();
  const challengeId = stateSnap.exists ? stateSnap.data().currentChallengeId : null;
  if (!challengeId) return res.status(200).json({ ok: true, challenge: null, submissions: [] });

  const challengeRef = db.collection('drawingChallenges').doc(challengeId);
  const challenge = serializeChallenge(await challengeRef.get());
  if (!challenge) return res.status(200).json({ ok: true, challenge: null, submissions: [] });

  const isAdmin = user.role === 'admin';
  const submissions = isAdmin ? await getSubmissions(challengeRef) : [];
  let ownSubmission = null;

  if (!isAdmin) {
    const ownSnap = await challengeRef.collection('submissions').doc(decoded.uid).get();
    if (ownSnap.exists) {
      ownSubmission = {
        updatedAt: ownSnap.data().updatedAt?.toMillis ? ownSnap.data().updatedAt.toMillis() : null,
      };
    }
  }

  return res.status(200).json({ ok: true, challenge, submissions, ownSubmission });
}

async function handlePost(req, res) {
  const verified = await verifyUser(req);
  if (verified.error) return res.status(verified.error.status).json({ ok: false, error: verified.error.message });
  if (verified.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin role required' });

  const prompt = String(req.body?.prompt || '').trim();
  const durationSeconds = Number(req.body?.durationSeconds);

  if (!prompt || prompt.length > 120) {
    return res.status(400).json({ ok: false, error: 'Prompt is required and must be 120 characters or less' });
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 15 || durationSeconds > 900) {
    return res.status(400).json({ ok: false, error: 'Duration must be between 15 and 900 seconds' });
  }

  const { db, decoded } = verified;
  const startAtMs = Date.now() + 3000;
  const endAtMs = startAtMs + Math.round(durationSeconds) * 1000;
  const challengeRef = db.collection('drawingChallenges').doc();
  const challenge = {
    id: challengeRef.id,
    active: true,
    prompt,
    durationSeconds: Math.round(durationSeconds),
    startAtMs,
    endAtMs,
    createdBy: decoded.uid,
  };

  await challengeRef.set({
    ...challenge,
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.collection('gameState').doc('drawingChallenge').set({
    currentChallengeId: challengeRef.id,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const push = await sendChallengePush(db, challenge);
  return res.status(200).json({ ok: true, challenge, push });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'Unexpected server error',
      code: err.code || null,
    });
  }
}
