import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadEnv() {
  const values = {};
  const lines = fs.readFileSync('.env', 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return values;
}

function normalizePrivateKey(value) {
  const raw = value.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  const begin = '-----BEGIN PRIVATE KEY-----';
  const end = '-----END PRIVATE KEY-----';
  if (raw.includes('\n') || !raw.includes(begin) || !raw.includes(end)) return raw;
  const body = raw
    .slice(raw.indexOf(begin) + begin.length, raw.indexOf(end))
    .replace(/\s+/g, '');
  return `${begin}\n${body}\n${end}\n`;
}

const env = loadEnv();
const app = initializeApp({
  credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: normalizePrivateKey(env.FIREBASE_PRIVATE_KEY),
  }),
});

const db = getFirestore(app);
const usersSnap = await db.collection('users').get();
let active = 0;
let total = 0;

for (const userDoc of usersSnap.docs) {
  const user = userDoc.data();
  const subsSnap = await userDoc.ref.collection('pushSubscriptions').get();
  for (const subDoc of subsSnap.docs) {
    total++;
    const data = subDoc.data();
    if (data.active === true) active++;
    console.log(
      `${user.username || user.email || userDoc.id}: ${subDoc.id} active=${data.active === true} ${data.endpoint ? 'has endpoint' : 'missing endpoint'}`
    );
  }
}

console.log(`Total push subscriptions: ${total}`);
console.log(`Active push subscriptions: ${active}`);
