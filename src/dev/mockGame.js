// Dev-only mock game states: open the app with ?mock=<type> to preview any
// challenge UI without the serverless backend (vite dev has no /api runtime).
// Types: hub, steps, steps-veiled, trivia, bounty, photo, drawguess,
// drawguess-guess, riddle, guide, territory

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
    case 'territory': {
      const cols = 40;
      const rows = 40;
      const field = {
        centerLat: 33.8938,
        centerLng: 35.5018,
        cellSizeM: 12,
        cols,
        rows,
        latPerCell: 12 / 111320,
        lngPerCell: 12 / (111320 * Math.cos((33.8938 * Math.PI) / 180)),
        originLat: 33.8938 + (rows / 2) * (12 / 111320),
        originLng: 35.5018 - (cols / 2) * (12 / (111320 * Math.cos((33.8938 * Math.PI) / 180))),
      };
      const grid = Array(cols * rows).fill('.');
      const blob = (cx, cy, r, ch) => {
        for (let y = cy - r; y <= cy + r; y++) {
          for (let x = cx - r; x <= cx + r; x++) {
            if (x >= 0 && x < cols && y >= 0 && y < rows && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
              grid[y * cols + x] = ch;
            }
          }
        }
      };
      blob(10, 12, 6, '0');
      blob(28, 10, 5, '1');
      blob(20, 28, 7, '2');
      blob(32, 30, 4, '3');
      blob(8, 32, 3, '4');
      const trail = [];
      for (let i = 0; i < 10; i++) trail.push((12 + i) * cols + (16 + i));
      base.challenge = {
        ...common,
        type: 'territory',
        endAtMs: now + 900_000,
        field,
        grid: grid.join(''),
        trails: { 'u-faucon': trail },
        teams: [
          { uid: 'u-faucon', index: 0, username: 'faucon', cells: 113 },
          { uid: 'u-panda', index: 2, username: 'panda', cells: 149 },
          { uid: 'u-requin', index: 1, username: 'requin', cells: 81 },
          { uid: 'u-leopard', index: 3, username: 'leopard', cells: 49 },
          { uid: 'u-bison', index: 4, username: 'bison', cells: 29 },
        ],
        ownIndex: 0,
        mockPos: { lat: 33.8938, lng: 35.5018 },
      };
      break;
    }
    default:
      break; // hub: no challenge, just the Olympus board
  }

  return base;
}
