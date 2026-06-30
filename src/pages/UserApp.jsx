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
  const channelRef = useRef(null);
  const locationWatchRef = useRef(null);
  const lastLocationSaveRef = useRef(0);

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
