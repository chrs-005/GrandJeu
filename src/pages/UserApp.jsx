import { useEffect, useState } from 'react';
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
import { teamInfo, challengeMeta, APP_NAME, APP_SUBTITLE } from '../config/gameConfig';
import OlympusBoard from '../components/OlympusBoard';
import friezeImg from '../assets/frieze.jpg';
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

  const immersive = Boolean(challenge && ChallengeComponent);

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

  return (
    <div className={`app-page ${immersive ? 'app-immersive' : ''}`} style={{ '--team-color': info.color }}>
      {immersive ? (
        // Challenge screens are full-bleed artboards; keep only a minimal
        // floating score + exit so the diorama stays uncluttered.
        <div className="immersive-bar">
          <span className="immersive-score">{info.emblem} {data?.me?.score ?? '…'} pts</span>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} type="button">
            Sortir
          </button>
        </div>
      ) : (
        <header className="app-header">
          <div className="app-team">
            <span className="app-emblem">{info.emblem}</span>
            <div>
              <strong className="app-team-name">{info.title}</strong>
              <span className="app-god">Sous la protection de {info.god}</span>
            </div>
          </div>
          <div className="app-header-right">
            <div className="app-score">
              <span className="app-score-value">{data?.me?.score ?? '…'}</span>
              <span className="app-score-label">pts</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout} type="button">
              Sortir
            </button>
          </div>
        </header>
      )}

      {lastPush && (
        <button className="push-banner" onClick={() => setLastPush(null)} type="button">
          🪽 <strong>{lastPush.title}</strong> — {lastPush.body}
        </button>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <main className="app-main">
        {challenge && ChallengeComponent ? (
          <>
            <ChallengeShell challenge={challenge} now={now}>
              {challenge.status === 'active' && now < challenge.startAtMs ? (
                <p className="challenge-intro">{meta.playerIntro}</p>
              ) : (
                // During play the design goes straight to the challenge (no intro
                // paragraph) so everything fits the fixed artboard.
                <ChallengeComponent
                  challenge={challenge}
                  now={now}
                  refresh={refresh}
                  serverNow={serverNow}
                  user={currentUser}
                />
              )}
            </ChallengeShell>
            {data?.teams && !challenge.running && <OlympusBoard highlightUid={data.me.uid} teams={data.teams} />}
          </>
        ) : (
          <>
            <div className="waiting-hero">
              <img alt="Procession des dieux" className="waiting-frieze" src={friezeImg} />
              <h1 className="logo-title">{APP_NAME}</h1>
              <p className="subtitle">{APP_SUBTITLE}</p>
              <p className="waiting-text">
                Les dieux observent en silence… Le prochain défi peut tomber de l’Olympe à tout
                moment. Gardez l’app ouverte !
              </p>
            </div>
            {data?.teams && <OlympusBoard highlightUid={data?.me?.uid} teams={data.teams} />}

            {userRole === 'admin' && (
              <button className="btn btn-admin" onClick={() => navigate('/admin')} type="button">
                ⚡ Console des dieux (admin)
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
