import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const USERNAME_DOMAIN = 'grandjeu.local';
const USERS_FILE = path.resolve('data/users.json');
const ENV_FILE = path.resolve('.env');
const SERVICE_ACCOUNT_FILE = path.resolve('data/serviceAccountKey.json');

function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return;

  const lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing. Fill it in .env before running this script.`);
  }
  return value;
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizePrivateKey(value) {
  const raw = unquote(value.trim()).replace(/\\n/g, '\n');
  const begin = '-----BEGIN PRIVATE KEY-----';
  const end = '-----END PRIVATE KEY-----';

  if (raw.includes('\n')) return raw;
  if (!raw.includes(begin) || !raw.includes(end)) return raw;

  const body = raw
    .slice(raw.indexOf(begin) + begin.length, raw.indexOf(end))
    .replace(/\s+/g, '');

  return `${begin}\n${body}\n${end}\n`;
}

function loadCredential() {
  if (fs.existsSync(SERVICE_ACCOUNT_FILE)) {
    const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_FILE, 'utf8'));
    return cert(serviceAccount);
  }

  return cert({
    projectId: requireEnv('FIREBASE_PROJECT_ID'),
    clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
    privateKey: normalizePrivateKey(requireEnv('FIREBASE_PRIVATE_KEY')),
  });
}

function usernameToEmail(username) {
  const normalized = username.trim().toLowerCase();
  if (!normalized) throw new Error('Every user needs a username.');
  return `${normalized}@${USERNAME_DOMAIN}`;
}

function validateUser(user) {
  if (!user.username || !user.password) {
    throw new Error('Each user needs username and password.');
  }
  if (!['admin', 'user'].includes(user.role)) {
    throw new Error(`${user.username} has invalid role "${user.role}". Use "admin" or "user".`);
  }
}

loadEnvFile();

if (!fs.existsSync(USERS_FILE)) {
  throw new Error('Create data/users.json first. You can copy data/users.example.json.');
}

const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
if (!Array.isArray(users) || users.length === 0) {
  throw new Error('data/users.json must be a non-empty array.');
}

const app = initializeApp({
  credential: loadCredential(),
});

const auth = getAuth(app);
const db = getFirestore(app);

for (const user of users) {
  validateUser(user);

  const username = user.username.trim().toLowerCase();
  const email = usernameToEmail(username);
  let record;

  try {
    record = await auth.getUserByEmail(email);
    await auth.updateUser(record.uid, {
      password: user.password,
      displayName: username,
      disabled: false,
    });
    console.log(`Updated auth user: ${username}`);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    record = await auth.createUser({
      email,
      password: user.password,
      displayName: username,
      disabled: false,
    });
    console.log(`Created auth user: ${username}`);
  }

  try {
    await db.collection('users').doc(record.uid).set(
      {
        uid: record.uid,
        username,
        email,
        role: user.role,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    if (err.code === 5) {
      throw new Error(
        'Firestore database was not found. In Firebase Console, open Firestore Database, create a database, then run this script again.'
      );
    }
    throw err;
  }

  console.log(`Saved Firestore role: ${username} -> ${user.role}`);
}

console.log('\nDone. Players can now sign in with their username and password.');
