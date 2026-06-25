# Grand Jeu

A Progressive Web App (PWA) with Firebase Auth, Firestore RBAC, and Web Push notifications — deployable fully on Vercel.

## Tech Stack

- **Frontend:** React + Vite + React Router
- **Auth & DB:** Firebase Auth (email/password) + Firestore
- **Push notifications:** Web Push API + `web-push` package
- **Backend:** Vercel serverless functions (`/api`)
- **PWA:** `vite-plugin-pwa` with custom service worker

---

## Setup Guide

### 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) → **Add project**.
2. Enable **Email/Password** sign-in: Authentication → Sign-in method → Email/Password → Enable.
3. Create a **Firestore database**: Firestore → Create database → Start in production mode.
4. Apply Firestore rules from `firestore.rules` in the Firebase Console (Firestore → Rules).

### 2. Create a Firebase Web App and copy config

Firebase Console → Project Settings → Your apps → Add app (Web) → copy the config values.

### 3. Generate VAPID keys

```bash
npm run generate-vapid
```

Copy the three keys printed in the terminal.

### 4. Configure environment variables

Copy `.env.example` to `.env.local` for local development and fill in all values:

```bash
cp .env.example .env.local
```

### 5. Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repo in [Vercel](https://vercel.com/).
3. Set **Framework preset**: `Vite`
4. Set **Build command**: `npm run build`
5. Set **Output directory**: `dist`
6. Add **all environment variables** from `.env.example` in Vercel Dashboard → Project → Settings → Environment Variables.
7. Deploy.

### 6. Create your first admin

1. Open the deployed app and sign up / log in with your email.
2. Go to **Firebase Console → Firestore → `users` collection → your document**.
3. Edit the `role` field from `"user"` to `"admin"`.
4. Refresh the app — the **Go to Admin page** button will appear.

---

## Vercel Settings

| Setting           | Value           |
|-------------------|-----------------|
| Framework preset  | Vite            |
| Install command   | `npm install`   |
| Build command     | `npm run build` |
| Output directory  | `dist`          |

---

## Testing the Full Flow

1. Open the app URL in a browser.
2. Sign in as a normal user → `/app`.
3. Click **Enable notifications** → grant permission.
4. Click **Send local test notification** to verify permission works.
5. Sign in as admin (role set in Firestore) → **Go to Admin page** → `/admin`.
6. Type a title and message → **Send to all users**.
7. Devices with active subscriptions receive the push notification.
8. The admin UI shows sent/failed/removed counts.

---

## iOS / iPhone Push Notifications

> Web Push on iPhone **only works when the app is installed to the Home Screen**.

Steps for iPhone users:
1. Open the app URL in **Safari**.
2. Tap the **Share** button → **Add to Home Screen**.
3. Open the app from the Home Screen icon.
4. Sign in and tap **Enable notifications**.
5. Grant permission when prompted.
6. Test admin push from the `/admin` page.

**Requirements:** iOS 16.4+, HTTPS (Vercel provides this automatically).

---

## Project Structure

```
/src
  /auth          AuthContext, ProtectedRoute, AdminRoute
  /firebase      Firebase client init
  /pages         Login, UserApp, Admin
  /services      Push notification helpers
  App.jsx
  main.jsx
  styles.css

/api
  send-notification.js   Vercel serverless function

/scripts
  generate-vapid.js      VAPID key generator

/public
  sw.js                  Custom service worker (push + notificationclick)
  /icons/icon.svg

firestore.rules
.env.example
```

---

## First Admin — Manual Step Required

The client-side code **never** sets `role: "admin"`. The first admin must be created manually:

1. Sign up in the app (this creates `users/{uid}` with `role: "user"`).
2. In Firebase Console → Firestore → `users/{uid}` → change `role` to `"admin"`.

Subsequent admin promotions should go through a trusted backend script or Firebase Console only.
