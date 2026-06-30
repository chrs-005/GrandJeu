import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/client';

export function isNotificationSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers not supported');
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  // Wait until the SW is active
  await navigator.serviceWorker.ready;
  return reg;
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) throw new Error('Notifications not supported');
  const result = await Notification.requestPermission();
  if (result !== 'granted') throw new Error(`Permission ${result}`);
  return result;
}

function urlBase64ToUint8Array(base64String) {
  const trimmed = base64String.trim();
  const padding = '='.repeat((4 - (trimmed.length % 4)) % 4);
  const base64 = (trimmed + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function getVapidApplicationServerKey() {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error('VITE_VAPID_PUBLIC_KEY is not set in Vercel.');

  let keyBytes;
  try {
    keyBytes = urlBase64ToUint8Array(vapidKey);
  } catch {
    throw new Error('VITE_VAPID_PUBLIC_KEY is not valid base64url. Copy the generated public key exactly.');
  }

  if (keyBytes.byteLength !== 65) {
    throw new Error(
      `VITE_VAPID_PUBLIC_KEY is invalid. Expected 65 decoded bytes, got ${keyBytes.byteLength}. Copy the generated public key exactly.`
    );
  }

  return keyBytes;
}

// Safe, deterministic subscription ID derived from the endpoint
async function subscriptionId(endpoint) {
  const encoded = new TextEncoder().encode(endpoint);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: getVapidApplicationServerKey(),
  });
  return subscription;
}

export async function saveSubscription(user, subscription) {
  const subJson = subscription.toJSON();
  const id = await subscriptionId(subJson.endpoint);
  const ref = doc(db, 'users', user.uid, 'pushSubscriptions', id);
  await setDoc(ref, {
    endpoint: subJson.endpoint,
    keys: subJson.keys,
    subscription: subJson,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    userAgent: navigator.userAgent,
  });
  return id;
}

export async function getExistingSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function sendLocalTestNotification() {
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('Grand Jeu – Test', {
    body: 'Local notification is working correctly.',
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
  });
}
