import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useGame } from '../hooks/useGame';
import { useNow } from '../hooks/useNow';
import { useLocationBroadcast } from '../hooks/useLocationBroadcast';
import {
  isNotificationSupported,
  getNotificationPermission,
  registerServiceWorker,
  requestNotificationPermission,
  subscribeToPush,
  saveSubscription,
  getExistingSubscription,
} from '../services/notifications';
import { teamInfo, challengeMeta } from '../config/gameConfig';
import ChallengeShell from '../components/ChallengeShell';
import StepsChallenge from '../components/challenges/StepsChallenge';
import TriviaChallenge from '../components/challenges/TriviaChallenge';
import PhotoChallenge from '../components/challenges/PhotoChallenge';
import DrawGuessChallenge from '../components/challenges/DrawGuessChallenge';
import RiddleChallenge from '../components/challenges/RiddleChallenge';
import GuideChallenge from '../components/challenges/GuideChallenge';
import TerritoryChallenge from '../components/challenges/TerritoryChallenge';

const CHALLENGE_COMPONENTS = {
  steps: StepsChallenge,
  trivia: TriviaChallenge,
  bounty: PhotoChallenge,
  photo: PhotoChallenge,
  drawguess: DrawGuessChallenge,
  riddle: RiddleChallenge,
  guide: GuideChallenge,
  territory: TerritoryChallenge,
};

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

