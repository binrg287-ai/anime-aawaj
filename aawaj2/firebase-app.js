/**
 * Anime Aawaj — shared Firebase (Auth + Firestore)
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDoNXyLK1jKt1Y8QCPw5sBbban-5HxMZoY',
  authDomain: 'anime-aawaj-dbad8.firebaseapp.com',
  projectId: 'anime-aawaj-dbad8',
  storageBucket: 'anime-aawaj-dbad8.firebasestorage.app',
  messagingSenderId: '915113285815',
  appId: '1:915113285815:web:d0fb4e3f16b83a8016d532',
  measurementId: 'G-LMV48VY8RE',
};

export const LANDING_HREF = 'index-1.html';
export const DASHBOARD_HREF = 'dashboard.html';

const XP_PER_LEVEL = 10000;

let _app;
let _auth;
let _db;

export function getFirebase() {
  if (!_app) {
    _app = initializeApp(firebaseConfig);
    _auth = getAuth(_app);
    _db = getFirestore(_app);
  }
  return { app: _app, auth: _auth, db: _db };
}

export async function initAnalytics() {
  const { app } = getFirebase();
  if (await isSupported()) getAnalytics(app);
}

export function rankFromLevel(level) {
  if (level >= 50) return 'S-Rank';
  if (level >= 40) return 'A-Rank';
  if (level >= 30) return 'B-Rank';
  if (level >= 20) return 'C-Rank';
  if (level >= 10) return 'D-Rank';
  return 'E-Rank';
}

export function progressFromExp(exp) {
  const safe = Math.max(0, Number(exp) || 0);
  const level = Math.floor(safe / XP_PER_LEVEL) + 1;
  const into = safe % XP_PER_LEVEL;
  const pct = (into / XP_PER_LEVEL) * 100;
  const toNext = XP_PER_LEVEL - into;
  return {
    exp: safe,
    level,
    intoLevel: into,
    pct,
    toNext,
    rankLabel: rankFromLevel(level),
  };
}

export async function ensureUserDocument(user) {
  const { db } = getFirebase();
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const common = {
    uid: user.uid,
    name: user.displayName || 'Guild Member',
    email: user.email || '',
    photo: user.photoURL || '',
    updatedAt: serverTimestamp(),
  };

  if (!snap.exists) {
    await setDoc(ref, {
      ...common,
      level: 1,
      exp: 0,
      rank: 'E-Rank',
      isCreator: false,
      createdAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, common, { merge: true });
  }
}

export async function signInWithGoogle() {
  const { auth } = getFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const { user } = await signInWithPopup(auth, provider);
  return user;
}

export function signOutUser() {
  const { auth } = getFirebase();
  return signOut(auth);
}

export function watchAuth(callback) {
  const { auth } = getFirebase();
  return onAuthStateChanged(auth, callback);
}

/**
 * Waits until Firebase resolves auth; redirects to landing if signed out.
 * Expects #aa-auth-gate in DOM (optional loading shell).
 */
export function guardAuthenticatedPage() {
  const { auth } = getFirebase();
  const gate = document.getElementById('aa-auth-gate');

  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.replace(LANDING_HREF);
        return;
      }
      stop();
      if (gate) gate.setAttribute('hidden', '');
      resolve(user);
    });
  });
}

export function subscribeUserProfile(uid, onData) {
  const { db } = getFirebase();
  const ref = doc(db, 'users', uid);
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists ? snap.data() : null);
    },
    (err) => console.error('[Firestore users]', err)
  );
}

export async function addQuestXp(uid, amount) {
  const earned = Math.floor(Number(amount) || 0);
  if (earned <= 0) return;
  const { db } = getFirebase();
  const ref = doc(db, 'users', uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new Error('User profile missing');
    }
    const cur = snap.data().exp ?? 0;
    const next = cur + earned;
    const { level, rankLabel } = progressFromExp(next);
    tx.update(ref, {
      exp: next,
      level,
      rank: rankLabel,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function submitCreatorApplication(user, fields) {
  const { db } = getFirebase();
  await addDoc(collection(db, 'applications'), {
    ...fields,
    applicantUid: user.uid,
    applicantEmail: user.email || '',
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}
