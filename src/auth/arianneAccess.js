export const ARIANNE_USERNAME = 'arianne';
export const ARIANNE_EMAIL = 'arianne@grandjeu.local';
export const ARIANNE_PASSWORD = 'guide me';

export function isArianneLogin(username, password) {
  const clean = String(username || '').trim().toLowerCase();
  return (
    (clean === ARIANNE_USERNAME || clean === ARIANNE_EMAIL) &&
    String(password || '').trim() === ARIANNE_PASSWORD
  );
}

export function isArianneUser(user) {
  return user?.email?.toLowerCase() === ARIANNE_EMAIL;
}
