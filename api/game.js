// Player endpoint: GET = poll game state, POST = submissions & device registration.
import {
  FieldValue,
  verifyUser,
  loadGameState,
  getAdminUids,
  addPoints,
  normalizeAnswer,
  invalidateStateCache,
  sendError,
  withErrorHandling,
} from './_lib/core.js';
import { haversineMeters, applyTerritoryMove, territoryAreas, parseGeom } from './_lib/territory.js';
import { fetchWalkingRoute } from './_lib/routing.js';
import {
  loadSheetChallenges,
  loadDefisState,
  mergeChallenges,
  loadTeamSubmissions,
  buildDefisView,
} from './_lib/defis.js';
import {
  buildParcoursView,
  currentDestId,
  destinationById,
} from './_lib/parcours.js';

// Drawings/photos are immutable once submitted, so cache media reads (guess phase).
const mediaCache = new Map(); // `${challengeId}:${uid}` -> { data, ts }
const MEDIA_CACHE_TTL = 60_000;
const PARCOURS_ARRIVAL_M = 35;

async function loadMedia(db, challengeId, uid) {
  const key = `${challengeId}:${uid}`;
  const cached = mediaCache.get(key);
  if (cached && Date.now() - cached.ts < MEDIA_CACHE_TTL) return cached.data;

  const snap = await db
    .collection('challenges')
    .doc(challengeId)
    .collection('media')
    .doc(uid)
    .get();
  const data = snap.exists ? snap.data() : null;
  if (data) mediaCache.set(key, { data, ts: Date.now() });
  return data;
}

function drawguessPhase(challenge, now) {
  if (now < challenge.config.drawEndAtMs) return 'draw';
  if (now < challenge.endAtMs && challenge.status === 'active') return 'guess';
  return 'done';
}

