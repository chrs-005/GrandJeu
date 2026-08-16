import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchAdmin, adminAction } from '../services/api';
import { useNow, formatRemaining } from '../hooks/useNow';
import { teamInfo, challengeMeta, CHALLENGE_META } from '../config/gameConfig';
import { TRIVIA_PACKS } from '../data/triviaPacks';
import { DRAWING_PROMPTS, PHOTO_MISSIONS } from '../data/presets';
import { mpToLatLngPolygons, lngLatToLatLng, multiPolygonAreaM2, formatArea } from '../utils/geo';
import SatMap from '../components/SatMap';
import DefisAdmin from '../components/DefisAdmin';

const FALLBACK_CENTER = { lat: 33.8938, lng: 35.5018 };
function formatAge(updatedAt) {
  if (!updatedAt) return '?';
  const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function teamMarkers(locations) {
  return (locations || [])
    .filter((l) => l.role !== 'admin')
    .map((l) => {
      const info = teamInfo(l.username);
      return {
        id: l.uid,
        lat: l.latitude,
        lng: l.longitude,
        emblem: info.emblem,
        color: info.color,
        label: `${l.username} — il y a ${formatAge(l.updatedAt)}`,
      };
    });
}

function locationsCenter(locations) {
  const markers = teamMarkers(locations);
  if (!markers.length) return FALLBACK_CENTER;
  return {
    lat: markers.reduce((sum, m) => sum + m.lat, 0) / markers.length,
    lng: markers.reduce((sum, m) => sum + m.lng, 0) / markers.length,
  };
}

function safeParse(json, fallback) {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

// Vector overlays + area ranking from a raw admin territory challenge doc
// (geometries are stored as JSON strings in Firestore).
function adminTerritoryVectors(challenge) {
  const polygons = [];
  const lines = [];
  Object.entries(challenge.config.teamNames || {}).forEach(([uid, username]) => {
    const info = teamInfo(username);
    mpToLatLngPolygons(safeParse(challenge.territories?.[uid], [])).forEach((rings, i) => {
      polygons.push({ id: `${uid}-${i}`, rings, color: info.neon });
    });
    const trail = safeParse(challenge.trails?.[uid], []);
    if (trail.length > 1) {
      lines.push({ id: `trail-${uid}`, points: lngLatToLatLng(trail), color: info.neon, weight: 4, casing: true });
    }
  });
  return { polygons, lines };
}

function adminTerritoryAreas(challenge) {
  return Object.entries(challenge.config.teamNames || {})
    .map(([uid, username]) => ({
      uid,
      username,
      areaM2: multiPolygonAreaM2(safeParse(challenge.territories?.[uid], [])),
    }))
    .sort((a, b) => b.areaM2 - a.areaM2);
}

function triviaAnswerText(question, answer) {
  if (!answer) return '...';
  if ((question.type || 'choice') === 'choice') {
    return question.options?.[answer.choice] || `Choix ${answer.choice + 1}`;
  }
  if (question.type === 'list') return (answer.items || []).join(' / ');
  return answer.text || '...';
}

function triviaCorrectCount(entry) {
  return Object.values(entry.answers || {}).filter((answer) => answer.correct).length;
}

function triviaResponseTime(entry, questions) {
  return Object.entries(entry.answers || {}).reduce((sum, [index, answer]) => {
    const startedAt = questions?.[Number(index)]?.startAtMs || answer.atMs;
    return sum + Math.max(0, answer.atMs - startedAt);
  }, 0);
}

function currentTriviaQuestion(questions, now) {
  const activeIndex = questions.findIndex((q) => now >= q.startAtMs && now < q.endAtMs);
  if (activeIndex >= 0) return { index: activeIndex, question: questions[activeIndex], active: true };
  const nextIndex = questions.findIndex((q) => now < q.startAtMs);
  if (nextIndex >= 0) return { index: nextIndex, question: questions[nextIndex], active: false };
  return { index: questions.length - 1, question: questions[questions.length - 1], active: false };
}

// ---------------------------------------------------------------------------
// Launch forms
// ---------------------------------------------------------------------------
function LaunchForm({ type, onLaunch, busy, locations }) {
  const [stepDuration, setStepDuration] = useState(120);
  const [hideFinal, setHideFinal] = useState(45);
  const [packId, setPackId] = useState(TRIVIA_PACKS[0].id);
  const [questionCount, setQuestionCount] = useState(TRIVIA_PACKS[0].questions.length);
  const [bountyTarget, setBountyTarget] = useState('');
  const [bountyMinutes, setBountyMinutes] = useState(15);
  const [mission, setMission] = useState(PHOTO_MISSIONS[0]);
  const [missionMinutes, setMissionMinutes] = useState(10);
  const [drawMinutes, setDrawMinutes] = useState(3);
  const [guessMinutes, setGuessMinutes] = useState(2);
  const [guidePin, setGuidePin] = useState(null);
  const [guideCoords, setGuideCoords] = useState('');
  const [guideRadius, setGuideRadius] = useState(30);
  const [guideMinutes, setGuideMinutes] = useState(30);

  // Pin can come from a map tap or pasted "lat, lng" coordinates — keep both in sync.
  function pickGuidePin(latlng) {
    setGuidePin(latlng);
    setGuideCoords(`${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`);
  }

  function onGuideCoords(value) {
    setGuideCoords(value);
    const m = value.match(/(-?\d{1,2}(?:\.\d+)?)[,;\s]+(-?\d{1,3}(?:\.\d+)?)/);
    if (!m) return;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) setGuidePin({ lat, lng });
  }
  const [terrMinutes, setTerrMinutes] = useState(20);

  const mapCenter = useMemo(() => locationsCenter(locations), [locations]);

  function launch() {
    switch (type) {
      case 'steps':
        return onLaunch(type, {
          durationSeconds: Number(stepDuration),
          hideFinalSeconds: Number(hideFinal),
        });
      case 'trivia': {
        const pack = TRIVIA_PACKS.find((p) => p.id === packId) || TRIVIA_PACKS[0];
        return onLaunch(type, {
          questions: pack.questions.slice(0, Number(questionCount)),
          lobbySeconds: 10,
          revealSeconds: 6,
        });
      }
      case 'bounty':
        return onLaunch(type, {
          target: bountyTarget,
          durationSeconds: Number(bountyMinutes) * 60,
        });
      case 'photo':
        return onLaunch(type, {
          mission,
          durationSeconds: Number(missionMinutes) * 60,
        });
      case 'drawguess':
        return onLaunch(type, {
          drawSeconds: Number(drawMinutes) * 60,
          guessSeconds: Number(guessMinutes) * 60,
          prompts: DRAWING_PROMPTS,
        });
      case 'guide':
        return onLaunch(type, {
          lat: guidePin?.lat,
          lng: guidePin?.lng,
          radiusM: Number(guideRadius),
          durationSeconds: Number(guideMinutes) * 60,
        });
      case 'territory':
        return onLaunch(type, {
          durationSeconds: Number(terrMinutes) * 60,
        });
      default:
        return null;
    }
  }

  const missingPin = type === 'guide' && !guidePin;

  return (
    <div className="launch-form">
      {type === 'steps' && (
        <div className="form-grid">
          <label>
            Durée (secondes)
            <input min="30" max="1800" onChange={(e) => setStepDuration(e.target.value)} type="number" value={stepDuration} />
          </label>
          <label>
            Classement voilé sur les dernières (secondes)
            <input min="0" max="600" onChange={(e) => setHideFinal(e.target.value)} type="number" value={hideFinal} />
          </label>
        </div>
      )}

      {type === 'trivia' && (
        <div className="form-grid">
          <label>
            Pack de questions
            <select
              onChange={(e) => {
                const nextPack = TRIVIA_PACKS.find((pack) => pack.id === e.target.value) || TRIVIA_PACKS[0];
                setPackId(nextPack.id);
                setQuestionCount(nextPack.questions.length);
              }}
              value={packId}
            >
              {TRIVIA_PACKS.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.name} ({pack.questions.length} questions)
                </option>
              ))}
            </select>
          </label>
          <label>
            Nombre de questions
            <input min="1" max="20" onChange={(e) => setQuestionCount(e.target.value)} type="number" value={questionCount} />
          </label>
          <p className="form-hint">Classement final selon les bonnes réponses, puis la rapidité.</p>
        </div>
      )}

      {type === 'bounty' && (
        <div className="form-grid">
          <label>
            La cible de Méduse (nom du scout)
            <input maxLength={120} onChange={(e) => setBountyTarget(e.target.value)} placeholder="ex: Marc, l’animateur au foulard rouge" type="text" value={bountyTarget} />
          </label>
          <label>
            Durée (minutes)
            <input min="1" max="240" onChange={(e) => setBountyMinutes(e.target.value)} type="number" value={bountyMinutes} />
          </label>
        </div>
      )}

      {type === 'photo' && (
        <div className="form-grid">
          <label>
            Mission
            <select onChange={(e) => setMission(e.target.value)} value={mission}>
              {PHOTO_MISSIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Ou mission personnalisée
            <input maxLength={300} onChange={(e) => setMission(e.target.value)} type="text" value={mission} />
          </label>
          <label>
            Durée (minutes)
            <input min="1" max="240" onChange={(e) => setMissionMinutes(e.target.value)} type="number" value={missionMinutes} />
          </label>
        </div>
      )}

      {type === 'drawguess' && (
        <div className="form-grid">
          <label>
            Temps de dessin (minutes)
            <input min="1" max="20" onChange={(e) => setDrawMinutes(e.target.value)} type="number" value={drawMinutes} />
          </label>
          <label>
            Temps pour deviner (minutes)
            <input min="1" max="20" onChange={(e) => setGuessMinutes(e.target.value)} type="number" value={guessMinutes} />
          </label>
          <p className="form-hint">
            Chaque équipe reçoit un sujet au hasard, puis devine le dessin d’une autre équipe.
          </p>
        </div>
      )}

      {type === 'guide' && (
        <div className="form-grid">
          <p className="form-hint">
            📍 Touchez la carte pour placer la destination secrète, ou collez des coordonnées.
            Les équipes verront une flèche et la distance — jamais la carte.
          </p>
          <SatMap
            center={mapCenter}
            fit="markers"
            height={300}
            markers={teamMarkers(locations)}
            onPick={pickGuidePin}
            pin={guidePin}
            pinRadiusM={Number(guideRadius)}
            zoom={16}
          />
          <label>
            Coordonnées (lat, lng)
            <input
              onChange={(e) => onGuideCoords(e.target.value)}
              placeholder="33.893800, 35.501800"
              type="text"
              value={guideCoords}
            />
          </label>
          <label>
            Rayon d’arrivée (mètres)
            <input min="10" max="500" onChange={(e) => setGuideRadius(e.target.value)} type="number" value={guideRadius} />
          </label>
          <label>
            Durée (minutes)
            <input min="1" max="240" onChange={(e) => setGuideMinutes(e.target.value)} type="number" value={guideMinutes} />
          </label>
        </div>
      )}

      {type === 'territory' && (
        <div className="form-grid">
          <p className="form-hint">
            ⚔️ Pas de terrain à définir : toute la ville est le champ de bataille. Chaque équipe
            démarre son empire là où elle se trouve, trace son sillage en marchant et capture les
            zones qu’elle encercle — y compris celles des autres.
          </p>
          <label>
            Durée (minutes)
            <input min="1" max="240" onChange={(e) => setTerrMinutes(e.target.value)} type="number" value={terrMinutes} />
          </label>
        </div>
      )}

      <button className="btn btn-primary" disabled={busy || missingPin} onClick={launch} type="button">
        {missingPin
          ? '📍 Placez d’abord le point sur la carte'
          : busy
            ? 'Lancement…'
            : `${challengeMeta(type).icon} Lancer ${challengeMeta(type).title}`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live board of the running/last challenge
// ---------------------------------------------------------------------------
function ReviewButtons({ onReview, status }) {
  return (
    <div className="review-buttons">
      <button className={`btn btn-sm ${status === 'valid' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onReview('valid')} type="button">
        ✓ Accepter
      </button>
      <button className="btn btn-sm btn-danger" onClick={() => onReview('rejected')} type="button">
        ✗
      </button>
    </div>
  );
}

function ChallengeBoard({ challenge, media, now, onAction, busy, locations, teams = [] }) {
  const meta = challengeMeta(challenge.type);
  const board = challenge.board || {};
  const entries = Object.entries(board).map(([uid, entry]) => ({ uid, ...entry }));
  const running = challenge.status === 'active' && now < challenge.endAtMs;
  const triviaQuestions = challenge.type === 'trivia' ? challenge.config.questions || [] : [];
  const triviaCurrent = challenge.type === 'trivia' ? currentTriviaQuestion(triviaQuestions, now) : null;
  const triviaActiveAnswered = triviaCurrent?.question
    ? entries.filter((entry) => entry.answers?.[triviaCurrent.index]).length
    : 0;
  const manualTriviaQuestions = triviaQuestions
    .map((question, index) => ({ ...question, index }))
    .filter((question) => question.manual);

  function review(uid, status) {
    onAction('review', { challengeId: challenge.id, uid, status });
  }

  function reviewTrivia(uid, questionIndex, status) {
    onAction('trivia-review', { challengeId: challenge.id, uid, questionIndex, status });
  }

  return (
    <div className="challenge-board">
      <div className="challenge-board-head">
        <div>
          <strong>{meta.icon} {meta.title}</strong>
          <span className={`badge ${running ? 'badge-success' : 'badge-neutral'}`}>
            {running ? `En cours — ${formatRemaining(challenge.endAtMs - now)}` : 'Terminé'}
          </span>
        </div>
        <div className="btn-group">
          {running && (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction('end', { challengeId: challenge.id })} type="button">
              🏁 Terminer maintenant
            </button>
          )}
          {running && challenge.type === 'trivia' && triviaCurrent?.active && (
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => onAction('trivia-skip', { challengeId: challenge.id, questionIndex: triviaCurrent.index })}
              type="button"
            >
              Passer la question
            </button>
          )}
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onAction('clear')} type="button">
            Retirer de l’écran des équipes
          </button>
        </div>
      </div>

      {/* Steps */}
      {challenge.type === 'steps' && (
        <ol className="mini-board">
          {entries
            .sort((a, b) => (b.steps || 0) - (a.steps || 0))
            .map((entry, index) => (
              <li key={entry.uid}>
                <span>{index + 1}. {teamInfo(entry.username).emblem} {entry.username}</span>
                <strong>{entry.steps || 0} pas</strong>
              </li>
            ))}
          {!entries.length && <li><span>Aucun pas compté pour l’instant.</span></li>}
        </ol>
      )}

      {/* Trivia */}
      {challenge.type === 'trivia' && (
        <div className="trivia-admin">
          {triviaCurrent?.question && (
            <div className="trivia-admin-current">
              <span className="badge badge-neutral">
                {triviaCurrent.active ? 'Question active' : 'Prochaine question'}
              </span>
              <strong>
                Q{triviaCurrent.index + 1}/{triviaQuestions.length}: {triviaCurrent.question.q}
              </strong>
              <span>
                {triviaActiveAnswered}/{teams.length || entries.length || 0} réponses reçues
              </span>
            </div>
          )}

          <ol className="mini-board">
            {entries
              .sort((a, b) =>
                triviaCorrectCount(b) - triviaCorrectCount(a) ||
                triviaResponseTime(a, triviaQuestions) - triviaResponseTime(b, triviaQuestions)
              )
              .map((entry, index) => (
                <li key={entry.uid}>
                  <span>{index + 1}. {teamInfo(entry.username).emblem} {entry.username}</span>
                  <strong>{triviaCorrectCount(entry)} validées</strong>
                </li>
              ))}
            {!entries.length && <li><span>Aucune réponse pour l’instant.</span></li>}
          </ol>

          {triviaQuestions.map((question, index) => (
            <div className="trivia-question-count" key={`${question.q}-${index}`}>
              <span>Q{index + 1}</span>
              <strong>{entries.filter((entry) => entry.answers?.[index]).length} réponses</strong>
            </div>
          ))}

          {manualTriviaQuestions.length > 0 && (
            <div className="manual-review-list">
              {manualTriviaQuestions.map((question) => {
                const responses = entries
                  .filter((entry) => entry.answers?.[question.index])
                  .sort((a, b) => (a.answers[question.index].atMs || 0) - (b.answers[question.index].atMs || 0));
                return (
                  <section className="manual-review-question" key={`${question.index}-${question.q}`}>
                    <h4>Q{question.index + 1}. {question.q}</h4>
                    {responses.map((entry) => {
                      const answer = entry.answers[question.index];
                      return (
                        <article className="manual-review-answer" key={`${question.index}-${entry.uid}`}>
                          <div>
                            <strong>{teamInfo(entry.username).emblem} {entry.username}</strong>
                            <p>{triviaAnswerText(question, answer)}</p>
                            <span className={`badge ${answer.status === 'valid' ? 'badge-success' : answer.status === 'rejected' ? 'badge-error' : 'badge-neutral'}`}>
                              {answer.status === 'valid' ? 'Accepté' : answer.status === 'rejected' ? 'Refusé' : 'À juger'}
                            </span>
                          </div>
                          <ReviewButtons
                            onReview={(status) => reviewTrivia(entry.uid, question.index, status)}
                            status={answer.status}
                          />
                        </article>
                      );
                    })}
                    {!responses.length && <p className="form-hint">Aucune réponse pour cette question.</p>}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Photos & bounty */}
      {['bounty', 'photo'].includes(challenge.type) && (
        <div className="submission-grid">
          {entries
            .filter((entry) => entry.submittedAtMs)
            .sort((a, b) => a.submittedAtMs - b.submittedAtMs)
            .map((entry) => (
              <article className="submission-card" key={entry.uid}>
                {media?.[entry.uid] ? (
                  <img alt={`Photo de ${entry.username}`} src={media[entry.uid]} />
                ) : (
                  <div className="submission-placeholder">📷 (active « charger les images »)</div>
                )}
                <div className="submission-meta">
                  <strong>{teamInfo(entry.username).emblem} {entry.username}</strong>
                  <span>{new Date(entry.submittedAtMs).toLocaleTimeString()}</span>
                  <span className={`badge ${entry.status === 'valid' ? 'badge-success' : entry.status === 'rejected' ? 'badge-error' : 'badge-neutral'}`}>
                    {entry.status === 'valid' ? 'Accepté' : entry.status === 'rejected' ? 'Refusé' : 'À juger'}
                  </span>
                </div>
                <ReviewButtons onReview={(status) => review(entry.uid, status)} status={entry.status} />
              </article>
            ))}
          {!entries.some((entry) => entry.submittedAtMs) && <p className="form-hint">Aucune photo reçue pour l’instant.</p>}
        </div>
      )}

      {/* Draw & guess */}
      {challenge.type === 'drawguess' && (
        <div className="submission-grid">
          {Object.entries(challenge.config.assignments || {}).map(([artistUid, assignment]) => {
            // The guesser of this artist's drawing:
            const guesserEntry = Object.entries(challenge.config.assignments).find(
              ([, a]) => a.sourceUid === artistUid
            );
            const guesserUid = guesserEntry?.[0];
            const guesser = guesserUid ? board[guesserUid] : null;
            return (
              <article className="submission-card" key={artistUid}>
                {media?.[artistUid] ? (
                  <img alt={`Dessin de ${assignment.username}`} src={media[artistUid]} />
                ) : (
                  <div className="submission-placeholder">🎨 pas encore de dessin</div>
                )}
                <div className="submission-meta">
                  <strong>{teamInfo(assignment.username).emblem} {assignment.username}</strong>
                  <span>Sujet : {assignment.prompt}</span>
                  <span>
                    Devine : {guesserEntry?.[1]?.username || '?'} → « {guesser?.guess || '…'} »
                  </span>
                </div>
                {guesserUid && guesser?.guess && (
                  <ReviewButtons
                    onReview={(status) => review(guesserUid, status)}
                    status={guesser.guessStatus}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Guide (compass hunt) */}
      {challenge.type === 'guide' && (
        <>
          <SatMap
            center={{ lat: challenge.config.lat, lng: challenge.config.lng }}
            height={320}
            markers={teamMarkers(locations)}
            pin={{ lat: challenge.config.lat, lng: challenge.config.lng }}
            pinRadiusM={challenge.config.radiusM}
            zoom={16}
          />
          <ol className="mini-board">
            {entries
              .filter((entry) => entry.arrivedAtMs)
              .sort((a, b) => a.arrivedAtMs - b.arrivedAtMs)
              .map((entry) => (
                <li key={entry.uid}>
                  <span>
                    {entry.rank}. {teamInfo(entry.username).emblem} {entry.username} —{' '}
                    {new Date(entry.arrivedAtMs).toLocaleTimeString()}
                  </span>
                  <strong>{entry.rank}{entry.rank === 1 ? 're' : 'e'} arrivée</strong>
                </li>
              ))}
            {!entries.some((entry) => entry.arrivedAtMs) && (
              <li><span>Aucune équipe arrivée pour l’instant.</span></li>
            )}
          </ol>
        </>
      )}

      {/* Territory */}
      {challenge.type === 'territory' && (
        <>
          <SatMap
            basemap="dark"
            fit="vectors"
            height={380}
            markers={teamMarkers(locations)}
            vectors={adminTerritoryVectors(challenge)}
            zoom={16}
          />
          <ol className="mini-board">
            {adminTerritoryAreas(challenge).map((entry, index) => (
              <li key={entry.uid}>
                <span>{index + 1}. {teamInfo(entry.username).emblem} {entry.username}</span>
                <strong>{formatArea(entry.areaM2)}</strong>
              </li>
            ))}
          </ol>
        </>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Le Fil d'Ariane — read-only live route monitoring
// ---------------------------------------------------------------------------
const ARIANNE_COLORS = ['#e03d20', '#2c78a8', '#4f8c52', '#b46a17', '#8f5aa8', '#167f7a'];

function arianneDeviceLabel(username, index) {
  const deviceId = String(username || '').match(/^arianne-([a-f0-9]{6})/i)?.[1];
  return deviceId ? `Ariane ${deviceId.toUpperCase()}` : username || `Ariane ${index + 1}`;
}

function ParcoursAdmin({ parcours }) {
  const sessions = (parcours?.teams || []).filter((team) => team.track?.length);
  const markers = sessions.map((team, index) => {
    const point = team.track[team.track.length - 1];
    return {
      id: team.uid,
      lat: point[1],
      lng: point[0],
      emblem: '🧵',
      color: ARIANNE_COLORS[index % ARIANNE_COLORS.length],
      label: arianneDeviceLabel(team.username, index),
      big: true,
      pulse: Date.now() - team.lastSeenAtMs < 30_000,
    };
  });
  const lines = sessions.flatMap((team, index) => {
    const color = ARIANNE_COLORS[index % ARIANNE_COLORS.length];
    return [
      team.route?.length > 1
        ? { id: `expected-${team.uid}`, points: lngLatToLatLng(team.route), color, weight: 3, dashed: true, opacity: 0.55 }
        : null,
      team.track?.length > 1
        ? { id: `walked-${team.uid}`, points: lngLatToLatLng(team.track), color, weight: 5, casing: true }
        : null,
    ].filter(Boolean);
  });
  const center = markers.length
    ? {
        lat: markers.reduce((sum, marker) => sum + marker.lat, 0) / markers.length,
        lng: markers.reduce((sum, marker) => sum + marker.lng, 0) / markers.length,
      }
    : FALLBACK_CENTER;

  return (
    <div className="parcours-admin">
      {sessions.length ? (
        <>
          <SatMap
            center={center}
            fit={lines.length ? 'vectors' : 'markers'}
            height={380}
            markers={markers}
            vectors={lines.length ? { lines } : null}
            zoom={16}
          />
          <div className="arianne-session-list">
            {sessions.map((team, index) => (
              <div className="arianne-session" key={team.uid}>
                <span className="route-swatch" style={{ background: ARIANNE_COLORS[index % ARIANNE_COLORS.length] }} />
                <strong>{arianneDeviceLabel(team.username, index)}</strong>
                <span>vu il y a {formatAge(team.lastSeenAtMs)}</span>
              </div>
            ))}
          </div>
          <p className="form-hint">Trait plein : chemin parcouru. Pointillés : chemin à suivre.</p>
        </>
      ) : (
        <p className="form-hint">Aucun appareil n’a encore ouvert Le Fil d’Ariane.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NFC hunt monitor
// ---------------------------------------------------------------------------
function NfcAdmin({ busy, nfc, onAction }) {
  if (!nfc) return <p className="form-hint">Chargement des scans NFC...</p>;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="nfc-admin">
      <div className="btn-group">
        <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => onAction('nfc-reset', {}, 'Scans NFC remis a zero.')} type="button">
          Reset NFC
        </button>
      </div>

      <p className="form-hint">
        Point final: {nfc.finalUrl.includes('example.com') ? 'Lien a remplir dans NFC_FINAL_URL' : nfc.finalUrl}
      </p>

      <div className="nfc-tag-grid">
        {nfc.tags.map((tag) => (
          <div className="nfc-tag-card" key={tag.id}>
            <strong>{tag.label}</strong>
            <code>{`${origin}/nfc/${tag.id}`}</code>
            <span>{tag.destinationUrl.includes('example.com') ? 'Lien a remplir' : tag.destinationUrl}</span>
          </div>
        ))}
      </div>

      <div className="nfc-team-list">
        {nfc.teams.map((team) => {
          const info = teamInfo(team.username);
          return (
            <article className="nfc-team-row" key={team.teamKey}>
              <div className="nfc-team-head">
                <strong>{info.emblem} {team.username}</strong>
                <span className={`badge ${team.foundCount >= nfc.requiredTagCount ? 'badge-success' : 'badge-neutral'}`}>
                  {team.foundCount}/{nfc.requiredTagCount}
                </span>
              </div>
              <div className="nfc-tag-dots">
                {nfc.tags.map((tag) => {
                  const scan = team.scans?.[tag.id];
                  return (
                    <span className={`nfc-tag-dot ${scan ? 'is-scanned' : ''}`} key={tag.id} title={scan ? `${tag.label} - ${scan.count} scan(s)` : tag.label}>
                      {tag.id}
                    </span>
                  );
                })}
              </div>
              <small>
                {team.lastScanAtMs ? `Dernier scan: tag ${team.lastTagId}, il y a ${formatAge(team.lastScanAtMs)}` : 'Aucun scan'}
              </small>
            </article>
          );
        })}
      </div>

      <div className="nfc-events">
        <h4>Derniers scans</h4>
        <ol className="mini-board">
          {nfc.recentEvents.map((event) => (
            <li key={event.id}>
              <span>
                {teamInfo(event.username).emblem} {event.username} - {event.tagLabel || `Tag ${event.tagId}`}
              </span>
              <strong>{event.destinationType === 'final' ? 'Final' : formatAge(event.createdAtMs)}</strong>
            </li>
          ))}
          {!nfc.recentEvents.length && <li><span>Aucun scan NFC pour l'instant.</span></li>}
        </ol>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main admin page
// ---------------------------------------------------------------------------
export default function Admin() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [launchType, setLaunchType] = useState('steps');
  const [withImages, setWithImages] = useState(true);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  // Hidden owl location.
  const offsetRef = useRef(0);
  const withImagesRef = useRef(withImages);
  withImagesRef.current = withImages;

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);
  const now = useNow(serverNow, 1000);

  const load = useCallback(async () => {
    if (!currentUser) return;
    try {
      const result = await fetchAdmin(currentUser, { images: withImagesRef.current });
      offsetRef.current = result.serverNow - Date.now();
      setData(result);
      setError('');
    } catch (err) {
      setError(err.message || 'Erreur de chargement.');
    }
  }, [currentUser]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 6000);
    return () => clearInterval(interval);
  }, [load]);

  async function runAction(action, payload = {}, successMessage = '') {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const result = await adminAction(currentUser, action, payload);
      if (successMessage) setStatus(successMessage);
      await load();
      return result;
    } catch (err) {
      setError(err.message || 'Action impossible.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function launchChallenge(type, config) {
    const result = await runAction('start', { type, config });
    if (result) {
      setStatus(
        `${challengeMeta(type).title} lancé ! Push envoyé à ${result.push?.sent ?? 0}/${result.push?.found ?? 0} appareils.`
      );
    }
  }

  async function sendNotification(target) {
    const result = await runAction('notify', { title: notifTitle, body: notifBody, target });
    if (result) setStatus(`Notification envoyée à ${result.sent}/${result.found} appareils.`);
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const challenge = data?.challenge;
  const showChallenge = challenge && data?.currentChallengeId === challenge.id;

  return (
    <div className="app-page admin-page">
      <header className="app-header">
        <div>
          <h1 className="logo-title">⚡ Console des Dieux</h1>
          <span className="badge badge-admin">Admin</span>
        </div>
        <div className="btn-group">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/app')} type="button">
            Vue équipe
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} type="button">
            Sortir
          </button>
        </div>
      </header>

      {status && <div className="alert alert-success">{status}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <main className="app-main admin-main">
        {/* Current challenge */}
        <section className="admin-section">
          <h3 className="section-title">Défi en cours</h3>
          {showChallenge ? (
            <>
              <label className="toggle-images">
                <input checked={withImages} onChange={(e) => setWithImages(e.target.checked)} type="checkbox" />
                Charger les images (photos/dessins)
              </label>
              <ChallengeBoard
                busy={busy}
                challenge={challenge}
                locations={data?.locations || []}
                media={data.media}
                now={now}
                onAction={runAction}
                teams={data?.teams || []}
              />
            </>
          ) : (
            <p className="form-hint">Aucun défi affiché chez les équipes. Lancez-en un ci-dessous !</p>
          )}
        </section>

        {/* Secret de la chouette */}
        <section className="admin-section">
          <h3 className="section-title">
            🦉 Secret de la chouette {data?.secret?.active ? '(armé)' : '(inactif)'}
          </h3>
          <p className="form-hint">
            Caché sur l’accueil : 5 tapes sur la chouette d’Athéna et elle s’envole chercher un
            parchemin avec une position Google Maps.
          </p>
          <p className="secret-location-admin">
            33.8568304, 35.7256696
          </p>
          <div className="btn-group">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => runAction('secret-setup', { active: true }, 'Secret armé !')}
              type="button"
            >
              🦉 Armer le secret
            </button>
            {data?.secret?.active && (
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => runAction('secret-setup', { active: false }, 'Secret désactivé.')} type="button">
                Désactiver
              </button>
            )}
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => runAction('secret-reset', {}, 'Découvertes remises à zéro.')} type="button">
              ♻️ Réinitialiser
            </button>
          </div>
          {data?.secret?.finders?.length > 0 && (
            <ol className="mini-board">
              {data.secret.finders.map((f) => (
                <li key={f.uid}>
                  <span>{teamInfo(f.username).emblem} {f.username}</span>
                  <strong>👀 a trouvé la chouette</strong>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Les Défis */}
        <section className="admin-section">
          <h3 className="section-title">📜 Les Défis</h3>
          <DefisAdmin busy={busy} now={now} onAction={runAction} user={currentUser} />
        </section>

        {/* NFC Easter egg hunt */}
        <section className="admin-section">
          <h3 className="section-title">NFC Easter eggs</h3>
          <NfcAdmin busy={busy} nfc={data?.nfc} onAction={runAction} />
        </section>

        {/* Le Fil d'Ariane */}
        <section className="admin-section">
          <h3 className="section-title">🧵 Le Fil d’Ariane</h3>
          <ParcoursAdmin parcours={data?.parcours} />
        </section>

        {/* Launch */}
        <section className="admin-section">
          <h3 className="section-title">Lancer un défi</h3>
          <div className="type-tabs">
            {/* 'guide' → the parcours above; 'photo' (Héraclès) → Les Défis page. */}
            {Object.entries(CHALLENGE_META)
              .filter(([type]) => type !== 'guide' && type !== 'photo')
              .map(([type, meta]) => (
                <button
                  className={`type-tab ${launchType === type ? 'is-active' : ''}`}
                  key={type}
                  onClick={() => setLaunchType(type)}
                  type="button"
                >
                  {meta.icon} {meta.title.replace(/^(La |Le |Les |L’)/, '')}
                </button>
              ))}
          </div>
          <p className="form-hint">{challengeMeta(launchType).tagline}</p>
          <LaunchForm busy={busy} locations={data?.locations || []} onLaunch={launchChallenge} type={launchType} />
        </section>

        {/* Map */}
        <section className="admin-section">
          <h3 className="section-title">Carte des équipes</h3>
          <SatMap
            fit="markers"
            height={340}
            markers={teamMarkers(data?.locations || [])}
            zoom={16}
          />
          <div className="location-list">
            {(data?.locations || []).map((location) => {
              const info = teamInfo(location.username);
              return (
                <div className="location-list-row" key={location.uid}>
                  <strong>{info.emblem} {location.username}</strong>
                  <span className="location-age">il y a {formatAge(location.updatedAt)}</span>
                  <a
                    className="btn btn-sm btn-secondary"
                    href={`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    📍 Maps
                  </a>
                </div>
              );
            })}
            {!data?.locations?.length && (
              <p className="form-hint">Aucune position partagée pour l’instant.</p>
            )}
          </div>
        </section>

        {/* Notifications */}
        <section className="admin-section">
          <h3 className="section-title">Message des dieux (notification)</h3>
          <div className="form-grid">
            <label>
              Titre
              <input maxLength={120} onChange={(e) => setNotifTitle(e.target.value)} placeholder="⚡ Zeus gronde…" type="text" value={notifTitle} />
            </label>
            <label>
              Message
              <textarea maxLength={500} onChange={(e) => setNotifBody(e.target.value)} placeholder="Rendez-vous à la fontaine dans 10 minutes !" rows={2} value={notifBody} />
            </label>
          </div>
          <div className="btn-group">
            <button className="btn btn-primary" disabled={busy || !notifTitle.trim() || !notifBody.trim()} onClick={() => sendNotification('all')} type="button">
              Envoyer à tous
            </button>
            <button className="btn btn-secondary" disabled={busy || !notifTitle.trim() || !notifBody.trim()} onClick={() => sendNotification('self')} type="button">
              Test sur moi
            </button>
          </div>
        </section>

      </main>
    </div>
  );
}
