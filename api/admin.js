// Admin endpoint: GET = dashboard state, POST = game control actions.
import {
  FieldValue,
  verifyUser,
  loadGameState,
  loadTeams,
  sendPush,
  invalidateStateCache,
  sendError,
  withErrorHandling,
} from './_lib/core.js';
import { SEED_RADIUS_M } from './_lib/territory.js';
import {
  FIXED_FINAL_DESTINATION,
  buildSequences,
  buildParcoursAdminView,
  withFixedFinalDestination,
} from './_lib/parcours.js';
import {
  loadSheetChallenges,
  loadDefisState,
  mergeChallenges,
  loadAllSubmissions,
  invalidateSheetCache,
} from './_lib/defis.js';
import { appendSheetChallenge, sheetConfigured } from './_lib/sheets.js';

const ARIANNE_EMAIL = 'arianne@grandjeu.local';

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
        },
      };
    }

    case 'trivia': {
      const questions = (cfg.questions || []).map((q) => {
        const type = ['choice', 'text', 'list'].includes(q.type) ? q.type : 'choice';
        const options = (q.options || []).slice(0, 4).map((o) => String(o).slice(0, 120)).filter(Boolean);
        return {
          type,
          q: String(q.q || '').slice(0, 300),
          options,
          correct: type === 'choice' ? num(q.correct, 0, 0, Math.max(0, options.length - 1)) : null,
          slots: type === 'list' ? num(q.slots || q.count, 2, 1, 10) : null,
          manual: type === 'text' || type === 'list',
          timeLimitSec: num(q.timeLimitSec, 20, 5, 120),
        };
      });
      if (!questions.length) throw new Error('Aucune question fournie.');
      questions.forEach((q) => {
        if (q.type === 'choice' && q.options.length < 2) {
          throw new Error('Chaque question choix multiple a besoin d’au moins 2 options.');
        }
      });
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

  const teams = await loadTeams(db);
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

  return res.status(200).json({
    ok: true,
    serverNow: Date.now(),
    teams,
    locations,
    currentChallengeId: current.challengeId || null,
    challenge,
    media,
    parcours: buildParcoursAdminView(parcours),
    secret: secret
      ? {
          active: Boolean(secret.active),
          location: secret.location || '33.8568304, 35.7256696',
          mapUrl: secret.mapUrl || 'https://maps.app.goo.gl/2FK2KBe7kycKC3R18?g_st=iw',
          finders: Object.entries(secret.solvedBy || {}).map(([uid, entry]) => ({
            uid,
            username: entry.username || uid,
            found: Boolean(entry.foundAtMs),
            foundAtMs: entry.foundAtMs || 0,
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
      const teamUids = await loadTeams(db);
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

      await ref.update(updates);
      invalidateStateCache();
      return res.status(200).json({ ok: true });
    }

    case 'trivia-skip': {
      const ref = db.collection('challenges').doc(body.challengeId);
      const snap = await ref.get();
      if (!snap.exists) return sendError(res, 404, 'Défi introuvable.');
      const challenge = { id: snap.id, ...snap.data() };
      if (challenge.type !== 'trivia') return sendError(res, 400, 'Mauvais type de défi.');
      if (challenge.status !== 'active') return sendError(res, 400, 'Ce défi est terminé.');

      const questions = [...(challenge.config.questions || [])];
      const now = Date.now();
      const index = Number.isInteger(body.questionIndex)
        ? body.questionIndex
        : questions.findIndex((q) => now >= q.startAtMs && now < q.endAtMs);
      const question = questions[index];
      if (!question) return sendError(res, 400, 'Question introuvable.');
      if (now < question.startAtMs || now >= question.endAtMs) {
        return sendError(res, 400, 'Aucune question active à passer.');
      }

      const revealSeconds = num(challenge.config.revealSeconds, 6, 2, 30);
      question.endAtMs = now;
      let cursor = now + revealSeconds * 1000;
      for (let i = index + 1; i < questions.length; i += 1) {
        const duration = num(questions[i].timeLimitSec, 20, 5, 120) * 1000;
        questions[i] = { ...questions[i], startAtMs: cursor, endAtMs: cursor + duration };
        cursor = questions[i].endAtMs + revealSeconds * 1000;
      }

      await ref.update({
        'config.questions': questions,
        endAtMs: cursor,
        updatedAt: FieldValue.serverTimestamp(),
      });
      invalidateStateCache();
      return res.status(200).json({ ok: true });
    }

    case 'trivia-review': {
      const { challengeId, uid, status } = body;
      const questionIndex = Number(body.questionIndex);
      const ref = db.collection('challenges').doc(challengeId);
      const snap = await ref.get();
      if (!snap.exists) return sendError(res, 404, 'Défi introuvable.');
      const challenge = { id: snap.id, ...snap.data() };
      if (challenge.type !== 'trivia') return sendError(res, 400, 'Mauvais type de défi.');
      const answer = challenge.board?.[uid]?.answers?.[questionIndex];
      if (!answer) return sendError(res, 404, 'Réponse introuvable.');

      const valid = status === 'valid';
      await ref.update({
        [`board.${uid}.answers.${questionIndex}.status`]: valid ? 'valid' : 'rejected',
        [`board.${uid}.answers.${questionIndex}.correct`]: valid,
        [`board.${uid}.answers.${questionIndex}.reviewedAtMs`]: Date.now(),
      });
      invalidateStateCache();
      return res.status(200).json({ ok: true });
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

    // Accept or refuse a submission.
    case 'review': {
      const { challengeId, uid, status } = body;
      const ref = db.collection('challenges').doc(challengeId);
      const snap = await ref.get();
      if (!snap.exists) return sendError(res, 404, 'Défi introuvable.');
      const challenge = { id: snap.id, ...snap.data() };
      const entry = challenge.board?.[uid];
      if (!entry) return sendError(res, 404, 'Aucune participation pour cette équipe.');

      const updates = {};
      if (challenge.type === 'drawguess') {
        updates[`board.${uid}.guessStatus`] = status === 'valid' ? 'valid' : 'rejected';
      } else {
        updates[`board.${uid}.status`] = status === 'valid' ? 'valid' : 'rejected';
      }
      await ref.update(updates);
      invalidateStateCache();
      return res.status(200).json({ ok: true });
    }

    // -- Secret de la chouette (hidden owl location on the home screen) ---------
    case 'secret-setup': {
      await db.collection('gameState').doc('secret').set(
        {
          active: body.active !== false,
          location: '33.8568304, 35.7256696',
          mapUrl: 'https://maps.app.goo.gl/2FK2KBe7kycKC3R18?g_st=iw',
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
    // Validate or refuse a submission.
    case 'defi-review': {
      const { uid, challengeId, status } = body;
      const ref = db.collection('defiSubmissions').doc(String(uid || ''));
      const snap = await ref.get();
      if (!snap.exists) return sendError(res, 404, 'Aucune soumission.');
      const entry = snap.data().items?.[challengeId];
      if (!entry) return sendError(res, 404, 'Soumission introuvable.');

      await ref.set(
        {
          items: {
            [challengeId]: {
              ...entry,
              status: status === 'valid' ? 'valid' : 'rejected',
              reviewedAtMs: Date.now(),
            },
          },
        },
        { merge: true }
      );
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

    // Make a challenge "hot": timed and pinned on top.
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
            [challengeId]: { startAtMs, endAtMs },
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
    case 'parcours-setup': {
      const teamUids = (await loadTeams(db)).map((team) => team.uid);
      const ref = db.collection('gameState').doc('parcours');
      const destinations = withFixedFinalDestination((body.destinations || [])
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
          };
        })
        .filter(Boolean));

      if (!destinations.length) return sendError(res, 400, 'Ajoutez au moins une destination.');

      const regularDestIds = destinations
        .filter((d) => d.id !== FIXED_FINAL_DESTINATION.id)
        .map((d) => d.id);
      const sequences = buildSequences(regularDestIds, teamUids);
      teamUids.forEach((uid) => {
        sequences[uid] = [...(sequences[uid] || []), FIXED_FINAL_DESTINATION.id];
      });
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
        const arianneSnap = await db
          .collection('users')
          .where('email', '==', ARIANNE_EMAIL)
          .limit(1)
          .get();
        const arianneUid = arianneSnap.empty ? null : arianneSnap.docs[0].id;
        if (arianneUid) {
          await sendPush(db, {
            title: '🧵 Le Fil d’Ariane',
            body: 'Ariane a tendu son fil… Ouvrez l’app et suivez la flèche !',
            url: '/arianne',
            targetUid: arianneUid,
          });
        }
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

    // Wipe progress but keep destinations.
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