// ---------------------------------------------------------------------------
// GET — build the per-type player view without leaking answers/other teams
// ---------------------------------------------------------------------------
async function buildChallengeView(db, challenge, uid) {
  if (!challenge) return null;

  const now = Date.now();
  const timeUp = now >= challenge.endAtMs;
  const running = challenge.status === 'active' && !timeUp;
  const board = challenge.board || {};
  const own = board[uid] || null;
  const config = challenge.config || {};

  const base = {
    id: challenge.id,
    type: challenge.type,
    status: challenge.status,
    running,
    startAtMs: challenge.startAtMs,
    endAtMs: challenge.endAtMs,
  };

  switch (challenge.type) {
    case 'steps': {
      const hideFromMs = challenge.endAtMs - (config.hideFinalSeconds || 0) * 1000;
      const hidden = running && now >= hideFromMs;
      const leaderboard = hidden
        ? null
        : Object.entries(board)
            .map(([id, entry]) => ({ uid: id, username: entry.username, steps: entry.steps || 0 }))
            .sort((a, b) => b.steps - a.steps);
      return {
        ...base,
        hideFinalSeconds: config.hideFinalSeconds || 0,
        hideFromMs,
        leaderboardHidden: hidden,
        leaderboard,
        ownSteps: own?.steps || 0,
      };
    }

    case 'trivia': {
      const questions = (config.questions || []).map((q, idx) => {
        const finished = now >= q.endAtMs;
        return {
          index: idx,
          q: q.q,
          options: q.options,
          points: q.points,
          timeLimitSec: q.timeLimitSec,
          startAtMs: q.startAtMs,
          endAtMs: q.endAtMs,
          correct: finished ? q.correct : null,
        };
      });
      return {
        ...base,
        lobbySeconds: config.lobbySeconds,
        questionCount: questions.length,
        questions,
        ownAnswers: own?.answers || {},
        ownTriviaPoints: own?.points || 0,
      };
    }

    case 'bounty':
    case 'photo':
      return {
        ...base,
        target: config.target || null,
        mission: config.mission || null,
        ownSubmission: own
          ? { atMs: own.submittedAtMs, status: own.status || 'pending', points: own.points || 0 }
          : null,
        submittedCount: Object.values(board).filter((e) => e.submittedAtMs).length,
      };

    case 'drawguess': {
      const phase = drawguessPhase(challenge, now);
      const assignment = (config.assignments || {})[uid] || null;
      const view = {
        ...base,
        phase,
        drawEndAtMs: config.drawEndAtMs,
        prompt: assignment?.prompt || null,
        drawingSubmitted: Boolean(own?.drawingAtMs),
        ownGuess: own?.guess || null,
        guessResult: own?.guessPoints != null ? own.guessPoints : null,
      };
      if (phase !== 'draw' && assignment?.sourceUid) {
        const sourceBoard = board[assignment.sourceUid];
        if (sourceBoard?.drawingAtMs) {
          const media = await loadMedia(db, challenge.id, assignment.sourceUid);
          view.sourceDrawing = media?.imageDataUrl || null;
        } else {
          view.sourceDrawing = null;
        }
        if (phase === 'done') {
          view.sourcePrompt = (config.assignments || {})[assignment.sourceUid]?.prompt || null;
        }
      }
      return view;
    }

    case 'guide': {
      const arrivals = Object.entries(board)
        .filter(([, entry]) => entry.arrivedAtMs)
        .map(([id, entry]) => ({
          uid: id,
          username: entry.username,
          rank: entry.rank,
          points: entry.points || 0,
          atMs: entry.arrivedAtMs,
        }))
        .sort((a, b) => a.atMs - b.atMs);
      return {
        ...base,
        targetLat: config.lat,
        targetLng: config.lng,
        radiusM: config.radiusM,
        arrived: own?.arrivedAtMs
          ? { atMs: own.arrivedAtMs, rank: own.rank, points: own.points || 0 }
          : null,
        arrivals,
      };
    }

    case 'territory': {
      const teamNames = config.teamNames || {};
      const areas = territoryAreas(challenge);
      const territories = {};
      const trails = {};
      for (const id of Object.keys(teamNames)) {
        territories[id] = parseGeom(challenge.territories?.[id], []);
        trails[id] = parseGeom(challenge.trails?.[id], []);
      }
      const view = {
        ...base,
        seedRadiusM: config.seedRadiusM,
        teams: Object.entries(teamNames)
          .map(([id, name]) => ({ uid: id, username: name, areaM2: areas[id] || 0 }))
          .sort((a, b) => b.areaM2 - a.areaM2),
        territories,
        trails,
      };
      // Run-tracker replay: full walked paths once the conquest is over.
      if (!running) {
        view.tracks = {};
        for (const id of Object.keys(teamNames)) {
          view.tracks[id] = parseGeom(challenge.tracks?.[id], []);
        }
      }
      return view;
    }

    case 'riddle':
      return {
        ...base,
        text: config.text,
        points: config.points,
        solved: Boolean(own?.solved),
        solvedAtMs: own?.solvedAtMs || null,
        wonPoints: own?.points || 0,
        attempts: own?.attempts || 0,
        solvedCount: Object.values(board).filter((e) => e.solved).length,
      };

    default:
      return base;
  }
}

