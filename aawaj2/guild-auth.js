/**
 * ═══════════════════════════════════════════════════
 *  ANIME AAWAJ GUILD — Authentication Layer
 *  guild-auth.js  |  Iron — Phase 5A
 * ═══════════════════════════════════════════════════
 *
 *  Handles:
 *  ✅ Google Sign-In (one-click)
 *  ✅ Email + Password Sign-In / Registration
 *  ✅ Sign Out
 *  ✅ Auth state observer → updates ALL nav elements
 *  ✅ Auto-creates player profile in Firestore on first login
 *  ✅ Stores player session in localStorage for fast UI
 */

import {
  auth, db
} from './firebase-config.js';

import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ═══════════════════════════════════════
   GOOGLE SIGN-IN
═══════════════════════════════════════ */
export async function loginWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    await ensurePlayerProfile(result.user);
    showToast('⟡ Welcome back, ' + result.user.displayName.split(' ')[0] + '!');
    closeLoginModal();
    return result.user;
  } catch (err) {
    handleAuthError(err);
  }
}

/* ═══════════════════════════════════════
   EMAIL REGISTRATION
═══════════════════════════════════════ */
export async function registerWithEmail(username, email, password) {
  try {
    // Validate
    if (username.trim().length < 3)  throw { code: 'guild/username-short' };
    if (password.length < 6)         throw { code: 'auth/weak-password' };

    const result = await createUserWithEmailAndPassword(auth, email, password);

    // Set display name
    await updateProfile(result.user, { displayName: username });

    // Create player profile
    await ensurePlayerProfile(result.user, username);

    showToast('⟡ Guild registration complete, ' + username + '!');
    closeLoginModal();
    return result.user;
  } catch (err) {
    handleAuthError(err);
    throw err;
  }
}

/* ═══════════════════════════════════════
   EMAIL SIGN-IN
═══════════════════════════════════════ */
export async function loginWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    showToast('⟡ Welcome back, ' + (result.user.displayName || 'Adventurer') + '!');
    closeLoginModal();
    return result.user;
  } catch (err) {
    handleAuthError(err);
    throw err;
  }
}

/* ═══════════════════════════════════════
   SIGN OUT
═══════════════════════════════════════ */
export async function guildSignOut() {
  try {
    await signOut(auth);
    localStorage.removeItem('guild_player');
    showToast('⟡ You have left the Guild. Until next time.');
    // Redirect to home after short delay
    setTimeout(() => window.location.href = 'index.html', 1200);
  } catch (err) {
    console.error('[GuildAuth] Sign out error:', err);
  }
}

/* ═══════════════════════════════════════
   CREATE / FETCH PLAYER PROFILE
   Firestore: players/{uid}
═══════════════════════════════════════ */
async function ensurePlayerProfile(user, usernameOverride) {
  const playerRef = doc(db, 'players', user.uid);
  const snap      = await getDoc(playerRef);

  if (!snap.exists()) {
    // First login — create player document
    const playerData = {
      uid:          user.uid,
      username:     usernameOverride || user.displayName || 'Adventurer',
      email:        user.email,
      photoURL:     user.photoURL || null,
      rank:         'E',             // E → D → C → B → A → S → SS
      level:        1,
      xp:           0,
      xpToNext:     1000,
      score:        0,               // Total leaderboard score
      streak:       0,
      questsDone:   0,
      newsContribs: 0,
      communityPts: 0,
      badges:       [],
      isCreator:    false,
      creatorStatus:'none',          // 'none' | 'pending' | 'approved'
      joinedAt:     serverTimestamp(),
      lastActive:   serverTimestamp(),
    };

    await setDoc(playerRef, playerData);

    // Cache in localStorage for fast UI reads
    localStorage.setItem('guild_player', JSON.stringify({
      ...playerData,
      joinedAt:   new Date().toISOString(),
      lastActive: new Date().toISOString(),
    }));

    console.log('[GuildAuth] New player profile created:', playerData.username);
    return playerData;
  } else {
    // Existing player — update lastActive
    const existing = snap.data();
    await setDoc(playerRef, { lastActive: serverTimestamp() }, { merge: true });
    localStorage.setItem('guild_player', JSON.stringify(existing));
    return existing;
  }
}

