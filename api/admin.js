// Admin endpoint: GET = dashboard state, POST = game control actions.
import {
  FieldValue,
  verifyUser,
  loadGameState,
  ensureScoresDoc,
  addPoints,
  sendPush,
  invalidateStateCache,
  sendError,
  withErrorHandling,
} from './_lib/core.js';
import { territoryAreas, SEED_RADIUS_M } from './_lib/territory.js';
import { makeToken, buildSequences, buildParcoursAdminView } from './_lib/parcours.js';
import {
  loadSheetChallenges,
  loadDefisState,
  mergeChallenges,
  loadAllSubmissions,
  invalidateSheetCache,
} from './_lib/defis.js';
import { appendSheetChallenge, sheetConfigured } from './_lib/sheets.js';

const DEFAULT_RANK_POINTS = [100, 70, 50, 35, 20];

const PUSH_BY_TYPE = {
  steps: { title: '🏃 La Course d’Hermès !', body: 'Courez ! Le messager des dieux vous défie. Ouvrez l’app !' },
  trivia: { title: '🔮 L’Oracle de Delphes', body: 'La Pythie vous convoque. Répondez vite à ses questions !' },
  bounty: { title: '🐍 Le Regard de Méduse', body: 'Méduse a désigné sa proie… Photographiez-la avant d’être pétrifiés !' },
  photo: { title: '💪 Les Travaux d’Héraclès', body: 'Une nouvelle épreuve héroïque vous attend. Ouvrez l’app !' },
  drawguess: { title: '🎨 Le Défi des Muses', body: 'Les Muses réclament une œuvre. À vos pinceaux !' },
  riddle: { title: '🦁 L’Énigme du Sphinx', body: 'Le Sphinx bloque votre route. Résolvez son énigme !' },
  guide: { title: '🧭 Le Fil d’Ariane', body: 'Un lieu secret vous appelle… Suivez le fil, il chauffe !' },
  territory: { title: '⚔️ La Conquête d’Arès', body: 'À vos frontières ! Marchez, encerclez, conquérez le terrain.' },
};