async function handleGet(req, res) {
  const verified = await verifyUser(req);
  if (verified.error) return sendError(res, verified.error.status, verified.error.message);
  const { db, decoded, user } = verified;

  // The challenge list is fetched on demand (heavier than the game poll), so
  // it lives behind ?view=defis rather than riding along every few seconds.
  if (req.query?.view === 'defis') {
    const [{ challenges, error: sheetError }, state, items] = await Promise.all([
      loadSheetChallenges(),
      loadDefisState(db),
      loadTeamSubmissions(db, decoded.uid),
    ]);
    return res.status(200).json({
      ok: true,
      serverNow: Date.now(),
      sheetError,
      defis: buildDefisView(mergeChallenges(challenges, state), items),
    });
  }

  const [{ scores, challenge, parcours, secret }, adminUids] = await Promise.all([
    loadGameState(db),
    getAdminUids(db),
  ]);
  const teams = Object.entries(scores)
    .filter(([uid]) => !adminUids.has(uid))
    .map(([uid, entry]) => ({ uid, username: entry.username, score: entry.score || 0 }))
    .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));

  const challengeView = await buildChallengeView(db, challenge, decoded.uid);

  return res.status(200).json({
    ok: true,
    serverNow: Date.now(),
    me: {
      uid: decoded.uid,
      username: user.username,
      role: user.role || 'user',
      score: scores[decoded.uid]?.score || 0,
    },
    teams,
    challenge: challengeView,
    parcours: buildParcoursView(parcours, decoded.uid),
    // Only whether an owl is worth tapping — never the riddle itself.
    secret: secret?.active
      ? {
          active: true,
          solved: Boolean(secret.solvedBy?.[decoded.uid]?.solved),
          found: Boolean(secret.solvedBy?.[decoded.uid]?.foundAtMs),
        }
      : null,
  });
}

// ---------------------------------------------------------------------------
// POST — player actions
// ---------------------------------------------------------------------------
async function loadActiveChallenge(db, challengeId, expectedType) {
  const snap = await db.collection('challenges').doc(challengeId).get();
  if (!snap.exists) throw new Error('Défi introuvable.');
  const challenge = { id: snap.id, ...snap.data() };
  if (expectedType && challenge.type !== expectedType) throw new Error('Mauvais type de défi.');
  return challenge;
}

function assertRunning(challenge, now = Date.now()) {
  if (challenge.status !== 'active' || now >= challenge.endAtMs) {
    throw new Error('Ce défi est terminé.');
  }
}

const MAX_IMAGE_BYTES = 900_000;

function assertImage(imageDataUrl) {
  if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
    throw new Error('Image invalide.');
  }
  if (imageDataUrl.length > MAX_IMAGE_BYTES) {
    throw new Error("L'image est trop lourde. Réessaie.");
  }
}

async function saveBoardEntry(db, challengeId, uid, entry) {
  await db
    .collection('challenges')
    .doc(challengeId)
    .set({ board: { [uid]: entry } }, { merge: true });
  invalidateStateCache();
}

async function saveMedia(db, challengeId, uid, imageDataUrl, kind) {
  await db
    .collection('challenges')
    .doc(challengeId)
    .collection('media')
    .doc(uid)
    .set({ imageDataUrl, kind, uid, updatedAt: FieldValue.serverTimestamp() });
}

