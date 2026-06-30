import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  isNotificationSupported,
  getNotificationPermission,
  registerServiceWorker,
  requestNotificationPermission,
  subscribeToPush,
  saveSubscription,
  getExistingSubscription,
  sendLocalTestNotification,
} from '../services/notifications';
import { isLocationSupported, saveLocation } from '../services/location';
import {
  fetchStepChallenge,
  isMotionSupported,
  requestMotionPermission,
  saveStepResult,
} from '../services/steps';
import { fetchDrawingChallenge, saveDrawingSubmission } from '../services/drawing';

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;
const DRAWING_COLORS = ['#111827', '#dc2626', '#2563eb', '#059669', '#f59e0b', '#7c3aed'];

function DrawingCanvas({ challenge, submitted, onSubmit }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [color, setColor] = useState(DRAWING_COLORS[0]);
  const [size, setSize] = useState(8);
  const [tool, setTool] = useState('pen');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, [challenge?.id]);

  function getPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const pointer = event.touches?.[0] || event;
    return {
      x: ((pointer.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((pointer.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  }

  function drawLine(from, to) {
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size;
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  function startDrawing(event) {
    if (!challenge?.active || submitted) return;
    event.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPoint(event);
  }

  function moveDrawing(event) {
    if (!drawingRef.current || !lastPointRef.current) return;
    event.preventDefault();
    const nextPoint = getPoint(event);
    drawLine(lastPointRef.current, nextPoint);
    lastPointRef.current = nextPoint;
  }

  function stopDrawing() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearCanvas() {
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  async function submitDrawing() {
    setSaving(true);
    try {
      await onSubmit(canvasRef.current.toDataURL('image/png'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="drawing-tool">
      <div className="drawing-prompt">{challenge.prompt}</div>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="drawing-canvas"
        onMouseDown={startDrawing}
        onMouseMove={moveDrawing}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={moveDrawing}
        onTouchEnd={stopDrawing}
      />

      <div className="drawing-toolbar">
        <div className="drawing-colors">
          {DRAWING_COLORS.map((item) => (
            <button
              aria-label={`Use color ${item}`}
              className={`color-swatch ${color === item && tool === 'pen' ? 'is-active' : ''}`}
              key={item}
              onClick={() => {
                setColor(item);
                setTool('pen');
              }}
              style={{ background: item }}
              type="button"
            />
          ))}
        </div>

        <label className="drawing-size">
          <span>Size</span>
          <input
            max="28"
            min="2"
            onChange={(e) => setSize(Number(e.target.value))}
            type="range"
            value={size}
          />
        </label>

        <div className="drawing-actions">
          <button
            className={`btn btn-sm ${tool === 'eraser' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTool(tool === 'eraser' ? 'pen' : 'eraser')}
            type="button"
          >
            Eraser
          </button>
          <button className="btn btn-secondary btn-sm" onClick={clearCanvas} type="button">
            Clear
          </button>
        </div>
      </div>

      <button
        className="btn btn-primary"
        disabled={saving || submitted || !challenge.active}
        onClick={submitDrawing}
        type="button"
      >
        {saving ? 'Saving...' : submitted ? 'Drawing sent' : 'Send drawing'}
      </button>
    </div>
  );
}

export default function UserApp() {
  const { currentUser, userRole, logout } = useAuth();
  const navigate = useNavigate();

  const [permission, setPermission] = useState(getNotificationPermission());
  const [swSupported] = useState('serviceWorker' in navigator);
  const [pushSupported] = useState('PushManager' in window);
  const [hasSubscription, setHasSubscription] = useState(null);
  const [lastNotification, setLastNotification] = useState(null);
  const [notifStatus, setNotifStatus] = useState('');
  const [notifError, setNotifError] = useState('');
  const [enabling, setEnabling] = useState(false);
  const [locationSharing, setLocationSharing] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');
  const [locationError, setLocationError] = useState('');
  const [lastLocationAt, setLastLocationAt] = useState(null);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [stepChallenge, setStepChallenge] = useState(null);
  const [steps, setSteps] = useState(0);
  const [stepStatus, setStepStatus] = useState('');
  const [stepError, setStepError] = useState('');
  const [drawingChallenge, setDrawingChallenge] = useState(null);
  const [drawingSubmitted, setDrawingSubmitted] = useState(false);
  const [drawingStatus, setDrawingStatus] = useState('');
  const [drawingError, setDrawingError] = useState('');
  const channelRef = useRef(null);
  const locationWatchRef = useRef(null);
  const lastLocationSaveRef = useRef(0);
  const stepChallengeRef = useRef(null);
  const stepsRef = useRef(0);
  const lastStepAtRef = useRef(0);
  const lastStepSaveAtRef = useRef(0);
  const motionEnabledRef = useRef(false);

  useEffect(() => {
    getExistingSubscription().then((sub) => setHasSubscription(!!sub));

    // Listen for push payloads forwarded by the service worker
    if ('BroadcastChannel' in window) {
      const ch = new BroadcastChannel('push-channel');
      ch.onmessage = (e) => setLastNotification(e.data);
      channelRef.current = ch;
      return () => ch.close();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (locationWatchRef.current !== null && isLocationSupported()) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStepChallenge() {
      if (!currentUser) return;
      try {
        const data = await fetchStepChallenge(currentUser);
        if (cancelled) return;

        const incoming = data.challenge;
        setStepChallenge((previous) => {
          if (incoming?.id && incoming.id !== previous?.id) {
            const nextSteps = data.ownResult || 0;
            stepsRef.current = nextSteps;
            setSteps(nextSteps);
            setStepStatus(incoming.active ? 'Step challenge loaded. Get ready.' : 'Latest step challenge loaded.');
          }
          stepChallengeRef.current = incoming;
          return incoming;
        });
        setStepError('');
      } catch (err) {
        if (!cancelled) setStepError(err.message || 'Failed to load step challenge.');
      }
    }

    loadStepChallenge();
    const interval = setInterval(loadStepChallenge, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser]);

  useEffect(() => {
    motionEnabledRef.current = motionEnabled;
  }, [motionEnabled]);

  useEffect(() => {
    let cancelled = false;

    async function loadDrawingChallenge() {
      if (!currentUser) return;
      try {
        const data = await fetchDrawingChallenge(currentUser);
        if (cancelled) return;

        const incoming = data.challenge;
        setDrawingChallenge((previous) => {
          if (incoming?.id && incoming.id !== previous?.id) {
            setDrawingSubmitted(Boolean(data.ownSubmission));
            setDrawingStatus(incoming.active ? 'Drawing challenge loaded.' : 'Latest drawing challenge loaded.');
          } else {
            setDrawingSubmitted(Boolean(data.ownSubmission));
          }
          return incoming;
        });
        setDrawingError('');
      } catch (err) {
        if (!cancelled) setDrawingError(err.message || 'Failed to load drawing challenge.');
      }
    }

    loadDrawingChallenge();
    const interval = setInterval(loadDrawingChallenge, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!motionEnabled) return undefined;

    function saveCurrentSteps(challengeId) {
      const now = Date.now();
      if (now - lastStepSaveAtRef.current < 5000) return;
      lastStepSaveAtRef.current = now;
      saveStepResult(currentUser, challengeId, stepsRef.current).catch((err) => {
        setStepError(err.message || 'Failed to save steps.');
      });
    }

    function handleMotion(event) {
      if (!motionEnabledRef.current) return;

      const challenge = stepChallengeRef.current;
      const now = Date.now();
      if (!challenge?.active || now < challenge.startAtMs || now > challenge.endAtMs) return;

      const acceleration = event.accelerationIncludingGravity || event.acceleration;
      if (!acceleration) return;

      const x = acceleration.x || 0;
      const y = acceleration.y || 0;
      const z = acceleration.z || 0;
      const magnitude = Math.sqrt(x * x + y * y + z * z);

      if (magnitude > 16.5 && now - lastStepAtRef.current > 450) {
        lastStepAtRef.current = now;
        setSteps((previous) => {
          const next = previous + 1;
          stepsRef.current = next;
          return next;
        });
        setStepStatus('Counting steps...');
        saveCurrentSteps(challenge.id);
      }
    }

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [currentUser, motionEnabled]);

  async function handleEnableNotifications() {
    setNotifError('');
    setNotifStatus('');
    setEnabling(true);
    try {
      if (!isNotificationSupported()) throw new Error('Push notifications are not supported in this browser.');
      await requestNotificationPermission();
      setPermission('granted');
      await registerServiceWorker();
      const sub = await subscribeToPush();
      await saveSubscription(currentUser, sub);
      setHasSubscription(true);
      setNotifStatus('Notifications enabled and subscription saved.');
    } catch (err) {
      setNotifError(err.message || 'Failed to enable notifications.');
    } finally {
      setEnabling(false);
    }
  }

  async function handleLocalTest() {
    setNotifError('');
    setNotifStatus('');
    try {
      if (permission !== 'granted') throw new Error('Notification permission not granted yet.');
      await sendLocalTestNotification();
      setNotifStatus('Local test notification sent — check your device.');
    } catch (err) {
      setNotifError(err.message);
    }
  }

  function handleEnableLocation() {
    setLocationError('');
    setLocationStatus('');

    if (!isLocationSupported()) {
      setLocationError('Location is not supported on this device.');
      return;
    }

    if (locationWatchRef.current !== null) {
      setLocationStatus('Location sharing is already active.');
      return;
    }

    locationWatchRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();
        if (now - lastLocationSaveRef.current < 10000) return;

        lastLocationSaveRef.current = now;
        try {
          await saveLocation(currentUser, position);
          setLocationSharing(true);
          setLastLocationAt(new Date());
          setLocationStatus('Location shared.');
          setLocationError('');
        } catch (err) {
          setLocationError(err.message || 'Failed to save location.');
        }
      },
      (err) => {
        setLocationSharing(false);
        setLocationError(err.message || 'Location permission failed.');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    setLocationSharing(true);
    setLocationStatus('Waiting for GPS position...');
  }

  function handleDisableLocation() {
    if (locationWatchRef.current !== null && isLocationSupported()) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
    setLocationSharing(false);
    setLocationStatus('Location sharing stopped.');
  }

  async function handleEnableMotion() {
    setStepError('');
    setStepStatus('');
    try {
      await requestMotionPermission();
      setMotionEnabled(true);
      setStepStatus('Step sensor enabled. Steps will count during the next active challenge.');
    } catch (err) {
      setStepError(err.message || 'Failed to enable step sensor.');
    }
  }

  async function handleSubmitDrawing(imageDataUrl) {
    setDrawingError('');
    setDrawingStatus('');
    try {
      await saveDrawingSubmission(currentUser, drawingChallenge.id, imageDataUrl);
      setDrawingSubmitted(true);
      setDrawingStatus('Drawing sent to admin.');
    } catch (err) {
      setDrawingError(err.message || 'Failed to save drawing.');
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const permBadge = {
    granted: { label: 'Granted', cls: 'badge badge-success' },
    denied: { label: 'Denied', cls: 'badge badge-error' },
    default: { label: 'Not asked', cls: 'badge badge-neutral' },
    unsupported: { label: 'Unsupported', cls: 'badge badge-neutral' },
  }[permission] || { label: permission, cls: 'badge badge-neutral' };

  return (
    <div className="page-center" style={{ alignItems: 'flex-start', paddingTop: 32 }}>
      <div className="card" style={{ maxWidth: 520, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h1 className="logo-title">Grand Jeu</h1>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
        </div>

        {/* User info */}
        <section className="info-section">
          <div className="info-row">
            <span className="info-label">Signed in as</span>
            <span className="info-value">{currentUser?.email}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Role</span>
            <span className={`badge ${userRole === 'admin' ? 'badge-admin' : 'badge-user'}`}>
              {userRole || 'user'}
            </span>
          </div>
        </section>

        <section className="info-section">
          <h3 className="section-title">Location Sharing</h3>
          <div className="info-row">
            <span className="info-label">GPS</span>
            <span className={`badge ${isLocationSupported() ? 'badge-success' : 'badge-error'}`}>
              {isLocationSupported() ? 'Supported' : 'Not supported'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Sharing</span>
            <span className={`badge ${locationSharing ? 'badge-success' : 'badge-neutral'}`}>
              {locationSharing ? 'On' : 'Off'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Last update</span>
            <span className="info-value">{lastLocationAt ? lastLocationAt.toLocaleTimeString() : 'None'}</span>
          </div>
        </section>

        <section className="info-section">
          <h3 className="section-title">Step Challenge</h3>
          <div className="info-row">
            <span className="info-label">Motion sensor</span>
            <span className={`badge ${isMotionSupported() ? 'badge-success' : 'badge-error'}`}>
              {isMotionSupported() ? 'Supported' : 'Not supported'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Sensor enabled</span>
            <span className={`badge ${motionEnabled ? 'badge-success' : 'badge-neutral'}`}>
              {motionEnabled ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Challenge</span>
            <span className={`badge ${stepChallenge?.active ? 'badge-success' : 'badge-neutral'}`}>
              {stepChallenge?.active ? 'Active' : 'Waiting'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Steps</span>
            <span className="info-value">{steps}</span>
          </div>
        </section>

        <section className="info-section">
          <h3 className="section-title">Drawing Challenge</h3>
          <div className="info-row">
            <span className="info-label">Challenge</span>
            <span className={`badge ${drawingChallenge?.active ? 'badge-success' : 'badge-neutral'}`}>
              {drawingChallenge?.active ? 'Active' : 'Waiting'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Submission</span>
            <span className={`badge ${drawingSubmitted ? 'badge-success' : 'badge-neutral'}`}>
              {drawingSubmitted ? 'Sent' : 'Not sent'}
            </span>
          </div>
          {drawingChallenge && (
            <DrawingCanvas
              challenge={drawingChallenge}
              submitted={drawingSubmitted}
              onSubmit={handleSubmitDrawing}
            />
          )}
        </section>

        {/* Push support status */}
        <section className="info-section">
          <h3 className="section-title">Push Notification Status</h3>
          <div className="info-row">
            <span className="info-label">Service Worker</span>
            <span className={`badge ${swSupported ? 'badge-success' : 'badge-error'}`}>
              {swSupported ? 'Supported' : 'Not supported'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Push API</span>
            <span className={`badge ${pushSupported ? 'badge-success' : 'badge-error'}`}>
              {pushSupported ? 'Supported' : 'Not supported'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Permission</span>
            <span className={permBadge.cls}>{permBadge.label}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Subscription saved</span>
            <span className={`badge ${hasSubscription ? 'badge-success' : 'badge-neutral'}`}>
              {hasSubscription === null ? 'Checking…' : hasSubscription ? 'Yes' : 'No'}
            </span>
          </div>
        </section>

        {/* iOS hint */}
        <div className="alert alert-info" style={{ fontSize: 13 }}>
          <strong>iPhone users:</strong> Push notifications require installing this app to the Home Screen and opening it from there.
        </div>

        {/* Last received notification */}
        {lastNotification && (
          <div className="alert alert-success">
            <strong>Last push received:</strong> {lastNotification.title} — {lastNotification.body}
          </div>
        )}

        {/* Status / error */}
        {notifStatus && <div className="alert alert-success">{notifStatus}</div>}
        {notifError && <div className="alert alert-error">{notifError}</div>}
        {locationStatus && <div className="alert alert-success">{locationStatus}</div>}
        {locationError && <div className="alert alert-error">{locationError}</div>}
        {stepStatus && <div className="alert alert-success">{stepStatus}</div>}
        {stepError && <div className="alert alert-error">{stepError}</div>}
        {drawingStatus && <div className="alert alert-success">{drawingStatus}</div>}
        {drawingError && <div className="alert alert-error">{drawingError}</div>}

        {/* Action buttons */}
        <div className="btn-group">
          <button
            className="btn btn-primary"
            onClick={handleEnableNotifications}
            disabled={enabling || permission === 'denied'}
          >
            {enabling ? 'Enabling…' : hasSubscription ? 'Re-subscribe notifications' : 'Enable notifications'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleLocalTest}
            disabled={permission !== 'granted'}
          >
            Send local test notification
          </button>

          <button
            className="btn btn-secondary"
            onClick={locationSharing ? handleDisableLocation : handleEnableLocation}
          >
            {locationSharing ? 'Stop location sharing' : 'Share my location'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleEnableMotion}
            disabled={motionEnabled}
          >
            {motionEnabled ? 'Step sensor enabled' : 'Enable step sensor'}
          </button>

          {userRole === 'admin' && (
            <button className="btn btn-admin" onClick={() => navigate('/admin')}>
              Go to Admin page
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
