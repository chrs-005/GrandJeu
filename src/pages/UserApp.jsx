import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useGame } from '../hooks/useGame';
import { useNow } from '../hooks/useNow';
import { gameAction } from '../services/api';
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
import ChallengeShell from '../components/ChallengeShell';
import StepsChallenge from '../components/challenges/StepsChallenge';
import TriviaChallenge from '../components/challenges/TriviaChallenge';
import PhotoChallenge from '../components/challenges/PhotoChallenge';
import DrawGuessChallenge from '../components/challenges/DrawGuessChallenge';
import RiddleChallenge from '../components/challenges/RiddleChallenge';

const CHALLENGE_COMPONENTS = {
  steps: StepsChallenge,
  trivia: TriviaChallenge,
  bounty: PhotoChallenge,
  photo: PhotoChallenge,
  drawguess: DrawGuessChallenge,
  riddle: RiddleChallenge,
};

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
}

// "Rituels" panel: the permissions the player must grant before the game.
function RitualsPanel({ user, onDone }) {
  const [permission, setPermission] = useState(getNotificationPermission());
  const [hasSubscription, setHasSubscription] = useState(null);
  const [locationOn, setLocationOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const watchRef = useRef(null);
  const lastSaveRef = useRef(0);

  useEffect(() => {
    getExistingSubscription().then((sub) => setHasSubscription(Boolean(sub)));
    return () => {
      // The watch keeps running while the app is open — do not clear on unmount
      // of the panel, only on logout (page unload handles that).
    };
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
    if (watchRef.current !== null) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSaveRef.current < 10000) return;
        lastSaveRef.current = now;
        const { latitude, longitude, accuracy, heading, speed } = position.coords;
        gameAction(user, 'location', { latitude, longitude, accuracy, heading, speed }).catch(() => {});
        setLocationOn(true);
      },
      (err) => setError(err.message || 'Permission GPS refusée.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    setLocationOn(true);
  }

  const notifOk = permission === 'granted' && hasSubscription;
  const allDone = notifOk && locationOn;

  useEffect(() => {
    if (allDone) onDone?.();
  }, [allDone, onDone]);

  return (
    <section className="rituals-panel">
      <h3 className="section-title">🏛️ Les Rituels</h3>
      <p className="rituals-intro">
        Avant de servir les dieux, accomplissez les rituels sacrés :
      </p>

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

      <div className={`ritual-row ${locationOn ? 'is-done' : ''}`}>
        <div>
          <strong>🏹 Le pacte d’Artémis</strong>
          <span>Être visible des dieux sur la carte (GPS)</span>
        </div>
        {locationOn ? (
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
          d’accueil&nbsp;» — et ouvre-la depuis l’icône, sinon les messages des dieux ne passeront pas.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
    </section>
  );
}

export default function UserApp() {
  const { currentUser, userRole, logout } = useAuth();
  const navigate = useNavigate();
  const { data, error, refresh, serverNow } = useGame(currentUser);
  const now = useNow(serverNow);
  const [lastPush, setLastPush] = useState(null);
  const [ritualsCollapsed, setRitualsCollapsed] = useState(false);

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

  const username = data?.me?.username || currentUser?.email?.split('@')[0] || '';
  const info = teamInfo(username);
  const challenge = data?.challenge;
  const ChallengeComponent = challenge ? CHALLENGE_COMPONENTS[challenge.type] : null;
  const meta = challenge ? challengeMeta(challenge.type) : null;

  return (
    <div className="app-page" style={{ '--team-color': info.color }}>
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
                <>
                  <p className="challenge-intro challenge-intro-small">{meta.playerIntro}</p>
                  <ChallengeComponent
                    challenge={challenge}
                    now={now}
                    refresh={refresh}
                    serverNow={serverNow}
                    user={currentUser}
                  />
                </>
              )}
            </ChallengeShell>
            {data?.teams && !challenge.running && <OlympusBoard highlightUid={data.me.uid} teams={data.teams} />}
          </>
        ) : (
          <>
            <div className="waiting-hero">
              <h1 className="logo-title">{APP_NAME}</h1>
              <p className="subtitle">{APP_SUBTITLE}</p>
              <p className="waiting-text">
                Les dieux observent en silence… Le prochain défi peut tomber de l’Olympe à tout
                moment. Gardez l’app ouverte !
              </p>
            </div>
            {data?.teams && <OlympusBoard highlightUid={data?.me?.uid} teams={data.teams} />}
          </>
        )}

        <div className="rituals-wrapper">
          <button
            className="btn btn-ghost btn-sm rituals-toggle"
            onClick={() => setRitualsCollapsed((v) => !v)}
            type="button"
          >
            {ritualsCollapsed ? '🏛️ Afficher les rituels' : '🏛️ Masquer les rituels'}
          </button>
          {/* Kept mounted (hidden) so the GPS watch keeps running when collapsed */}
          <div style={ritualsCollapsed ? { display: 'none' } : undefined}>
            <RitualsPanel user={currentUser} />
          </div>
        </div>

        {userRole === 'admin' && (
          <button className="btn btn-admin" onClick={() => navigate('/admin')} type="button">
            ⚡ Console des dieux (admin)
          </button>
        )}
      </main>
    </div>
  );
}