// Home tab: team card + Mount Olympus leaderboard floating on the temple
// artboard (design's "HOME — MOUNT OLYMPUS"). One fixed screen, no scroll.
function HomeScreen({ info, score, teams, meUid, isAdmin, onAdmin, onLogout }) {
  return (
    <section className="challenge-shell home-screen">
      <div className="home-scene">
        <div className="home-team-card">
          <span className="app-emblem">{info.emblem}</span>
          <div className="home-team-meta">
            <strong>{info.title}</strong>
            <span>Sous la protection de {info.god}</span>
          </div>
          <div className="home-score">
            <b>{score ?? '…'}</b>
            <small>PTS</small>
          </div>
        </div>
      </div>

      <div className="challenge-body home-body">
        <div className="leader-card">
          <div className="leader-title">Mont Olympe</div>
          <ol className="leader-list">
            {(teams || []).map((team, i) => {
              const ti = teamInfo(team.username);
              return (
                <li className={`leader-row ${team.uid === meUid ? 'is-me' : ''}`} key={team.uid}>
                  <span className="leader-rank">{ROMAN[i] || i + 1}</span>
                  <span className="leader-emblem">{ti.emblem}</span>
                  <span className="leader-name">{ti.title}</span>
                  <strong className="leader-score">{team.score}</strong>
                </li>
              );
            })}
            {!teams?.length && (
              <li className="leader-row">
                <span className="leader-name">En attente des équipes…</span>
              </li>
            )}
          </ol>
        </div>

        <div className="home-actions">
          {isAdmin && (
            <button className="btn btn-admin btn-sm" onClick={onAdmin} type="button">
              ⚡ Console
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onLogout} type="button">
            Sortir
          </button>
        </div>
      </div>
    </section>
  );
}

// One-time onboarding gate shown right after login (matches the design's
// "Sacred Rituals" screen). Requests notifications + GPS up front so the play
// screens stay uncluttered and fixed. GPS then keeps broadcasting at the app
// level via useLocationBroadcast — this screen only triggers the permission.
function RitualsGate({ user, info, gpsOn, onEnableGps, onComplete }) {
  const [permission, setPermission] = useState(getNotificationPermission());
  const [hasSubscription, setHasSubscription] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getExistingSubscription().then((sub) => setHasSubscription(Boolean(sub)));
  }, []);

  async function enableNotifications() {
    setBusy(true);
    setError('');
    try {
      if (!isNotificationSupported()) {
        throw new Error(
          isStandalone()
            ? 'Notifications non supportées sur cet appareil.'
            : 'Installe d’abord l’app : Partager → « Sur l’écran d’accueil », puis ouvre-la depuis l’icône.'
        );
      }
      await requestNotificationPermission();
      setPermission('granted');
      await registerServiceWorker();
      const sub = await subscribeToPush();
      await saveSubscription(user, sub);
      setHasSubscription(true);
    } catch (err) {
      setError(err.message || 'Échec des notifications.');
    } finally {
      setBusy(false);
    }
  }

  function enableLocation() {
    setError('');
    if (!('geolocation' in navigator)) {
      setError('GPS non supporté.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => onEnableGps(),
      (err) => setError(err.message || 'Permission GPS refusée.'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  const notifOk = permission === 'granted' && hasSubscription;

  return (
    <div className="app-page app-immersive" style={{ '--team-color': info.color }}>
      <section className="challenge-shell rituals-screen">
        <header className="challenge-header">
          <div className="challenge-heading">
            <span className="challenge-god">Olympe</span>
            <h2 className="challenge-title">Les Rituels Sacrés</h2>
            <p className="challenge-tagline">Avant de servir les dieux.</p>
          </div>
        </header>

        <div className="challenge-body">
          <div className={`ritual-row ${notifOk ? 'is-done' : ''}`}>
            <div>
              <strong>🪽 L’offrande à Hermès</strong>
              <span>Recevoir les messages des dieux (notifications)</span>
            </div>
            {notifOk ? (
              <span className="badge badge-success">✓</span>
            ) : (
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={enableNotifications} type="button">
                Activer
              </button>
            )}
          </div>

          <div className={`ritual-row ${gpsOn ? 'is-done' : ''}`}>
            <div>
              <strong>🏹 Le pacte d’Artémis</strong>
              <span>Être visible des dieux sur la carte (GPS)</span>
            </div>
            {gpsOn ? (
              <span className="badge badge-success">✓</span>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={enableLocation} type="button">
                Activer
              </button>
            )}
          </div>

          {!isStandalone() && (
            <div className="alert alert-info">
              📲 <strong>Important :</strong> installe l’app — bouton Partager → «&nbsp;Sur l’écran
              d’accueil&nbsp;» — puis ouvre-la depuis l’icône, sinon les messages des dieux ne passeront pas.
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          <button className="btn btn-primary btn-camera" onClick={onComplete} type="button">
            ⚡ Entrer dans l’Olympe
          </button>
        </div>
      </section>
    </div>
  );
}

export default function UserApp() {
  const { currentUser, userRole, logout } = useAuth();
  const navigate = useNavigate();
  const { data, error, refresh, serverNow } = useGame(currentUser);
  const now = useNow(serverNow);
  const [lastPush, setLastPush] = useState(null);
  const [tab, setTab] = useState('home');
  const prevChallengeRef = useRef(null);
  // Onboarding + persistent GPS state (survives reloads via localStorage).
  const [gpsOn, setGpsOn] = useState(() => localStorage.getItem('olympe-gps') === '1');
  const [ritualsDone, setRitualsDone] = useState(() => localStorage.getItem('olympe-rituals') === '1');

  // One persistent GPS watch for the whole session (feeds the admin map).
  useLocationBroadcast(currentUser, gpsOn);

  // Push payloads forwarded by the service worker while the app is open.
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return undefined;
    const ch = new BroadcastChannel('push-channel');
    ch.onmessage = (e) => {
      setLastPush(e.data);
      refresh();
    };
    return () => ch.close();
  }, [refresh]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  function enableGps() {
    localStorage.setItem('olympe-gps', '1');
    setGpsOn(true);
  }

  function completeRituals() {
    localStorage.setItem('olympe-rituals', '1');
    setRitualsDone(true);
  }

  const username = data?.me?.username || currentUser?.email?.split('@')[0] || '';
  const info = teamInfo(username);
  const challenge = data?.challenge;
  const ChallengeComponent = challenge ? CHALLENGE_COMPONENTS[challenge.type] : null;
  const meta = challenge ? challengeMeta(challenge.type) : null;
  const challengeId = challenge?.id || null;

  // Jump to the challenge page when a new one drops; fall back home when it
  // clears. The challenge lives in its own tab, never over the home page.
  useEffect(() => {
    if (challengeId && challengeId !== prevChallengeRef.current) setTab('challenge');
    else if (!challengeId) setTab('home');
    prevChallengeRef.current = challengeId;
  }, [challengeId]);

  // Gate: request permissions once, up front, before the game (design's
  // "Sacred Rituals" screen). Skipped forever once completed.
  if (!ritualsDone) {
    return (
      <RitualsGate
        gpsOn={gpsOn}
        info={info}
        onComplete={completeRituals}
        onEnableGps={enableGps}
        user={currentUser}
      />
    );
  }

  const onChallengeTab = tab === 'challenge' && challenge && ChallengeComponent;

  return (
    <div className="app-shell" style={{ '--team-color': info.color }}>
      {lastPush && (
        <button className="push-banner push-float" onClick={() => setLastPush(null)} type="button">
          🪽 <strong>{lastPush.title}</strong> — {lastPush.body}
        </button>
      )}
      {error && <div className="alert alert-error toast-error">{error}</div>}

      <div className="app-view">
        {onChallengeTab ? (
          <ChallengeShell challenge={challenge} now={now}>
            {challenge.status === 'active' && now < challenge.startAtMs ? (
              <p className="challenge-intro">{meta.playerIntro}</p>
            ) : (
              <ChallengeComponent
                challenge={challenge}
                now={now}
                refresh={refresh}
                serverNow={serverNow}
                user={currentUser}
              />
            )}
          </ChallengeShell>
        ) : (
          <HomeScreen
            info={info}
            isAdmin={userRole === 'admin'}
            meUid={data?.me?.uid}
            onAdmin={() => navigate('/admin')}
            onLogout={handleLogout}
            score={data?.me?.score}
            teams={data?.teams}
          />
        )}
      </div>

      <nav className="tab-bar">
        <button
          className={`tab-btn ${tab === 'home' ? 'is-active' : ''}`}
          onClick={() => setTab('home')}
          type="button"
        >
          <span className="tab-icon">🏛️</span>
          <span className="tab-label">Accueil</span>
        </button>
        <button
          className={`tab-btn ${tab === 'challenge' ? 'is-active' : ''} ${challenge ? '' : 'is-disabled'}`}
          disabled={!challenge}
          onClick={() => challenge && setTab('challenge')}
          type="button"
        >
          <span className="tab-icon">{meta ? meta.icon : '⚔️'}</span>
          <span className="tab-label">{meta ? meta.title.replace(/^(La |Le |Les |L’)/, '') : 'Aucun défi'}</span>
        </button>
      </nav>
    </div>
  );
}
