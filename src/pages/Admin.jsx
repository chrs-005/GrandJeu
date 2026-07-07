import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchAdmin, adminAction } from '../services/api';
import { useNow, formatRemaining } from '../hooks/useNow';
import { teamInfo, challengeMeta, CHALLENGE_META, RANK_POINTS } from '../config/gameConfig';
import { TRIVIA_PACKS } from '../data/triviaPacks';
import { DRAWING_PROMPTS, PHOTO_MISSIONS, RIDDLE_PRESETS } from '../data/presets';
import { previewField, fieldBounds } from '../utils/geo';
import SatMap from '../components/SatMap';

const QUICK_POINTS = [100, 70, 50, 30];
const RANKED_TYPES = ['steps', 'territory'];
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

// Build the SatMap territory prop from a raw admin challenge doc.
function adminTerritory(challenge) {
  const { field, teamIndex, teamNames } = challenge.config;
  const colors = [];
  Object.entries(teamIndex || {}).forEach(([uid, idx]) => {
    colors[idx] = teamInfo(teamNames?.[uid]).color;
  });
  const trails = {};
  Object.entries(challenge.trails || {}).forEach(([uid, cells]) => {
    trails[uid] = { cells, color: colors[teamIndex?.[uid]] || '#fff' };
  });
  return { field, grid: challenge.grid || '', trails, colors };
}

function territoryCounts(challenge) {
  const { teamIndex, teamNames } = challenge.config;
  const grid = challenge.grid || '';
  const counts = {};
  for (let i = 0; i < grid.length; i++) {
    const c = grid[i];
    if (c !== '.') counts[c] = (counts[c] || 0) + 1;
  }
  return Object.entries(teamIndex || {})
    .map(([uid, idx]) => ({ uid, username: teamNames?.[uid] || uid, cells: counts[String(idx)] || 0 }))
    .sort((a, b) => b.cells - a.cells);
}

