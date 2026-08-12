// Les Défis — the always-on challenge list.
//
// Challenges come from the Google Sheet (live, so the list can be edited on
// game day) merged with any created straight in the admin console. A challenge
// can be made "hot": timed and pinned to the top.

import { fetchSheetChallenges, sheetConfigured } from './sheets.js';

// Short enough that a row typed into the spreadsheet reaches the phones in
// seconds; the Sheets API is only hit ~6x/min per instance at this rate.
const SHEET_CACHE_TTL = 8_000;
let sheetCache = null; // { data, ts }

export function invalidateSheetCache() {
  sheetCache = null;
}

export async function loadSheetChallenges() {
  if (!sheetConfigured()) return { challenges: [], error: null };
  if (sheetCache && Date.now() - sheetCache.ts < SHEET_CACHE_TTL) return sheetCache.data;
  try {
    const { challenges } = await fetchSheetChallenges();
    const data = { challenges, error: null };
    sheetCache = { data, ts: Date.now() };
    return data;
  } catch (err) {
    // Never let a sheet outage take down the challenge list.
    const data = { challenges: sheetCache?.data.challenges || [], error: err.message };
    sheetCache = { data, ts: Date.now() };
    return data;
  }
}

// gameState/defis holds admin-created challenges, hot windows and hidden ids.
export async function loadDefisState(db) {
  const snap = await db.collection('gameState').doc('defis').get();
  const data = snap.exists ? snap.data() : {};
  return {
    extra: data.extra || [],
    hot: data.hot || {},
    hidden: data.hidden || [],
  };
}

export function mergeChallenges(sheetChallenges, state, now = Date.now()) {
  const hidden = new Set(state.hidden || []);
  const all = [...sheetChallenges, ...(state.extra || [])].filter((c) => !hidden.has(c.id));

  return all
    .map((challenge) => {
      const hot = state.hot?.[challenge.id];
      const isHot = Boolean(hot && now >= hot.startAtMs && now < hot.endAtMs);
      return {
        ...challenge,
        hot: isHot,
        hotEndAtMs: isHot ? hot.endAtMs : null,
      };
    })
    .sort((a, b) => {
      if (a.hot !== b.hot) return a.hot ? -1 : 1; // hot ones ride on top
      if (a.hot && b.hot) return a.hotEndAtMs - b.hotEndAtMs; // soonest to expire first
      return 0;
    });
}

// All of a team's submissions live in ONE doc (defiSubmissions/{uid}) keyed by
// challenge id. With 6 phones polling, a doc-per-submission layout would burn
// tens of thousands of reads an hour; this keeps it to one read per poll.
export async function loadTeamSubmissions(db, uid) {
  const snap = await db.collection('defiSubmissions').doc(uid).get();
  return snap.exists ? snap.data().items || {} : {};
}

export async function loadAllSubmissions(db) {
  const snap = await db.collection('defiSubmissions').get();
  return snap.docs.map((doc) => ({
    uid: doc.id,
    username: doc.data().username || doc.id,
    items: doc.data().items || {},
  }));
}

// Player view: the list plus this team's own submission per challenge.
export function buildDefisView(challenges, items) {
  return challenges.map((challenge) => {
    const own = items?.[challenge.id] || null;
    return {
      ...challenge,
      submission: own
        ? {
            status: own.status || 'pending',
            atMs: own.atMs,
            mediaUrl: own.mediaUrl,
            mediaType: own.mediaType,
          }
        : null,
    };
  });
}
