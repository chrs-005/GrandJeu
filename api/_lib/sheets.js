// Google Sheets client for the challenge list.
//
// Auth reuses the Firebase service-account key already in the environment, so
// there is no extra secret: we mint a short-lived OAuth token with the Sheets
// scope via the JWT flow. The sheet must be shared with FIREBASE_CLIENT_EMAIL
// (Editor, so the admin console can append rows back into it).

import crypto from 'node:crypto';
import { requiredEnv } from './core.js';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

let tokenCache = null; // { token, expiresAt }

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function normalizePrivateKey(value) {
  return value.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
}

async function getAccessToken() {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;

  const clientEmail = requiredEnv('FIREBASE_CLIENT_EMAIL');
  const privateKey = normalizePrivateKey(requiredEnv('FIREBASE_PRIVATE_KEY'));
  const now = Math.floor(Date.now() / 1000);

  const claim = {
    iss: clientEmail,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify(claim)
  )}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`Sheets auth failed (${res.status})`);
  const data = await res.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

async function sheetsFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${API}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export function sheetId() {
  return process.env.CHALLENGES_SHEET_ID || '';
}

export function sheetConfigured() {
  return Boolean(sheetId() && process.env.FIREBASE_CLIENT_EMAIL);
}

// Header matching is deliberately loose: accents, case and wording vary.
function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const FIELD_ALIASES = {
  title: ['titre', 'title', 'defi', 'challenge', 'nom', 'name', 'mission'],
  description: ['description', 'desc', 'details', 'detail', 'consigne', 'explication', 'regles'],
  points: ['points', 'point', 'pts', 'score', 'valeur'],
  media: ['media', 'type', 'preuve', 'format', 'photovideo'],
  category: ['categorie', 'category', 'theme', 'groupe', 'dieu'],
  active: ['actif', 'active', 'visible', 'publie', 'published', 'enabled'],
};

function mapHeaders(headerRow) {
  const map = {};
  headerRow.forEach((raw, index) => {
    const key = normalizeHeader(raw);
    if (!key) return;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (map[field] === undefined && aliases.includes(key)) map[field] = index;
    }
  });
  return map;
}

function parseMediaKind(value) {
  const v = normalizeHeader(value);
  if (!v) return 'any';
  if (v.includes('video') && v.includes('photo')) return 'any';
  if (v.includes('video')) return 'video';
  if (v.includes('photo') || v.includes('image')) return 'photo';
  return 'any';
}

function isFalsy(value) {
  const v = normalizeHeader(value);
  return ['non', 'no', 'false', '0', 'faux', 'brouillon', 'draft', 'cache'].includes(v);
}

/**
 * Read the challenge rows. Returns { challenges, headers, rowCount }.
 * Rows without a title are skipped; a falsy "actif" column hides a row.
 */
export async function fetchSheetChallenges() {
  const id = sheetId();
  if (!id) return { challenges: [], headers: [], rowCount: 0 };

  const data = await sheetsFetch(`${id}/values/A1:Z500?majorDimension=ROWS`);
  const rows = data.values || [];
  if (!rows.length) return { challenges: [], headers: [], rowCount: 0 };

  const [headerRow, ...bodyRows] = rows;
  const cols = mapHeaders(headerRow);
  // No recognisable header → treat the first column as the title.
  if (cols.title === undefined) cols.title = 0;

  const challenges = bodyRows
    .map((row, i) => {
      const cell = (field) => (cols[field] === undefined ? '' : String(row[cols[field]] ?? '').trim());
      const title = cell('title');
      if (!title) return null;
      if (cols.active !== undefined && isFalsy(cell('active'))) return null;
      const points = parseInt(cell('points'), 10);
      return {
        id: `sheet-${i + 2}`, // spreadsheet row number, stable while rows aren't reordered
        source: 'sheet',
        row: i + 2,
        title,
        description: cell('description') || '',
        points: Number.isFinite(points) ? points : 50,
        media: parseMediaKind(cell('media')),
        category: cell('category') || '',
      };
    })
    .filter(Boolean);

  return { challenges, headers: headerRow, rowCount: bodyRows.length };
}

// Append a challenge created in the admin console back into the sheet, so the
// spreadsheet stays the single source of truth.
export async function appendSheetChallenge({ title, description, points, media, category }) {
  const id = sheetId();
  if (!id) throw new Error('CHALLENGES_SHEET_ID manquant.');

  const data = await sheetsFetch(`${id}/values/A1:Z1?majorDimension=ROWS`);
  const headerRow = data.values?.[0] || [];
  const cols = mapHeaders(headerRow);

  const width = Math.max(headerRow.length, 1);
  const row = new Array(width).fill('');
  const put = (field, value) => {
    if (cols[field] !== undefined) row[cols[field]] = value;
  };
  if (cols.title === undefined) row[0] = title;
  else put('title', title);
  put('description', description || '');
  put('points', String(points ?? 50));
  put('media', media === 'any' ? 'photo/vidéo' : media === 'video' ? 'vidéo' : 'photo');
  put('category', category || '');
  put('active', 'oui');

  await sheetsFetch(`${id}/values/A1:Z1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    body: JSON.stringify({ values: [row] }),
  });
  return true;
}
