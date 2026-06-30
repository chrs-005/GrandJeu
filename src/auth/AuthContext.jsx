import { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/client';

const AuthContext = createContext(null);
const FIXED_ADMIN_EMAILS = new Set(['admin@grandjeu.local']);

function fallbackRoleForUser(user) {
  return FIXED_ADMIN_EMAILS.has(user.email?.toLowerCase()) ? 'admin' : 'user';
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadOrCreateUserDoc(user) {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data().role || fallbackRoleForUser(user);
    }
    // New user — create doc with role "user". Never set admin from frontend.
    const data = {
      uid: user.uid,
      email: user.email,
      role: 'user',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, data);
    return 'user';
  }

  async function refreshUserRole() {
    if (!currentUser) return;
    const ref = doc(db, 'users', currentUser.uid);
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setUserRole(snap.data().role || fallbackRoleForUser(currentUser));
      } else {
        setUserRole(fallbackRoleForUser(currentUser));
      }
    } catch {
      setUserRole(fallbackRoleForUser(currentUser));
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const role = await loadOrCreateUserDoc(user);
          setUserRole(role);
        } catch {
          setUserRole(fallbackRoleForUser(user));
        }
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function logout() {
    await signOut(auth);
    setUserRole(null);
  }

  const value = { currentUser, userRole, loading, login, logout, refreshUserRole };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
