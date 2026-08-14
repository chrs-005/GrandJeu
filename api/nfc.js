// Public zero-UI NFC router.
// Example tag URL: /api/nfc?tag=1&team=faucon
import {
  FieldValue,
  getDb,
  loadTeams,
  sendError,
  withErrorHandling,
} from './_lib/core.js';
import {
  NFC_FINAL_TRIGGER_TAG,
  NFC_FINAL_URL,
  NFC_REQUIRED_TAG_COUNT,
  NFC_TAGS,
  NFC_TEAM_KEYS,
  normalizeNfcTag,
  normalizeNfcTeam,
} from './_lib/nfcConfig.js';

function completedTagCount(scans = {}) {
  return Object.keys(NFC_TAGS).filter((tagId) => scans[tagId]?.firstAtMs).length;
}

function shouldUseFinal(wasComplete, tagId) {
  if (!wasComplete) return false;
  if (!NFC_FINAL_URL) return false;
  return !NFC_FINAL_TRIGGER_TAG || String(NFC_FINAL_TRIGGER_TAG) === String(tagId);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

async function resolveTeam(db, teamKey) {
  const teams = await loadTeams(db);
  return teams.find((team) => normalizeNfcTeam(team.username) === teamKey) || null;
}

async function handleScan(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendError(res, 405, 'Method not allowed');
  }

  const db = getDb();
  const tagId = normalizeNfcTag(req.query?.tag || req.query?.t);
  const tag = NFC_TAGS[tagId];
  if (!tag) return sendError(res, 404, 'Unknown NFC tag');

  const teamKey = normalizeNfcTeam(req.query?.team || req.query?.u);
  if (!teamKey) return sendError(res, 400, 'Missing team');

  const expectedKey = NFC_TEAM_KEYS[teamKey];
  if (expectedKey && String(req.query?.k || '') !== expectedKey) {
    return sendError(res, 403, 'Invalid team key');
  }

  const team = await resolveTeam(db, teamKey);
  if (!team) return sendError(res, 404, 'Unknown team');

  const now = Date.now();
  const progressRef = db.collection('nfcProgress').doc(teamKey);
  const eventRef = db.collection('nfcEvents').doc();

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(progressRef);
    const current = snap.exists ? snap.data() : {};
    const scans = current.scans || {};
    const wasComplete = completedTagCount(scans) >= NFC_REQUIRED_TAG_COUNT;
    const redirectToFinal = shouldUseFinal(wasComplete, tagId);
    const redirectUrl = redirectToFinal ? NFC_FINAL_URL : tag.destinationUrl;

    const previousTagScan = scans[tagId] || {};
    const nextScans = {
      ...scans,
      [tagId]: {
        firstAtMs: previousTagScan.firstAtMs || now,
        lastAtMs: now,
        count: Number(previousTagScan.count || 0) + 1,
      },
    };
    const isComplete = completedTagCount(nextScans) >= NFC_REQUIRED_TAG_COUNT;

    tx.set(
      progressRef,
      {
        teamKey,
        uid: team.uid,
        username: team.username,
        scans: nextScans,
        completedAtMs: current.completedAtMs || (isComplete ? now : null),
        lastTagId: tagId,
        lastScanAtMs: now,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(eventRef, {
      teamKey,
      uid: team.uid,
      username: team.username,
      tagId,
      tagLabel: tag.label,
      destinationType: redirectToFinal ? 'final' : 'tag',
      redirectedTo: redirectUrl,
      wasCompleteBeforeScan: wasComplete,
      completedAfterScan: !wasComplete && isComplete,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
      ip: getClientIp(req),
      createdAtMs: now,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { redirectUrl };
  });

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.redirect(302, result.redirectUrl);
}

export default withErrorHandling(handleScan);