async function handlePost(req, res) {
  const verified = await verifyUser(req);
  if (verified.error) return sendError(res, verified.error.status, verified.error.message);
  const { db, decoded, user } = verified;
  const body = req.body || {};
  const { action } = body;
  const uid = decoded.uid;
  const username = user.username;
  const now = Date.now();

  switch (action) {
    // -- device registration -------------------------------------------------
    case 'subscription': {
      const { id, subscription } = body;
      if (!id || !subscription?.endpoint) return sendError(res, 400, 'Invalid subscription');
      await db
        .collection('users')
        .doc(uid)
        .collection('pushSubscriptions')
        .doc(id)
        .set({ subscription, active: true, updatedAt: FieldValue.serverTimestamp() });
      return res.status(200).json({ ok: true });
    }

    case 'location': {
      const { latitude, longitude, accuracy, heading, speed } = body;
      if (
        typeof latitude !== 'number' || Number.isNaN(latitude) || latitude < -90 || latitude > 90 ||
        typeof longitude !== 'number' || Number.isNaN(longitude) || longitude < -180 || longitude > 180
      ) {
        return sendError(res, 400, 'Invalid coordinates');
      }
      await db.collection('users').doc(uid).set(
        {
          uid,
          username,
          location: {
            latitude,
            longitude,
            accuracy: typeof accuracy === 'number' ? accuracy : null,
            heading: typeof heading === 'number' ? heading : null,
            speed: typeof speed === 'number' ? speed : null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return res.status(200).json({ ok: true });
    }

    // -- steps ----------------------------------------------------------------
    case 'steps': {
      const challenge = await loadActiveChallenge(db, body.challengeId, 'steps');
      // Accept saves a few seconds past the end so the final count lands.
      if (challenge.status !== 'active' || now >= challenge.endAtMs + 15_000) {
        return sendError(res, 400, 'Ce défi est terminé.');
      }
      const steps = Number(body.steps);
      if (!Number.isFinite(steps) || steps < 0 || steps > 100_000) {
        return sendError(res, 400, 'Invalid steps');
      }
      const existing = challenge.board?.[uid]?.steps || 0;
      await saveBoardEntry(db, challenge.id, uid, {
        username,
        steps: Math.max(existing, Math.round(steps)),
        updatedAtMs: now,
      });
      return res.status(200).json({ ok: true });
    }

    // -- trivia ---------------------------------------------------------------
    case 'trivia-answer': {
      const challenge = await loadActiveChallenge(db, body.challengeId, 'trivia');
      assertRunning(challenge, now);
      const idx = Number(body.questionIndex);
      const choice = Number(body.choice);
      const question = challenge.config.questions?.[idx];
      if (!question || !Number.isInteger(choice) || choice < 0 || choice >= question.options.length) {
        return sendError(res, 400, 'Réponse invalide.');
      }
      if (now < question.startAtMs || now >= question.endAtMs) {
        return sendError(res, 400, 'Trop tard pour cette question !');
      }
      const existingAnswers = challenge.board?.[uid]?.answers || {};
      if (existingAnswers[idx]) {
        return sendError(res, 400, 'Déjà répondu.');
      }

      const correct = choice === question.correct;
      const remaining = question.endAtMs - now;
      const ratio = remaining / (question.timeLimitSec * 1000);
      const points = correct ? Math.round(question.points * (0.5 + 0.5 * ratio)) : 0;

      await saveBoardEntry(db, challenge.id, uid, {
        username,
        answers: { ...existingAnswers, [idx]: { choice, correct, points, atMs: now } },
        points: (challenge.board?.[uid]?.points || 0) + points,
      });
      if (points > 0) {
        await addPoints(db, uid, username, points, `Oracle Q${idx + 1}`, challenge.id);
      }
      return res.status(200).json({ ok: true, accepted: true });
    }

    // -- photo / bounty ---------------------------------------------------------
    case 'photo': {
      const challenge = await loadActiveChallenge(db, body.challengeId);
      if (!['photo', 'bounty'].includes(challenge.type)) {
        return sendError(res, 400, 'Mauvais type de défi.');
      }
      assertRunning(challenge, now);
      assertImage(body.imageDataUrl);
      await saveMedia(db, challenge.id, uid, body.imageDataUrl, 'photo');
      const previous = challenge.board?.[uid] || {};
      await saveBoardEntry(db, challenge.id, uid, {
        username,
        submittedAtMs: previous.submittedAtMs || now,
        updatedAtMs: now,
        status: 'pending',
        points: previous.points || 0,
      });
      return res.status(200).json({ ok: true });
    }

    // -- drawguess --------------------------------------------------------------
    case 'drawing': {
      const challenge = await loadActiveChallenge(db, body.challengeId, 'drawguess');
      assertRunning(challenge, now);
      if (drawguessPhase(challenge, now) !== 'draw') {
        return sendError(res, 400, 'La phase de dessin est terminée.');
      }
      assertImage(body.imageDataUrl);
      await saveMedia(db, challenge.id, uid, body.imageDataUrl, 'drawing');
      const previous = challenge.board?.[uid] || {};
      await saveBoardEntry(db, challenge.id, uid, {
        ...previous,
        username,
        drawingAtMs: now,
      });
      return res.status(200).json({ ok: true });
    }

    case 'guess': {
      const challenge = await loadActiveChallenge(db, body.challengeId, 'drawguess');
      assertRunning(challenge, now);
      if (drawguessPhase(challenge, now) !== 'guess') {
        return sendError(res, 400, "Ce n'est pas encore le moment de deviner.");
      }
      const guess = String(body.guess || '').trim().slice(0, 120);
      if (!guess) return sendError(res, 400, 'Écris une réponse.');
      const previous = challenge.board?.[uid] || {};
      await saveBoardEntry(db, challenge.id, uid, {
        ...previous,
        username,
        guess,
        guessAtMs: now,
      });
      return res.status(200).json({ ok: true });
    }

    // -- guide (compass hunt) -----------------------------------------------------
    case 'arrive': {
      const { latitude, longitude, accuracy } = body;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return sendError(res, 400, 'Position invalide.');
      }
      const ref = db.collection('challenges').doc(String(body.challengeId || ''));
      // Transaction so two teams arriving together still get distinct ranks.
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Défi introuvable.');
        const challenge = { id: snap.id, ...snap.data() };
        if (challenge.type !== 'guide') throw new Error('Mauvais type de défi.');
        assertRunning(challenge, now);
        const previous = challenge.board?.[uid];
        if (previous?.arrivedAtMs) {
          return { alreadyArrived: true, rank: previous.rank, points: previous.points || 0 };
        }
        const cfg = challenge.config;
        const distance = haversineMeters(latitude, longitude, cfg.lat, cfg.lng);
        const tolerance = Math.min(Math.max(Number(accuracy) || 0, 10), 30);
        if (distance > cfg.radiusM + tolerance) {
          return { tooFar: true, distance: Math.round(distance) };
        }
        const rank = Object.values(challenge.board || {}).filter((e) => e.arrivedAtMs).length + 1;
        const rankPoints = cfg.rankPoints || [];
        const points = rankPoints[rank - 1] || 0;
        tx.update(ref, {
          [`board.${uid}`]: { username, arrivedAtMs: now, rank, points },
        });
        return { arrived: true, rank, points };
      });
      if (result.arrived) {
        invalidateStateCache();
        if (result.points > 0) {
          await addPoints(db, uid, username, result.points, 'Fil d’Ariane', body.challengeId);
        }
      }
      return res.status(200).json({ ok: true, ...result });
    }

    // -- territory (walking paper.io) ----------------------------------------------
    case 'territory-move': {
      const { latitude, longitude } = body;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return sendError(res, 400, 'Position invalide.');
      }
      const ref = db.collection('challenges').doc(String(body.challengeId || ''));
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Défi introuvable.');
        const challenge = { id: snap.id, ...snap.data() };
        if (challenge.type !== 'territory') throw new Error('Mauvais type de défi.');
        if (challenge.status !== 'active' || now >= challenge.endAtMs) return { ended: true };
        if (now < challenge.startAtMs) return { waiting: true };
        const moved = applyTerritoryMove(challenge, uid, latitude, longitude);
        if (!moved) throw new Error('Équipe inconnue.');
        tx.update(ref, {
          ...moved.updates,
          [`board.${uid}`]: { username, updatedAtMs: now },
        });
        return { captured: moved.captured, areaM2: Math.round(moved.areaM2) };
      });
      // No cache invalidation: the 2.5s state cache keeps polling cheap and the
      // grid is never more than a couple seconds stale on other phones.
      return res.status(200).json({ ok: true, ...result });
    }

    // -- secret location (the owl easter egg on the home screen) --------------------
    // The map link is only served once a team has actually found the owl, so it
    // can't be read out of the poll payload by a curious scout.
    case 'secret-open': {
      const snap = await db.collection('gameState').doc('secret').get();
      if (!snap.exists || !snap.data().active) {
        return res.status(200).json({ ok: true, inactive: true });
      }
      const secret = snap.data();
      const own = secret.solvedBy?.[uid];
      if (!own?.foundAtMs) {
        await db.collection('gameState').doc('secret').set(
          { solvedBy: { [uid]: { ...(own || {}), username, foundAtMs: now } } },
          { merge: true }
        );
      }
      return res.status(200).json({
        ok: true,
        location: secret.location || '33.8568304, 35.7256696',
        mapUrl: secret.mapUrl || 'https://maps.app.goo.gl/2FK2KBe7kycKC3R18?g_st=iw',
      });
    }

    // -- défis (always-on challenge list) -------------------------------------------
    // The media is already in Firebase Storage (uploaded straight from the
    // phone); we only record the reference and reset the review status.
    case 'defi-submit': {
      const challengeId = String(body.challengeId || '').slice(0, 120);
      const mediaUrl = String(body.mediaUrl || '');
      const mediaType = body.mediaType === 'video' ? 'video' : 'photo';
      const storagePath = String(body.storagePath || '').slice(0, 300);
      if (!challengeId || !mediaUrl.startsWith('https://')) {
        return sendError(res, 400, 'Soumission invalide.');
      }

      const [{ challenges }, state] = await Promise.all([loadSheetChallenges(), loadDefisState(db)]);
      const challenge = mergeChallenges(challenges, state).find((c) => c.id === challengeId);
      if (!challenge) return sendError(res, 404, 'Défi introuvable.');
      if (challenge.hot && now >= challenge.hotEndAtMs) {
        return sendError(res, 400, 'Ce défi brûlant est terminé.');
      }

      const ref = db.collection('defiSubmissions').doc(uid);
      await ref.set(
        {
          uid,
          username,
          items: {
            [challengeId]: {
              challengeId,
              title: challenge.title,
              mediaUrl,
              mediaType,
              storagePath,
              atMs: now,
              status: 'pending',
              points: 0,
              wasHot: Boolean(challenge.hot),
              bonusPoints: challenge.bonusPoints || 0,
            },
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return res.status(200).json({ ok: true });
    }

    // -- parcours (Le Fil d'Ariane) -------------------------------------------------
    // GPS arrival at the current destination: award it, then compute the
    // walking route to the next one.
    case 'parcours-arrive': {
      const { latitude, longitude, accuracy } = body;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return sendError(res, 400, 'Position invalide.');
      }
      const ref = db.collection('gameState').doc('parcours');
      const outcome = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { inactive: true };
        const parcours = snap.data();
        if (!parcours.active) return { inactive: true };

        const sequence = parcours.sequences?.[uid] || [];
        const progress = parcours.progress?.[uid] || { index: 0, found: [] };
        const index = progress.index ?? 0;
        if (index >= sequence.length) return { done: true };

        const dest = destinationById(parcours, sequence[index]);
        if (!dest) return { done: true };

        const distance = haversineMeters(latitude, longitude, dest.lat, dest.lng);
        const tolerance = Math.min(Math.max(Number(accuracy) || 0, 10), 30);
        if (distance > PARCOURS_ARRIVAL_M + tolerance) {
          return { tooFar: true, distance: Math.round(distance), name: dest.name };
        }

        // Rank = how many teams reached this destination before us.
        const rank =
          Object.values(parcours.progress || {}).filter((p) =>
            (p.found || []).some((f) => f.destId === dest.id)
          ).length + 1;
        const points = dest.points || 0;
        const nextIndex = index + 1;
        const nextDestId = sequence[nextIndex] || null;

        tx.update(ref, {
          [`progress.${uid}.index`]: nextIndex,
          [`progress.${uid}.found`]: [
            ...(progress.found || []),
            { destId: dest.id, name: dest.name, atMs: now, points, rank },
          ],
          [`progress.${uid}.route`]: '',
          [`progress.${uid}.routeStraight`]: false,
        });

        return {
          found: true,
          name: dest.name,
          points,
          rank,
          from: { lat: latitude, lng: longitude },
          nextDestId,
          nextName: nextDestId ? destinationById(parcours, nextDestId)?.name || null : null,
          finished: !nextDestId,
        };
      });

      if (!outcome.found) {
        invalidateStateCache();
        return res.status(200).json({ ok: true, ...outcome });
      }

      invalidateStateCache();
      if (outcome.points > 0) {
        await addPoints(db, uid, username, outcome.points, `Fil d’Ariane — ${outcome.name}`);
      }

      // The next leg starts from their current GPS position.
      if (outcome.nextDestId) {
        const fresh = (await ref.get()).data();
        const next = destinationById(fresh, outcome.nextDestId);
        if (next) {
          const route = await fetchWalkingRoute(outcome.from, { lat: next.lat, lng: next.lng });
          await ref.update({
            [`progress.${uid}.route`]: JSON.stringify(route.points),
            [`progress.${uid}.routeStraight`]: route.straight,
            [`progress.${uid}.routeAtMs`]: Date.now(),
          });
          invalidateStateCache();
        }
      }

      return res.status(200).json({
        ok: true,
        found: true,
        name: outcome.name,
        points: outcome.points,
        rank: outcome.rank,
        nextName: outcome.nextName,
        finished: outcome.finished,
      });
    }

    // Compute (or recompute) the walking route from where the team is now.
    case 'parcours-route': {
      const { latitude, longitude } = body;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return sendError(res, 400, 'Position invalide.');
      }
      const ref = db.collection('gameState').doc('parcours');
      const snap = await ref.get();
      if (!snap.exists) return res.status(200).json({ ok: true, inactive: true });
      const parcours = snap.data();
      if (!parcours.active) return res.status(200).json({ ok: true, inactive: true });

      const destId = currentDestId(parcours, uid);
      const dest = destId ? destinationById(parcours, destId) : null;
      if (!dest) return res.status(200).json({ ok: true, done: true });

      const route = await fetchWalkingRoute(
        { lat: latitude, lng: longitude },
        { lat: dest.lat, lng: dest.lng }
      );
      await ref.update({
        [`progress.${uid}.route`]: JSON.stringify(route.points),
        [`progress.${uid}.routeStraight`]: route.straight,
        [`progress.${uid}.routeAtMs`]: Date.now(),
      });
      invalidateStateCache();
      return res.status(200).json({ ok: true, points: route.points.length, straight: route.straight });
    }

    // -- riddle -------------------------------------------------------------------
    case 'riddle-answer': {
      const challenge = await loadActiveChallenge(db, body.challengeId, 'riddle');
      assertRunning(challenge, now);
      const previous = challenge.board?.[uid] || {};
      if (previous.solved) {
        return res.status(200).json({ ok: true, correct: true, alreadySolved: true });
      }
      const normalized = normalizeAnswer(body.answer);
      if (!normalized) return sendError(res, 400, 'Écris une réponse.');
      const accepted = (challenge.config.answers || []).map(normalizeAnswer);
      const correct = accepted.includes(normalized);
      const attempts = (previous.attempts || 0) + 1;

      if (!correct) {
        await saveBoardEntry(db, challenge.id, uid, { ...previous, username, attempts });
        return res.status(200).json({ ok: true, correct: false, attempts });
      }

      const anySolved = Object.values(challenge.board || {}).some((e) => e.solved);
      const points = (challenge.config.points || 0) + (!anySolved ? challenge.config.firstBonus || 0 : 0);
      await saveBoardEntry(db, challenge.id, uid, {
        ...previous,
        username,
        attempts,
        solved: true,
        solvedAtMs: now,
        points,
      });
      await addPoints(db, uid, username, points, 'Énigme du Sphinx', challenge.id);
      return res.status(200).json({ ok: true, correct: true, points, first: !anySolved });
    }

    default:
      return sendError(res, 400, `Unknown action: ${action}`);
  }
}

export default withErrorHandling(async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return sendError(res, 405, 'Method not allowed');
});
