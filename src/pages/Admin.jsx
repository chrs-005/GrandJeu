import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchAdmin, adminAction } from '../services/api';
import { useNow, formatRemaining } from '../hooks/useNow';
import { teamInfo, challengeMeta, CHALLENGE_META, RANK_POINTS } from '../config/gameConfig';
import { TRIVIA_PACKS } from '../data/triviaPacks';
import { DRAWING_PROMPTS, PHOTO_MISSIONS, RIDDLE_PRESETS } from '../data/presets';

const MAP_ZOOM = 16;
const TILE_SIZE = 256;
const QUICK_POINTS = [100, 70, 50, 30];

// ---------------------------------------------------------------------------
// Map (OpenStreetMap tiles, from the proof of concept)
// ---------------------------------------------------------------------------
function latLngToWorld(latitude, longitude, zoom) {
  const sinLat = Math.sin((latitude * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function formatAge(updatedAt) {
  if (!updatedAt) return '?';
  const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function LocationMap({ locations }) {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const center = useMemo(() => {
    if (!locations.length) return { latitude: 33.8938, longitude: 35.5018 };
    return {
      latitude: locations.reduce((sum, item) => sum + item.latitude, 0) / locations.length,
      longitude: locations.reduce((sum, item) => sum + item.longitude, 0) / locations.length,
    };
  }, [locations]);

  const centerWorld = latLngToWorld(center.latitude, center.longitude, MAP_ZOOM);
  const tileCount = 2 ** MAP_ZOOM;
  const tiles = [];
  if (size.width && size.height) {
    const minTileX = Math.floor((centerWorld.x - size.width / 2) / TILE_SIZE);
    const maxTileX = Math.floor((centerWorld.x + size.width / 2) / TILE_SIZE);
    const minTileY = Math.floor((centerWorld.y - size.height / 2) / TILE_SIZE);
    const maxTileY = Math.floor((centerWorld.y + size.height / 2) / TILE_SIZE);
    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        if (y < 0 || y >= tileCount) continue;
        const wrappedX = ((x % tileCount) + tileCount) % tileCount;
        tiles.push({
          key: `${x}:${y}`,
          src: `https://tile.openstreetmap.org/${MAP_ZOOM}/${wrappedX}/${y}.png`,
          left: x * TILE_SIZE - centerWorld.x + size.width / 2,
          top: y * TILE_SIZE - centerWorld.y + size.height / 2,
        });
      }
    }
  }

  return (
    <div className="location-map" ref={ref}>
      {tiles.map((tile) => (
        <img alt="" className="map-tile" key={tile.key} src={tile.src} style={{ left: tile.left, top: tile.top }} />
      ))}
      {locations.map((location) => {
        const world = latLngToWorld(location.latitude, location.longitude, MAP_ZOOM);
        const info = teamInfo(location.username);
        return (
          <div
            className="map-marker"
            key={location.uid}
            style={{
              left: world.x - centerWorld.x + size.width / 2,
              top: world.y - centerWorld.y + size.height / 2,
              borderColor: info.color,
            }}
            title={`${location.username} — il y a ${formatAge(location.updatedAt)}`}
          >
            <span>{info.emblem}</span>
          </div>
        );
      })}
      {!locations.length && <div className="map-empty">Aucune position partagée</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Launch forms
// ---------------------------------------------------------------------------
function LaunchForm({ type, onLaunch, busy }) {
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
      default:
        return null;
    }
  }

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

      <button className="btn btn-primary" disabled={busy} onClick={launch} type="button">
        {busy ? 'Lancement…' : `${challengeMeta(type).icon} Lancer ${challengeMeta(type).title}`}
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

function ChallengeBoard({ challenge, media, now, onAction, busy }) {
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
          {running && challenge.type === 'steps' && (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction('end', { challengeId: challenge.id, award: true })} type="button">
              🏁 Terminer + attribuer les points
            </button>
          )}
          {running && challenge.type !== 'steps' && (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction('end', { challengeId: challenge.id })} type="button">
              🏁 Terminer maintenant
            </button>
          )}
          {!running && challenge.type === 'steps' && challenge.status !== 'ended' && (
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
              <ChallengeBoard busy={busy} challenge={challenge} media={data.media} now={now} onAction={runAction} />
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
          <LaunchForm busy={busy} onLaunch={launchChallenge} type={launchType} />
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
          <LocationMap locations={data?.locations || []} />
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