function num(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Challenge builders — validate config and compute the timeline
// ---------------------------------------------------------------------------
function buildChallenge(type, cfg, teamUids) {
  const now = Date.now();
  const startAtMs = now + 5_000; // small countdown so pushes land first

  switch (type) {
    case 'steps': {
      const durationSeconds = num(cfg.durationSeconds, 120, 30, 1800);
      return {
        startAtMs,
        endAtMs: startAtMs + durationSeconds * 1000,
        config: {
          durationSeconds,
          hideFinalSeconds: num(cfg.hideFinalSeconds, 45, 0, durationSeconds),
          rankPoints: Array.isArray(cfg.rankPoints) && cfg.rankPoints.length
            ? cfg.rankPoints.map((p) => num(p, 0, 0, 1000))
            : DEFAULT_RANK_POINTS,
        },
      };
    }

    case 'trivia': {
      const questions = (cfg.questions || []).map((q) => ({
        q: String(q.q || '').slice(0, 300),
        options: (q.options || []).slice(0, 4).map((o) => String(o).slice(0, 120)),
        correct: num(q.correct, 0, 0, 3),
        points: num(q.points, 100, 10, 1000),
        timeLimitSec: num(q.timeLimitSec, 20, 5, 120),
      }));
      if (!questions.length) throw new Error('Aucune question fournie.');
      const lobbySeconds = num(cfg.lobbySeconds, 10, 3, 60);
      const revealSeconds = num(cfg.revealSeconds, 6, 2, 30);

      let cursor = startAtMs + lobbySeconds * 1000;
      questions.forEach((q) => {
        q.startAtMs = cursor;
        q.endAtMs = cursor + q.timeLimitSec * 1000;
        cursor = q.endAtMs + revealSeconds * 1000;
      });

      return {
        startAtMs,
        endAtMs: cursor,
        config: { questions, lobbySeconds, revealSeconds },
      };
    }

    case 'bounty': {
      const durationSeconds = num(cfg.durationSeconds, 900, 60, 14400);
      const target = String(cfg.target || '').trim().slice(0, 120);
      if (!target) throw new Error('Il faut désigner une cible.');
      return {
        startAtMs,
        endAtMs: startAtMs + durationSeconds * 1000,
        config: { durationSeconds, target },
      };
    }

    case 'photo': {
      const durationSeconds = num(cfg.durationSeconds, 600, 60, 14400);
      const mission = String(cfg.mission || '').trim().slice(0, 300);
      if (!mission) throw new Error('Il faut décrire la mission.');
      return {
        startAtMs,
        endAtMs: startAtMs + durationSeconds * 1000,
        config: { durationSeconds, mission },
      };
    }

    case 'drawguess': {
      const drawSeconds = num(cfg.drawSeconds, 180, 30, 1200);
      const guessSeconds = num(cfg.guessSeconds, 120, 30, 1200);
      const prompts = (cfg.prompts || []).map((p) => String(p).trim()).filter(Boolean);
      if (prompts.length < teamUids.length) {
        throw new Error(`Il faut au moins ${teamUids.length} propositions de dessin.`);
      }
      // Shuffle prompts, assign one per team; each team guesses the next team's drawing.
      const shuffled = [...prompts].sort(() => Math.random() - 0.5);
      const assignments = {};
      teamUids.forEach(({ uid, username }, i) => {
        const source = teamUids[(i + 1) % teamUids.length];
        assignments[uid] = {
          username,
          prompt: shuffled[i],
          sourceUid: source.uid,
          sourceUsername: source.username,
        };
      });
      const drawEndAtMs = startAtMs + drawSeconds * 1000;
      return {
        startAtMs,
        endAtMs: drawEndAtMs + guessSeconds * 1000,
        config: { drawSeconds, guessSeconds, drawEndAtMs, assignments },
      };
    }

    case 'riddle': {
      const durationSeconds = num(cfg.durationSeconds, 600, 30, 14400);
      const text = String(cfg.text || '').trim().slice(0, 1000);
      const answers = (cfg.answers || []).map((a) => String(a).trim()).filter(Boolean);
      if (!text || !answers.length) throw new Error('Énigme ou réponses manquantes.');
      return {
        startAtMs,
        endAtMs: startAtMs + durationSeconds * 1000,
        config: {
          durationSeconds,
          text,
          answers,
          points: num(cfg.points, 100, 0, 1000),
          firstBonus: num(cfg.firstBonus, 50, 0, 1000),
        },
      };
    }

    case 'guide': {
      const durationSeconds = num(cfg.durationSeconds, 1800, 60, 14400);
      const lat = Number(cfg.lat);
      const lng = Number(cfg.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('Placez la destination sur la carte.');
      }
      return {
        startAtMs,
        endAtMs: startAtMs + durationSeconds * 1000,
        config: {
          durationSeconds,
          lat,
          lng,
          radiusM: num(cfg.radiusM, 30, 10, 500),
          nfcRequired: Boolean(cfg.nfcRequired),
          rankPoints: Array.isArray(cfg.rankPoints) && cfg.rankPoints.length
            ? cfg.rankPoints.map((p) => num(p, 0, 0, 1000))
            : DEFAULT_RANK_POINTS,
        },
      };
    }

    case 'territory': {
      const durationSeconds = num(cfg.durationSeconds, 1200, 60, 14400);
      const teamNames = {};
      teamUids.forEach(({ uid, username }) => {
        teamNames[uid] = username;
      });
      return {
        startAtMs,
        endAtMs: startAtMs + durationSeconds * 1000,
        config: {
          durationSeconds,
          teamNames,
          seedRadiusM: num(cfg.seedRadiusM, SEED_RADIUS_M, 10, 100),
          rankPoints: DEFAULT_RANK_POINTS,
        },
        extra: { territories: {}, trails: {}, tracks: {} },
      };
    }

    default:
      throw new Error(`Type de défi inconnu: ${type}`);
  }
}

// ---------------------------------------------------------------------------
// GET — admin dashboard
// ---------------------------------------------------------------------------
function serializeLocation(doc) {
  const data = doc.data();
  const location = data.location;
  if (!location?.latitude || !location.longitude) return null;
  return {
    uid: doc.id,
    username: data.username || data.email || doc.id,
    role: data.role || 'user',
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    updatedAt: location.updatedAt?.toMillis ? location.updatedAt.toMillis() : null,
  };
}

async function handleGet(req, res, verified) {
  const { db } = verified;
  const includeImages = req.query?.images === '1';

  // Défis board is fetched on its own (sheet + every team's submissions).
  if (req.query?.view === 'defis') {
    const [{ challenges, error: sheetError }, state, submissions] = await Promise.all([
      loadSheetChallenges(),
      loadDefisState(db),
      loadAllSubmissions(db),
    ]);
    return res.status(200).json({
      ok: true,
      serverNow: Date.now(),
      sheetConfigured: sheetConfigured(),
      sheetError,
      defis: mergeChallenges(challenges, state),
      hidden: state.hidden || [],
      submissions,
    });
  }

  const teams = await ensureScoresDoc(db);
  const { current, challenge, parcours, secret } = await loadGameState(db);

  const usersSnap = await db.collection('users').get();
  const locations = usersSnap.docs
    .map(serializeLocation)
    .filter(Boolean)
    .sort((a, b) => a.username.localeCompare(b.username));

  let media = null;
  if (includeImages && challenge) {
    const mediaSnap = await db.collection('challenges').doc(challenge.id).collection('media').get();
    media = {};
    mediaSnap.docs.forEach((doc) => {
      media[doc.id] = doc.data().imageDataUrl;
    });
  }

  const logSnap = await db.collection('scoreLog').orderBy('atMs', 'desc').limit(25).get();
  const scoreLog = logSnap.docs.map((doc) => doc.data());

  return res.status(200).json({
    ok: true,
    serverNow: Date.now(),
    teams: Object.entries(teams)
      .map(([uid, entry]) => ({ uid, username: entry.username, score: entry.score || 0 }))
      .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username)),
    locations,
    currentChallengeId: current.challengeId || null,
    challenge,
    media,
    scoreLog,
    parcours: buildParcoursAdminView(parcours),
    secret: secret
      ? {
          active: Boolean(secret.active),
          text: secret.text || '',
          answers: secret.answers || [],
          hint: secret.hint || '',
          points: secret.points || 150,
          finders: Object.entries(secret.solvedBy || {}).map(([uid, entry]) => ({
            uid,
            username: entry.username || uid,
            found: Boolean(entry.foundAtMs),
            solved: Boolean(entry.solved),
            points: entry.points || 0,
          })),
        }
      : null,
  });
}

