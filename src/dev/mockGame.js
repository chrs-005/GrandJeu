// Dev-only mock game states: open the app with ?mock=<type> to preview any
// challenge UI without the serverless backend (vite dev has no /api runtime).
// Types: hub, steps, steps-veiled, trivia, bounty, photo, drawguess,
// drawguess-guess, riddle, guide, territory, territory-end

const TEAM_FIXTURES = [
  { uid: 'u-faucon', username: 'faucon', score: 320 },
  { uid: 'u-requin', username: 'requin', score: 260 },
  { uid: 'u-panda', username: 'panda', score: 210 },
  { uid: 'u-leopard', username: 'leopard', score: 150 },
  { uid: 'u-bison', username: 'bison', score: 90 },
];

const SAMPLE_DRAWING =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#fff"/><circle cx="320" cy="200" r="90" fill="none" stroke="#111" stroke-width="8"/><path d="M230 320 Q320 420 410 320" fill="none" stroke="#c00" stroke-width="8"/><text x="320" y="60" text-anchor="middle" font-size="30">?</text></svg>`
  );

export function buildMockGame(type) {
  const now = Date.now();
  const base = {
    ok: true,
    serverNow: now,
    me: { uid: 'u-faucon', username: 'faucon', role: 'user', score: 320 },
    teams: TEAM_FIXTURES,
    challenge: null,
  };

  const common = { id: 'mock', status: 'active', running: true, startAtMs: now - 10_000 };

  switch (type) {
    case 'steps':
      base.challenge = {
        ...common,
        type: 'steps',
        endAtMs: now + 90_000,
        hideFinalSeconds: 45,
        hideFromMs: now + 45_000,
        leaderboardHidden: false,
        leaderboard: TEAM_FIXTURES.map((t, i) => ({ ...t, steps: 400 - i * 60 })),
        ownSteps: 400,
      };
      break;
    case 'steps-veiled':
      base.challenge = {
        ...common,
        type: 'steps',
        endAtMs: now + 30_000,
        hideFinalSeconds: 45,
        hideFromMs: now - 1000,
        leaderboardHidden: true,
        leaderboard: null,
        ownSteps: 512,
      };
      break;
    case 'trivia':
      base.challenge = {
        ...common,
        type: 'trivia',
        endAtMs: now + 60_000,
        lobbySeconds: 5,
        questionCount: 3,
        questions: [
          {
            index: 0,
            q: 'Qui est le roi des dieux de l’Olympe ?',
            options: ['Poséidon', 'Zeus', 'Hadès', 'Apollon'],
            points: 100,
            timeLimitSec: 20,
            startAtMs: now - 5000,
            endAtMs: now + 15_000,
            correct: null,
          },
        ],
        ownAnswers: {},
        ownTriviaPoints: 0,
      };
      break;
    case 'bounty':
      base.challenge = {
        ...common,
        type: 'bounty',
        endAtMs: now + 600_000,
        target: 'Marc, l’animateur au foulard rouge',
        mission: null,
        ownSubmission: null,
        submittedCount: 2,
      };
      break;
    case 'photo':
      base.challenge = {
        ...common,
        type: 'photo',
        endAtMs: now + 600_000,
        target: null,
        mission: 'Toute l’équipe en pyramide humaine devant un monument',
        ownSubmission: { atMs: now - 60_000, status: 'valid', points: 70 },
        submittedCount: 4,
      };
      break;
    case 'drawguess':
      base.challenge = {
        ...common,
        type: 'drawguess',
        endAtMs: now + 300_000,
        phase: 'draw',
        drawEndAtMs: now + 120_000,
        prompt: 'Le cheval de Troie',
        drawingSubmitted: false,
        ownGuess: null,
        guessResult: null,
      };
      break;
    case 'drawguess-guess':
      base.challenge = {
        ...common,
        type: 'drawguess',
        endAtMs: now + 120_000,
        phase: 'guess',
        drawEndAtMs: now - 5000,
        prompt: 'Le cheval de Troie',
        drawingSubmitted: true,
        ownGuess: null,
        guessResult: null,
        sourceDrawing: SAMPLE_DRAWING,
      };
      break;
    case 'riddle':
      base.challenge = {
        ...common,
        type: 'riddle',
        endAtMs: now + 300_000,
        text: 'Quel être marche à quatre pattes le matin, à deux pattes le midi et à trois pattes le soir ?',
        points: 100,
        solved: false,
        solvedAtMs: null,
        wonPoints: 0,
        attempts: 1,
        solvedCount: 1,
      };
      break;
    case 'guide':
      base.challenge = {
        ...common,
        type: 'guide',
        endAtMs: now + 1_500_000,
        targetLat: 33.8956,
        targetLng: 35.5041,
        radiusM: 30,
        arrived: null,
        arrivals: [
          { uid: 'u-requin', username: 'requin', rank: 1, points: 100, atMs: now - 120_000 },
        ],
        mockPos: { lat: 33.8938, lng: 35.5018, accuracy: 8 },
      };
      break;
    case 'territory':
    case 'territory-end': {
      const LAT = 33.8938;
      const LNG = 35.5018;
      const mLat = 111320;
      const mLng = 111320 * Math.cos((LAT * Math.PI) / 180);
      const pt = (dxM, dyM) => [LNG + dxM / mLng, LAT + dyM / mLat];
      // Wobbly organic blob (like a real walked loop) around an offset center.
      const blob = (cx, cy, r, wobble = 0.3, steps = 22) => {
        const ring = [];
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * 2 * Math.PI;
          const rr = r * (1 + wobble * Math.sin(a * 3 + cx));
          ring.push(pt(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
        }
        ring.push(ring[0]);
        return [[ring]];
      };
      const path = (fromX, fromY, toX, toY, steps = 14) => {
        const pts = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          pts.push(
            pt(
              fromX + (toX - fromX) * t + Math.sin(t * 6) * 12,
              fromY + (toY - fromY) * t + Math.cos(t * 5) * 9
            )
          );
        }
        return pts;
      };
      const ended = type === 'territory-end';
      base.challenge = {
        ...common,
        type: 'territory',
        status: ended ? 'ended' : 'active',
        running: !ended,
        endAtMs: ended ? now - 60_000 : now + 900_000,
        seedRadiusM: 25,
        teams: [
          { uid: 'u-panda', username: 'panda', areaM2: 14800 },
          { uid: 'u-faucon', username: 'faucon', areaM2: 11300 },
          { uid: 'u-requin', username: 'requin', areaM2: 8100 },
          { uid: 'u-leopard', username: 'leopard', areaM2: 4600 },
          { uid: 'u-bison', username: 'bison', areaM2: 1900 },
        ],
        territories: {
          'u-faucon': blob(-120, 60, 65),
          'u-panda': blob(90, 90, 72),
          'u-requin': blob(140, -80, 55),
          'u-leopard': blob(-60, -130, 42),
          'u-bison': blob(-200, -40, 26),
        },
        trails: ended
          ? {}
          : {
              'u-faucon': path(-70, 90, 60, 140),
              'u-requin': path(120, -40, 40, 30, 8),
            },
        tracks: ended
          ? { 'u-faucon': [...path(-120, 60, 100, 120, 30), ...path(100, 120, -60, -100, 30)] }
          : undefined,
        mockMeUid: 'u-faucon',
        mockPos: { lat: LAT + 0.0008, lng: LNG - 0.0006 },
      };
      break;
    }
    default:
      break; // hub: no challenge, just the Olympus board
  }

  return base;
}