// ---------------------------------------------------------------------------
// Launch forms
// ---------------------------------------------------------------------------
function LaunchForm({ type, onLaunch, busy, locations }) {
  const [stepDuration, setStepDuration] = useState(120);
  const [hideFinal, setHideFinal] = useState(45);
  const [packId, setPackId] = useState(TRIVIA_PACKS[0].id);
  const [questionCount, setQuestionCount] = useState(8);
  const [bountyTarget, setBountyTarget] = useState('');
  const [bountyMinutes, setBountyMinutes] = useState(15);
  const [mission, setMission] = useState(PHOTO_MISSIONS[0]);
  const [missionMinutes, setMissionMinutes] = useState(10);
  const [drawMinutes, setDrawMinutes] = useState(3);
  const [guessMinutes, setGuessMinutes] = useState(2);
  const [riddlePreset, setRiddlePreset] = useState(0);
  const [riddleText, setRiddleText] = useState(RIDDLE_PRESETS[0].text);
  const [riddleAnswers, setRiddleAnswers] = useState(RIDDLE_PRESETS[0].answers.join(', '));
  const [riddlePoints, setRiddlePoints] = useState(100);
  const [riddleMinutes, setRiddleMinutes] = useState(10);
  const [guidePin, setGuidePin] = useState(null);
  const [guideRadius, setGuideRadius] = useState(30);
  const [guideMinutes, setGuideMinutes] = useState(30);
  const [terrCenter, setTerrCenter] = useState(null);
  const [terrCell, setTerrCell] = useState(12);
  const [terrSize, setTerrSize] = useState(40);
  const [terrMinutes, setTerrMinutes] = useState(20);

  const mapCenter = useMemo(() => locationsCenter(locations), [locations]);

  function launch() {
    switch (type) {
      case 'steps':
        return onLaunch(type, {
          durationSeconds: Number(stepDuration),
          hideFinalSeconds: Number(hideFinal),
          rankPoints: RANK_POINTS,
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
      case 'riddle':
        return onLaunch(type, {
          text: riddleText,
          answers: riddleAnswers.split(',').map((a) => a.trim()).filter(Boolean),
          points: Number(riddlePoints),
          firstBonus: 50,
          durationSeconds: Number(riddleMinutes) * 60,
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
          centerLat: terrCenter?.lat,
          centerLng: terrCenter?.lng,
          cellSizeM: Number(terrCell),
          size: Number(terrSize),
          durationSeconds: Number(terrMinutes) * 60,
        });
      default:
        return null;
    }
  }

  const missingPin = (type === 'guide' && !guidePin) || (type === 'territory' && !terrCenter);

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
          <p className="form-hint">Points au classement : {RANK_POINTS.join(' / ')}</p>
        </div>
      )}

      {type === 'trivia' && (
        <div className="form-grid">
          <label>
            Pack de questions
            <select onChange={(e) => setPackId(e.target.value)} value={packId}>
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
          <p className="form-hint">Points selon la rapidité (style Kahoot). Révélation entre chaque question.</p>
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

      {type === 'riddle' && (
        <div className="form-grid">
          <label>
            Préréglage
            <select
              onChange={(e) => {
                const idx = Number(e.target.value);
                setRiddlePreset(idx);
                if (idx >= 0) {
                  setRiddleText(RIDDLE_PRESETS[idx].text);
                  setRiddleAnswers(RIDDLE_PRESETS[idx].answers.join(', '));
                }
              }}
              value={riddlePreset}
            >
              {RIDDLE_PRESETS.map((preset, idx) => (
                <option key={preset.label} value={idx}>{preset.label}</option>
              ))}
              <option value={-1}>— Énigme personnalisée —</option>
            </select>
          </label>
          <label>
            Énigme
            <textarea maxLength={1000} onChange={(e) => setRiddleText(e.target.value)} rows={3} value={riddleText} />
          </label>
          <label>
            Réponses acceptées (séparées par des virgules)
            <input onChange={(e) => setRiddleAnswers(e.target.value)} type="text" value={riddleAnswers} />
          </label>
          <label>
            Points
            <input min="0" max="1000" onChange={(e) => setRiddlePoints(e.target.value)} type="number" value={riddlePoints} />
          </label>
          <label>
            Durée (minutes)
            <input min="1" max="240" onChange={(e) => setRiddleMinutes(e.target.value)} type="number" value={riddleMinutes} />
          </label>
          <p className="form-hint">+50 pts bonus pour la première équipe qui résout. Idéal pour les énigmes de lieux !</p>
        </div>
      )}

      {type === 'guide' && (
        <div className="form-grid">
          <p className="form-hint">
            📍 Touchez la carte pour placer la destination secrète. Les équipes verront une flèche
            et la distance « chaud/froid » — jamais la carte.
          </p>
          <SatMap
            center={mapCenter}
            fit="markers"
            height={300}
            markers={teamMarkers(locations)}
            onPick={setGuidePin}
            pin={guidePin}
            pinRadiusM={Number(guideRadius)}
            zoom={16}
          />
          <label>
            Rayon d’arrivée (mètres)
            <input min="10" max="500" onChange={(e) => setGuideRadius(e.target.value)} type="number" value={guideRadius} />
          </label>
          <label>
            Durée (minutes)
            <input min="1" max="240" onChange={(e) => setGuideMinutes(e.target.value)} type="number" value={guideMinutes} />
          </label>
          <p className="form-hint">Points à l’arrivée : {RANK_POINTS.join(' / ')} (ordre d’arrivée).</p>
        </div>
      )}

      {type === 'territory' && (
        <div className="form-grid">
          <p className="form-hint">
            ⚔️ Touchez la carte pour centrer le champ de bataille. Chaque équipe peint le terrain
            en marchant et capture les zones qu’elle encercle.
          </p>
          <SatMap
            center={mapCenter}
            fit="markers"
            height={300}
            markers={teamMarkers(locations)}
            onPick={setTerrCenter}
            rectBounds={
              terrCenter
                ? fieldBounds(previewField(terrCenter.lat, terrCenter.lng, Number(terrCell), Number(terrSize), Number(terrSize)))
                : null
            }
            zoom={16}
          />
          <label>
            Taille d’une case (mètres)
            <select onChange={(e) => setTerrCell(e.target.value)} value={terrCell}>
              <option value={8}>8 m — précis, petit terrain</option>
              <option value={12}>12 m — équilibré</option>
              <option value={16}>16 m — grand terrain</option>
              <option value={20}>20 m — très grand</option>
            </select>
          </label>
          <label>
            Grille (cases par côté)
            <select onChange={(e) => setTerrSize(e.target.value)} value={terrSize}>
              <option value={30}>30 × 30 (≈ {30 * Number(terrCell)} m de côté)</option>
              <option value={40}>40 × 40 (≈ {40 * Number(terrCell)} m de côté)</option>
              <option value={60}>60 × 60 (≈ {60 * Number(terrCell)} m de côté)</option>
            </select>
          </label>
          <label>
            Durée (minutes)
            <input min="1" max="240" onChange={(e) => setTerrMinutes(e.target.value)} type="number" value={terrMinutes} />
          </label>
          <p className="form-hint">Points au classement final : {RANK_POINTS.join(' / ')}.</p>
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
function ReviewButtons({ onAward, entryPoints }) {
  return (
    <div className="review-buttons">
      {QUICK_POINTS.map((points) => (
        <button
          className={`btn btn-sm ${entryPoints === points ? 'btn-primary' : 'btn-secondary'}`}
          key={points}
          onClick={() => onAward(points)}
          type="button"
        >
          +{points}
        </button>
      ))}
      <button className="btn btn-sm btn-danger" onClick={() => onAward(0)} type="button">
        ✗
      </button>
    </div>
  );
}

function ChallengeBoard({ challenge, media, now, onAction, busy, locations }) {
  const meta = challengeMeta(challenge.type);
  const board = challenge.board || {};
  const entries = Object.entries(board).map(([uid, entry]) => ({ uid, ...entry }));
  const running = challenge.status === 'active' && now < challenge.endAtMs;

  function award(uid, points) {
    onAction('review', { challengeId: challenge.id, uid, points });
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
          {running && RANKED_TYPES.includes(challenge.type) && (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction('end', { challengeId: challenge.id, award: true })} type="button">
              🏁 Terminer + attribuer les points
            </button>
          )}
          {running && !RANKED_TYPES.includes(challenge.type) && (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction('end', { challengeId: challenge.id })} type="button">
              🏁 Terminer maintenant
            </button>
          )}
          {!running && RANKED_TYPES.includes(challenge.type) && challenge.status !== 'ended' && (
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAction('end', { challengeId: challenge.id, award: true })} type="button">
              🏆 Attribuer les points du classement
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
                <strong>
                  {entry.steps || 0} pas {entry.points ? `→ +${entry.points} pts` : ''}
                </strong>
              </li>
            ))}
          {!entries.length && <li><span>Aucun pas compté pour l’instant.</span></li>}
        </ol>
      )}

      {/* Trivia */}
      {challenge.type === 'trivia' && (
        <ol className="mini-board">
          {entries
            .sort((a, b) => (b.points || 0) - (a.points || 0))
            .map((entry) => (
              <li key={entry.uid}>
                <span>{teamInfo(entry.username).emblem} {entry.username} — {Object.keys(entry.answers || {}).length} réponses</span>
                <strong>{entry.points || 0} pts</strong>
              </li>
            ))}
          {!entries.length && <li><span>Aucune réponse pour l’instant.</span></li>}
        </ol>
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
                    {entry.status === 'valid' ? `Validé +${entry.points}` : entry.status === 'rejected' ? 'Refusé' : 'À juger'}
                  </span>
                </div>
                <ReviewButtons entryPoints={entry.points} onAward={(points) => award(entry.uid, points)} />
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
                    entryPoints={guesser.guessPoints}
                    onAward={(points) => award(guesserUid, points)}
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
                  <strong>+{entry.points} pts</strong>
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
            center={{ lat: challenge.config.field.centerLat, lng: challenge.config.field.centerLng }}
            fit="territory"
            height={360}
            markers={teamMarkers(locations)}
            territory={adminTerritory(challenge)}
            zoom={16}
          />
          <ol className="mini-board">
            {territoryCounts(challenge).map((entry, index) => (
              <li key={entry.uid}>
                <span>{index + 1}. {teamInfo(entry.username).emblem} {entry.username}</span>
                <strong>{entry.cells} cases</strong>
              </li>
            ))}
          </ol>
        </>
      )}

      {/* Riddle */}
      {challenge.type === 'riddle' && (
        <>
          <p className="form-hint">
            Énigme : {challenge.config.text} — Réponses : {challenge.config.answers?.join(', ')}
          </p>
          <ol className="mini-board">
            {entries
              .sort((a, b) => (a.solvedAtMs || Infinity) - (b.solvedAtMs || Infinity))
              .map((entry) => (
                <li key={entry.uid}>
                  <span>
                    {teamInfo(entry.username).emblem} {entry.username} — {entry.attempts || 0} essai{(entry.attempts || 0) > 1 ? 's' : ''}
                  </span>
                  <strong>
                    {entry.solved ? `✅ ${new Date(entry.solvedAtMs).toLocaleTimeString()} (+${entry.points})` : '…'}
                  </strong>
                </li>
              ))}
            {!entries.length && <li><span>Aucun essai pour l’instant.</span></li>}
          </ol>
        </>
      )}
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
              <ChallengeBoard busy={busy} challenge={challenge} locations={data?.locations || []} media={data.media} now={now} onAction={runAction} />
            </>
          ) : (
            <p className="form-hint">Aucun défi affiché chez les équipes. Lancez-en un ci-dessous !</p>
          )}
        </section>

        {/* Launch */}
        <section className="admin-section">
          <h3 className="section-title">Lancer un défi</h3>
          <div className="type-tabs">
            {Object.entries(CHALLENGE_META).map(([type, meta]) => (
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

        {/* Scores */}
        <section className="admin-section">
          <h3 className="section-title">Scores</h3>
          <div className="admin-scores">
            {(data?.teams || []).map((team, index) => {
              const info = teamInfo(team.username);
              return (
                <div className="admin-score-row" key={team.uid}>
                  <span className="olympus-rank">{index + 1}.</span>
                  <span>{info.emblem} <strong>{team.username}</strong> <small>({info.god})</small></span>
                  <strong className="admin-score-value">{team.score}</strong>
                  <div className="btn-group">
                    {[25, 50, 100].map((points) => (
                      <button className="btn btn-sm btn-secondary" disabled={busy} key={points} onClick={() => runAction('adjust-score', { uid: team.uid, delta: points, reason: 'Bonus admin' })} type="button">
                        +{points}
                      </button>
                    ))}
                    <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => runAction('adjust-score', { uid: team.uid, delta: -25, reason: 'Malus admin' })} type="button">
                      −25
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Remettre TOUS les scores à zéro ?')) {
                runAction('reset-scores', {}, 'Scores remis à zéro.');
              }
            }}
            type="button"
          >
            ♻️ Remettre les scores à zéro
          </button>
        </section>

        {/* Map */}
        <section className="admin-section">
          <h3 className="section-title">Carte des équipes</h3>
          <SatMap fit="markers" height={340} markers={teamMarkers(data?.locations || [])} zoom={16} />
          <div className="location-list">
            {(data?.locations || []).map((location) => (
              <div className="location-list-row" key={location.uid}>
                <strong>{teamInfo(location.username).emblem} {location.username}</strong>
                <span>il y a {formatAge(location.updatedAt)}</span>
              </div>
            ))}
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

        {/* Score log */}
        <section className="admin-section">
          <h3 className="section-title">Historique des points</h3>
          <div className="score-log">
            {(data?.scoreLog || []).map((entry, index) => (
              <div className="score-log-row" key={index}>
                <span>{new Date(entry.atMs).toLocaleTimeString()}</span>
                <span>{teamInfo(entry.username).emblem} {entry.username}</span>
                <span className="score-log-reason">{entry.reason}</span>
                <strong className={entry.points >= 0 ? 'log-plus' : 'log-minus'}>
                  {entry.points >= 0 ? '+' : ''}{entry.points}
                </strong>
              </div>
            ))}
            {!data?.scoreLog?.length && <p className="form-hint">Aucun point attribué pour l’instant.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
