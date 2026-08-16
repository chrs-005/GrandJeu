// Authenticated NFC scan recorder. The zero-UI /nfc/:tag client route calls
// this endpoint with the Firebase ID token, then performs the redirect.
import {
  FieldValue,
  sendError,
  verifyUser,
  withErrorHandling,
} from './_lib/core.js';
import {
  NFC_FINAL_TRIGGER_TAG,
  NFC_FINAL_URL,
  NFC_REQUIRED_TAG_COUNT,
  NFC_TAGS,
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

async function handleScan(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  const auth = await verifyUser(req);
  if (auth.error) return sendError(res, auth.error.status, auth.error.message);

  const tagId = normalizeNfcTag(req.query?.tag || req.query?.t);
  const tag = NFC_TAGS[tagId];
  if (!tag) return sendError(res, 404, 'Unknown NFC tag');

  const email = String(auth.user.email || auth.decoded.email || '').toLowerCase();
  if (auth.user.role === 'admin' || email === 'arianne@grandjeu.local' || email.startsWith('arianne-')) {
    return sendError(res, 403, 'Only a team can scan an NFC tag');
  }

  const username = auth.user.username || email.split('@')[0] || auth.decoded.uid;
  const teamKey = normalizeNfcTeam(username);
  if (!teamKey) return sendError(res, 403, 'Unknown team');

  const now = Date.now();
  const progressRef = auth.db.collection('nfcProgress').doc(teamKey);
  const eventRef = auth.db.collection('nfcEvents').doc();

  const result = await auth.db.runTransaction(async (tx) => {
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
        uid: auth.decoded.uid,
        username,
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
      uid: auth.decoded.uid,
      username,
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

    return { redirectUrl, destinationType: redirectToFinal ? 'final' : 'tag' };
  });

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json({ ok: true, ...result });
}

export default withErrorHandling(handleScan);