/* ═══════════════════════════════════════
   AUTH STATE OBSERVER
   Runs on every page load automatically.
   Updates all navbar/UI elements.
═══════════════════════════════════════ */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // ── User is logged in ──
    const cachedPlayer = JSON.parse(localStorage.getItem('guild_player') || '{}');
    const displayName  = cachedPlayer.username || user.displayName || 'Adventurer';

    // Update all nav "Player Login" buttons
    document.querySelectorAll('[data-auth="login-btn"]').forEach(btn => {
      btn.innerHTML    = `<span style="font-size:1rem">⚔️</span> ${displayName}`;
      btn.onclick      = guildSignOut;
      btn.title        = 'Click to sign out';
      btn.style.borderColor = 'var(--neon-teal)';
      btn.style.color       = 'var(--neon-teal)';
    });

    // Show creator button if creator
    if (cachedPlayer.isCreator) {
      document.querySelectorAll('[data-auth="creator-btn"]').forEach(el => {
        el.style.display = 'flex';
      });
    }

    // Show logged-in specific elements
    document.querySelectorAll('[data-auth="logged-in"]').forEach(el => {
      el.style.display = '';
    });
    document.querySelectorAll('[data-auth="logged-out"]').forEach(el => {
      el.style.display = 'none';
    });

    // Update profile page if we're on it
    if (window.location.pathname.includes('dashboard')) {
      populateDashboard(user, cachedPlayer);
    }

  } else {
    // ── User is logged out ──
    localStorage.removeItem('guild_player');

    document.querySelectorAll('[data-auth="login-btn"]').forEach(btn => {
      btn.innerHTML    = '⊞ Player Login';
      btn.onclick      = openLoginModal;
      btn.title        = '';
      btn.style.borderColor = '';
      btn.style.color       = '';
    });

    document.querySelectorAll('[data-auth="logged-in"]').forEach(el => {
      el.style.display = 'none';
    });
    document.querySelectorAll('[data-auth="logged-out"]').forEach(el => {
      el.style.display = '';
    });

    // If a protected page (like dashboard) is opened without auth, send player home.
    if (window.location.pathname.includes('dashboard.html')) {
      window.location.href = 'index-1.html';
    }
  }
});

/* ═══════════════════════════════════════
   POPULATE DASHBOARD WITH REAL DATA
═══════════════════════════════════════ */
function populateDashboard(user, player) {
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setEl('player-username', player.username || user.displayName);
  setEl('player-level',    player.level    || 1);
  setEl('player-rank',     player.rank     || 'E');
  setEl('hud-score',       player.score    || 0);

  // EXP bar
  const fillEl = document.getElementById('exp-fill');
  if (fillEl) {
    const pct = Math.min(((player.xp || 0) / (player.xpToNext || 1000)) * 100, 100);
    setTimeout(() => fillEl.style.width = pct + '%', 400);
  }

  // Avatar
  const avatarEl = document.getElementById('player-avatar');
  if (avatarEl && user.photoURL) {
    avatarEl.innerHTML = `<img src="${user.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" alt="Avatar"/>`;
  }
}

/* ═══════════════════════════════════════
   ERROR HANDLER
═══════════════════════════════════════ */
function handleAuthError(err) {
  const messages = {
    'auth/email-already-in-use':   '⚠ That email is already registered.',
    'auth/user-not-found':         '⚠ No player found with that email.',
    'auth/wrong-password':         '⚠ Incorrect password. Try again.',
    'auth/invalid-email':          '⚠ Invalid email address.',
    'auth/weak-password':          '⚠ Password must be at least 6 characters.',
    'auth/popup-closed-by-user':   '⚠ Login cancelled.',
    'guild/username-short':        '⚠ Username must be at least 3 characters.',
  };

  const msg = messages[err.code] || '⚠ Something went wrong. Try again.';
  showAuthError(msg);
  console.error('[GuildAuth]', err.code, err.message);
}

/* ═══════════════════════════════════════
   MODAL HELPERS
═══════════════════════════════════════ */
export function openLoginModal() {
  const modal = document.getElementById('login-modal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    clearAuthErrors();
  }
}

export function closeLoginModal() {
  const modal = document.getElementById('login-modal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function showAuthError(msg) {
  document.querySelectorAll('.auth-error').forEach(el => {
    el.textContent = msg;
    el.style.display = 'block';
  });
}

function clearAuthErrors() {
  document.querySelectorAll('.auth-error').forEach(el => {
    el.style.display = 'none';
    el.textContent   = '';
  });
}

/* ═══════════════════════════════════════
   TOAST UTILITY (reused from pages)
═══════════════════════════════════════ */
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  document.getElementById('toast-msg').textContent = msg;
  t.style.borderColor = isError ? 'var(--neon-crimson)' : 'var(--neon-teal)';
  t.style.color       = isError ? 'var(--neon-crimson)' : 'var(--neon-teal)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

/* ═══════════════════════════════════════
   GET CURRENT PLAYER (util for other files)
═══════════════════════════════════════ */
export function getCurrentPlayer() {
  return JSON.parse(localStorage.getItem('guild_player') || 'null');
}

export function getCurrentUser() {
  return auth.currentUser;
}
