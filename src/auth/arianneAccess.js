export const ARIANNE_USERNAME = 'arianne';
export const ARIANNE_EMAIL = 'arianne@grandjeu.local';
export const ARIANNE_PASSWORD = 'guide me';

const ARIANNE_DEVICE_KEY = 'grandjeu.arianne.device';
const ARIANNE_DEVICE_PREFIX = 'arianne-';
const ARIANNE_DEVICE_PATTERN = /^arianne-[a-f0-9]{32}@grandjeu\.local$/;

function createDeviceId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getDeviceId() {
  const saved = localStorage.getItem(ARIANNE_DEVICE_KEY);
  if (/^[a-f0-9]{32}$/.test(saved || '')) return saved;

  const created = createDeviceId();
  localStorage.setItem(ARIANNE_DEVICE_KEY, created);
  return created;
}

export function getArianneDeviceEmail() {
  return `${ARIANNE_DEVICE_PREFIX}${getDeviceId()}@grandjeu.local`;
}

export async function signInArianneDevice(login, signup) {
  const email = getArianneDeviceEmail();
  try {
    return await login(email, ARIANNE_PASSWORD);
  } catch (error) {
    if (!['auth/user-not-found', 'auth/invalid-credential'].includes(error?.code)) throw error;
    try {
      return await signup(email, ARIANNE_PASSWORD);
    } catch (signupError) {
      if (signupError?.code !== 'auth/email-already-in-use') throw signupError;
      return login(email, ARIANNE_PASSWORD);
    }
  }
}

export function isArianneLogin(username, password) {
  const clean = String(username || '').trim().toLowerCase();
  return (
    (clean === ARIANNE_USERNAME || clean === ARIANNE_EMAIL) &&
    String(password || '').trim() === ARIANNE_PASSWORD
  );
}

export function isArianneUser(user) {
  const email = user?.email?.toLowerCase() || '';
  return email === ARIANNE_EMAIL || ARIANNE_DEVICE_PATTERN.test(email);
}

export function isLegacyArianneUser(user) {
  return user?.email?.toLowerCase() === ARIANNE_EMAIL;
}