// ---------------------------------------------------------------------------
// POST — admin actions
// ---------------------------------------------------------------------------
async function handlePost(req, res, verified) {
  const { db, decoded } = verified;
  const body = req.body || {};
  const { action } = body;

  switch (action) {
    case 'start': {
      const teamsMap = await ensureScoresDoc(db);
      const teamUids = Object.entries(teamsMap).map(([uid, entry]) => ({
        uid,
        username: entry.username,
      }));
      const { type } = body;
      const built = buildChallenge(type, body.config || {}, teamUids);

      const ref = db.collection('challenges').doc();
      const challenge = {
        id: ref.id,
        type,
        status: 'active',
        title: String(body.title || '').slice(0, 120) || null,
        startAtMs: built.startAtMs,
        endAtMs: built.endAtMs,
        config: built.config,
        board: {},
        ...(built.extra || {}),
        createdBy: decoded.uid,
        createdAt: FieldValue.serverTimestamp(),
      };
      await ref.set(challenge);
      await db.collection('gameState').doc('current').set({
        challengeId: ref.id,
        type,
        updatedAt: FieldValue.serverTimestamp(),
      });
      invalidateStateCache();

      const pushContent = body.push?.title
        ? { title: body.push.title, body: body.push.body || '' }
        : PUSH_BY_TYPE[type] || { title: 'Grand Jeu', body: 'Nouveau défi !' };
      const push = await sendPush(db, { ...pushContent, url: '/app' });

      return res.status(200).json({ ok: true, challenge, push });
    }

    case 'end': {
      const ref = db.collection('challenges').doc(body.challengeId);
      const snap = await ref.get();
      if (!snap.exists) return sendError(res, 404, 'Défi introuvable.');
      const challenge = { id: snap.id, ...snap.data() };
      const now = Date.now();

      const updates = { status: 'ended', endAtMs: Math.min(challenge.endAtMs, now) };
      const awards = [];

      // Ranked challenges: award ranking points automatically when requested.
      let ranking = null;
      let awardReason = '';
      if (body.award && challenge.type === 'steps') {
        awardReason = 'Course d’Hermès';
        ranking = Object.entries(challenge.board || {})
          .map(([uid, entry]) => ({ uid, username: entry.username, metric: entry.steps || 0 }))
          .sort((a, b) => b.metric - a.metric);
      }
      if (body.award && challenge.type === 'territory') {
        awardReason = 'Conquête d’Arès';
        const areas = territoryAreas(challenge);
        ranking = Object.entries(challenge.config.teamNames || {})
          .map(([uid, username]) => ({ uid, username, metric: areas[uid] || 0 }))
          .filter((entry) => entry.metric > 0)
          .sort((a, b) => b.metric - a.metric);
      }
      if (ranking) {
        const rankPoints = challenge.config.rankPoints || DEFAULT_RANK_POINTS;
        for (let i = 0; i < ranking.length; i++) {
          const points = rankPoints[i] || 0;
          if (points > 0) {
            awards.push({ ...ranking[i], points });
            updates[`board.${ranking[i].uid}.points`] = points;
            updates[`board.${ranking[i].uid}.username`] = ranking[i].username;
          }
        }
      }

      await ref.update(updates);
      invalidateStateCache();
      for (const award of awards) {
        await addPoints(db, award.uid, award.username, award.points, awardReason, challenge.id);
      }
      return res.status(200).json({ ok: true, awards });
    }

    case 'clear': {
      await db.collection('gameState').doc('current').set({
        challengeId: null,
        type: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      invalidateStateCache();
      return res.status(200).json({ ok: true });
    }

    // Validate/score a submission (photo, bounty, drawguess guess) and award points.
    case 'review': {
      const { challengeId, uid, status, points, reason } = body;
      const ref = db.collection('challenges').doc(challengeId);
      const snap = await ref.get();
      if (!snap.exists) return sendError(res, 404, 'Défi introuvable.');
      const challenge = { id: snap.id, ...snap.data() };
      const entry = challenge.board?.[uid];
      if (!entry) return sendError(res, 404, 'Aucune participation pour cette équipe.');

      const awarded = num(points, 0, 0, 1000);
      const updates = {};
      if (challenge.type === 'drawguess') {
        const already = entry.guessPoints || 0;
        updates[`board.${uid}.guessPoints`] = awarded;
        if (awarded - already !== 0) {
          await addPoints(db, uid, entry.username, awarded - already, reason || 'Défi des Muses', challengeId);
        }
      } else {
        const already = entry.points || 0;
        updates[`board.${uid}.status`] = status || (awarded > 0 ? 'valid' : 'rejected');
        updates[`board.${uid}.points`] = awarded;
        if (awarded - already !== 0) {
          await addPoints(db, uid, entry.username, awarded - already, reason || 'Épreuve validée', challengeId);
        }
      }
      await ref.update(updates);
      invalidateStateCache();
      return res.status(200).json({ ok: true });
    }

    case 'adjust-score': {
      const { uid, delta, reason } = body;
      const teams = await ensureScoresDoc(db);
      const entry = teams[uid];
      if (!entry) return sendError(res, 404, 'Équipe inconnue.');
      const points = num(delta, 0, -10000, 10000);
      if (!points) return sendError(res, 400, 'Delta invalide.');
      await addPoints(db, uid, entry.username, points, reason || 'Ajustement manuel');
      return res.status(200).json({ ok: true });
    }

    case 'reset-scores': {
      const teams = await ensureScoresDoc(db);
      const zeroed = {};
      Object.entries(teams).forEach(([uid, entry]) => {
        zeroed[uid] = { username: entry.username, score: 0 };
      });
      await db.collection('gameState').doc('scores').set({
        teams: zeroed,
        updatedAt: FieldValue.serverTimestamp(),
      });
      invalidateStateCache();
      return res.status(200).json({ ok: true });
    }

    // -- Secret de la chouette (hidden owl riddle on the home screen) -----------
    case 'secret-setup': {
      const text = String(body.text || '').trim().slice(0, 800);
      const answers = (body.answers || []).map((a) => String(a).trim()).filter(Boolean);
      if (body.active !== false && (!text || !answers.length)) {
        return sendError(res, 400, 'Énigme et réponses requises.');
      }
      await db.collection('gameState').doc('secret').set(
        {
          active: body.active !== false,
          text,
          answers,
          hint: String(body.hint || '').trim().slice(0, 200) || null,
          points: num(body.points, 150, 0, 2000),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      invalidateStateCache();
      return res.status(200).json({ ok: true });
    }

    case 'secret-reset': {
      await db.collection('gameState').doc('secret').set(
        { solvedBy: {}, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      invalidateStateCache();
      return res.status(200).json({ ok: true });
    }

    // -- Les Défis --------------------------------------------------------------
    // Validate/refuse a submission. Points land on the scoreboard immediately.
    case 'defi-review': {
      const { uid, challengeId, status } = body;
      const ref = db.collection('defiSubmissions').doc(String(uid || ''));
      const snap = await ref.get();
      if (!snap.exists) return sendError(res, 404, 'Aucune soumission.');
      const entry = snap.data().items?.[challengeId];
      if (!entry) return sendError(res, 404, 'Soumission introuvable.');

      const awarded = num(body.points, 0, 0, 2000);
      const already = entry.points || 0;
      await ref.set(
        {
          items: {
            [challengeId]: {
              ...entry,
              status: status || (awarded > 0 ? 'valid' : 'rejected'),
              points: awarded,
              reviewedAtMs: Date.now(),
            },
          },
        },
        { merge: true }
      );
      if (awarded - already !== 0) {
        await addPoints(
          db,
          uid,
          snap.data().username || uid,
          awarded - already,
          `Défi — ${entry.title || challengeId}`
        );
      }
      return res.status(200).json({ ok: true });
    }

    // Create a challenge from the console; it's written back into the sheet so
    // the spreadsheet stays the source of truth (falls back to local storage).
    case 'defi-create': {
      const title = String(body.title || '').trim().slice(0, 120);
      if (!title) return sendError(res, 400, 'Titre requis.');
      const challenge = {
        title,
        description: String(body.description || '').trim().slice(0, 500),
        points: num(body.points, 50, 0, 2000),
        media: ['photo', 'video', 'any'].includes(body.media) ? body.media : 'any',
        category: String(body.category || '').trim().slice(0, 60),
      };

      if (sheetConfigured()) {
        try {
          await appendSheetChallenge(challenge);
          invalidateSheetCache();
          return res.status(200).json({ ok: true, target: 'sheet' });
        } catch (err) {
          // Sheet unreachable → keep the challenge locally rather than lose it.
          const local = { ...challenge, id: `admin-${Date.now().toString(36)}`, source: 'admin' };
          await db.collection('gameState').doc('defis').set(
            { extra: FieldValue.arrayUnion(local), updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
          return res.status(200).json({ ok: true, target: 'local', sheetError: err.message });
        }
      }

      const local = { ...challenge, id: `admin-${Date.now().toString(36)}`, source: 'admin' };
      await db.collection('gameState').doc('defis').set(
        { extra: FieldValue.arrayUnion(local), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return res.status(200).json({ ok: true, target: 'local' });
    }

    // Make a challenge "hot": timed, pinned on top, worth bonus points.
    case 'defi-hot': {
      const challengeId = String(body.challengeId || '');
      if (!challengeId) return sendError(res, 400, 'Défi manquant.');
      const ref = db.collection('gameState').doc('defis');

      if (body.stop) {
        await ref.set({ [`hot.${challengeId}`]: FieldValue.delete() }, { merge: true });
        invalidateSheetCache();
        return res.status(200).json({ ok: true, stopped: true });
      }

      const minutes = num(body.minutes, 15, 1, 240);
      const startAtMs = Date.now();
      const endAtMs = startAtMs + minutes * 60_000;
      await ref.set(
        {
          hot: {
            [challengeId]: { startAtMs, endAtMs, bonusPoints: num(body.bonusPoints, 50, 0, 1000) },
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const push = await sendPush(db, {
        title: '🔥 Défi brûlant !',
        body: `${String(body.title || 'Un défi')} — ${minutes} min pour le relever !`,
        url: '/app',
      });
      return res.status(200).json({ ok: true, endAtMs, push });
    }

    case 'defi-hide': {
      const challengeId = String(body.challengeId || '');
      if (!challengeId) return sendError(res, 400, 'Défi manquant.');
      await db.collection('gameState').doc('defis').set(
        {
          hidden: body.hidden ? FieldValue.arrayUnion(challengeId) : FieldValue.arrayRemove(challengeId),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return res.status(200).json({ ok: true });
    }

    case 'defi-refresh-sheet': {
      invalidateSheetCache();
      return res.status(200).json({ ok: true });
    }

    // -- Le Fil d'Ariane (parcours) --------------------------------------------
    // Saving keeps the token of any destination that already has one, so tags
    // already written and stuck in the field stay valid.
    case 'parcours-setup': {
      const teamsMap = await ensureScoresDoc(db);
      const teamUids = Object.keys(teamsMap);
      const ref = db.collection('gameState').doc('parcours');
      const existing = (await ref.get()).data() || {};
      const previous = new Map((existing.destinations || []).map((d) => [d.id, d]));

      const destinations = (body.destinations || [])
        .map((d, i) => {
          const name = String(d.name || '').trim().slice(0, 80);
          const lat = Number(d.lat);
          const lng = Number(d.lng);
          if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const id = String(d.id || '') || `d${Date.now().toString(36)}${i}`;
          return {
            id,
            name,
            lat,
            lng,
            hint: String(d.hint || '').trim().slice(0, 200) || null,
            points: num(d.points, 100, 0, 1000),
            token: previous.get(id)?.token || makeToken(),
          };
        })
        .filter(Boolean);

      if (!destinations.length) return sendError(res, 400, 'Ajoutez au moins une destination.');

      const sequences = buildSequences(destinations.map((d) => d.id), teamUids);
      const progress = {};
      teamUids.forEach((uid) => {
        progress[uid] = { index: 0, found: [], route: '', routeStraight: false };
      });

      await ref.set({
        active: body.active !== false,
        destinations,
        sequences,
        progress,
        updatedAt: FieldValue.serverTimestamp(),
      });
      invalidateStateCache();

      if (body.active !== false) {
        await sendPush(db, {
          title: '🧵 Le Fil d’Ariane',
          body: 'Ariane a tendu son fil… Ouvrez l’app et suivez la flèche !',
          url: '/app',
        });
      }
      return res.status(200).json({ ok: true, destinations });
    }

    case 'parcours-toggle': {
      await db.collection('gameState').doc('parcours').set(
        { active: Boolean(body.active), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      invalidateStateCache();
      return res.status(200).json({ ok: true });
    }

    // Wipe progress but keep destinations and their (already printed) tokens.
    case 'parcours-reset': {
      const ref = db.collection('gameState').doc('parcours');
      const snap = await ref.get();
      if (!snap.exists) return sendError(res, 404, 'Aucun parcours.');
      const progress = {};
      Object.keys(snap.data().sequences || {}).forEach((uid) => {
        progress[uid] = { index: 0, found: [], route: '', routeStraight: false };
      });
      await ref.set({ progress, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      invalidateStateCache();
      return res.status(200).json({ ok: true });
    }

    case 'notify': {
      const title = String(body.title || '').trim().slice(0, 120);
      const text = String(body.body || '').trim().slice(0, 500);
      if (!title || !text) return sendError(res, 400, 'Titre et message requis.');
      const targetUid = body.target === 'self' ? decoded.uid : null;
      const push = await sendPush(db, { title, body: text, url: '/app', targetUid });
      return res.status(200).json({ ok: true, ...push });
    }

    default:
      return sendError(res, 400, `Unknown action: ${action}`);
  }
}

export default withErrorHandling(async function handler(req, res) {
  const verified = await verifyUser(req);
  if (verified.error) return sendError(res, verified.error.status, verified.error.message);
  if (verified.user.role !== 'admin') return sendError(res, 403, 'Admin role required');

  if (req.method === 'GET') return handleGet(req, res, verified);
  if (req.method === 'POST') return handlePost(req, res, verified);
  return sendError(res, 405, 'Method not allowed');
});
