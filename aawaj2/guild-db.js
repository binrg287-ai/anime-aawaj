/**
 * ═══════════════════════════════════════════════════
 *  ANIME AAWAJ GUILD — Database Layer (Firestore)
 *  guild-db.js  |  Iron — Phase 5A
 * ═══════════════════════════════════════════════════
 *
 *  Firestore Collection Map:
 *  ─────────────────────────
 *  players/         → uid → player profile
 *  posts/           → postId → news articles
 *  quests/          → questId → quiz metadata
 *    └── questions/ → questionId → question data
 *  quest_results/   → resultId → player score per quest
 *  leaderboard/     → uid → live score doc
 *  creator_apps/    → appId → creator applications
 *  gallery/         → imageId → fan art / posters
 */

import { db, storage } from './firebase-config.js';
import { getCurrentUser, getCurrentPlayer } from './guild-auth.js';

import {
  collection, doc,
  getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit,
  serverTimestamp, increment, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';


/* ═══════════════════════════════════════
   ① POSTS — News / Articles
═══════════════════════════════════════ */

/**
 * Fetch all published posts, newest first.
 * Optional: filter by category.
 *
 * @param {string|null} category - e.g. 'trailer', 'review', null = all
 * @param {number} limitCount
 * @returns {Array} posts
 */
export async function fetchPosts(category = null, limitCount = 20) {
  try {
    let q;

    if (category) {
      q = query(
        collection(db, 'posts'),
        where('status',   '==', 'published'),
        where('category', '==', category),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
    } else {
      q = query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
    }

    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[GuildDB] fetchPosts:', err);
    return [];
  }
}

/**
 * Publish a new post.
 * Called from Creator Editor → Publish button.
 */
export async function publishPost(postData) {
  const user   = getCurrentUser();
  const player = getCurrentPlayer();

  if (!user) throw new Error('Not logged in');
  if (!player?.isCreator) throw new Error('Creator ID required');

  const post = {
    title:       postData.title,
    excerpt:     postData.excerpt,
    content:     postData.content,
    category:    postData.category,
    tags:        postData.tags || [],
    coverImage:  postData.coverImage || null,
    ytUrl:       postData.ytUrl || null,
    authorId:    user.uid,
    authorName:  player.username,
    status:      'published',
    views:       0,
    likes:       0,
    createdAt:   serverTimestamp(),
    updatedAt:   serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'posts'), post);

  // Award XP for publishing
  await awardXP(user.uid, 80, 'News Contribution');

  console.log('[GuildDB] Post published:', docRef.id);
  return docRef.id;
}

/**
 * Save post as draft.
 */
export async function saveDraft(postData, existingDraftId = null) {
  const user = getCurrentUser();
  if (!user) return;

  const draft = {
    ...postData,
    authorId:  user.uid,
    status:    'draft',
    updatedAt: serverTimestamp(),
  };

  if (existingDraftId) {
    await updateDoc(doc(db, 'posts', existingDraftId), draft);
    return existingDraftId;
  } else {
    draft.createdAt = serverTimestamp();
    const ref = await addDoc(collection(db, 'posts'), draft);
    return ref.id;
  }
}


/* ═══════════════════════════════════════
   ② QUEST RESULTS — Scores
═══════════════════════════════════════ */

/**
 * Save a completed quest result.
 * Called from quest-arena.html after the quiz ends.
 *
 * @param {object} result
 */
export async function saveQuestResult(result) {
  const user = getCurrentUser();
  if (!user) return; // guest play — no save

  const resultDoc = {
    userId:    user.uid,
    questId:   result.questId,
    questName: result.questName,
    score:     result.score,
    correct:   result.correct,
    total:     result.total,
    accuracy:  result.accuracy,
    grade:     result.grade,
    xpEarned:  result.xpEarned,
    answers:   result.answers,
    playedAt:  serverTimestamp(),
  };

  // Save result document
  await addDoc(collection(db, 'quest_results'), resultDoc);

  // Update player stats
  await updateDoc(doc(db, 'players', user.uid), {
    questsDone: increment(1),
    score:      increment(result.score),
    xp:         increment(result.xpEarned),
  });

  // Update leaderboard
  await updateLeaderboard(user.uid, result.score);

  // Check for level up
  await checkLevelUp(user.uid);

  console.log('[GuildDB] Quest result saved:', resultDoc);
}

/**
 * Fetch leaderboard — top 10 players by score.
 */
export async function fetchLeaderboard(limitCount = 10) {
  try {
    const q = query(
      collection(db, 'players'),
      orderBy('score', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d, i) => ({ rank: i + 1, id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[GuildDB] fetchLeaderboard:', err);
    return [];
  }
}

/**
 * Real-time leaderboard listener.
 * Use this on dashboard/home to auto-update ranks.
 *
 * @param {function} callback - called with updated leaderboard array
 * @returns unsubscribe function
 */
export function listenLeaderboard(callback, limitCount = 10) {
  const q = query(
    collection(db, 'players'),
    orderBy('score', 'desc'),
    limit(limitCount)
  );

  return onSnapshot(q, (snap) => {
    const board = snap.docs.map((d, i) => ({ rank: i + 1, id: d.id, ...d.data() }));
    callback(board);
  });
}

/* ═══════════════════════════════════════
   ③ LEADERBOARD UPDATE
═══════════════════════════════════════ */
async function updateLeaderboard(uid, scoreToAdd) {
  const ref = doc(db, 'players', uid);
  await updateDoc(ref, { score: increment(scoreToAdd) });
}


/* ═══════════════════════════════════════
   ④ XP & LEVEL SYSTEM
═══════════════════════════════════════ */

const RANK_THRESHOLDS = {
  E:  { xp: 0,      next: 'D',  xpToNext: 1000  },
  D:  { xp: 1000,   next: 'C',  xpToNext: 3000  },
  C:  { xp: 3000,   next: 'B',  xpToNext: 6000  },
  B:  { xp: 6000,   next: 'A',  xpToNext: 12000 },
  A:  { xp: 12000,  next: 'S',  xpToNext: 25000 },
  S:  { xp: 25000,  next: 'SS', xpToNext: 50000 },
  SS: { xp: 50000,  next: null, xpToNext: null  },
};

export async function awardXP(uid, amount, reason = '') {
  const playerRef = doc(db, 'players', uid);
  await updateDoc(playerRef, { xp: increment(amount) });
  console.log(`[GuildDB] +${amount} XP awarded to ${uid} for: ${reason}`);
  await checkLevelUp(uid);
}

async function checkLevelUp(uid) {
  const snap   = await getDoc(doc(db, 'players', uid));
  const player = snap.data();

  let { xp, level, rank } = player;
  const threshold = RANK_THRESHOLDS[rank];
  if (!threshold || !threshold.xpToNext) return;

  // Level up every 500 XP
  const newLevel = Math.floor(xp / 500) + 1;

  // Rank up check
  let newRank = rank;
  if (xp >= threshold.xp + threshold.xpToNext && threshold.next) {
    newRank = threshold.next;
    console.log('[GuildDB] RANK UP!', rank, '→', newRank);
  }

  if (newLevel !== level || newRank !== rank) {
    await updateDoc(doc(db, 'players', uid), {
      level: newLevel,
      rank:  newRank,
    });
  }
}


/* ═══════════════════════════════════════
   ⑤ CREATOR APPLICATIONS
═══════════════════════════════════════ */

/**
 * Submit Creator ID application.
 * Called from dashboard.html multi-step form.
 */
export async function submitCreatorApplication(formData) {
  const user = getCurrentUser();
  if (!user) throw new Error('Must be logged in to apply');

  const app = {
    uid:          user.uid,
    displayName:  formData.displayName,
    realName:     formData.realName,
    category:     formData.category,
    bio:          formData.bio,
    platforms: {
      youtube:   formData.youtube   || null,
      facebook:  formData.facebook  || null,
      instagram: formData.instagram || null,
    },
    followerCount:  formData.followerCount,
    contentPlan:    formData.contentPlan,
    postFrequency:  formData.postFrequency,
    whyShouldWe:    formData.whyShouldWe,
    oathAccepted:   true,
    status:         'pending',       // 'pending' | 'approved' | 'rejected'
    submittedAt:    serverTimestamp(),
    reviewedAt:     null,
    reviewedBy:     null,
    reviewNotes:    null,
  };

  const docRef = await addDoc(collection(db, 'creator_apps'), app);
  console.log('[GuildDB] Creator application submitted:', docRef.id);
  return docRef.id;
}

/**
 * Check if current player already has a pending/approved application.
 */
export async function getCreatorApplicationStatus(uid) {
  const q    = query(collection(db, 'creator_apps'), where('uid', '==', uid), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data().status;
}


/* ═══════════════════════════════════════
   ⑥ GALLERY / FAN ART
═══════════════════════════════════════ */

/**
 * Upload fan art image to Firebase Storage, then save metadata to Firestore.
 *
 * @param {File}   file       - image file from input
 * @param {object} metadata   - title, artist, tags, etc.
 * @param {function} onProgress - callback(percent)
 */
export async function uploadGalleryImage(file, metadata, onProgress) {
  const user = getCurrentUser();
  if (!user) throw new Error('Must be logged in to upload');

  // 1. Upload to Storage: gallery/{uid}/{timestamp}_{filename}
  const storageRef = ref(storage, `gallery/${user.uid}/${Date.now()}_${file.name}`);
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    uploadTask.on('state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (onProgress) onProgress(pct);
      },
      (err) => reject(err),
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

        // 2. Save metadata to Firestore: gallery/{docId}
        const docRef = await addDoc(collection(db, 'gallery'), {
          uid:         user.uid,
          authorName:  getCurrentPlayer()?.username || 'Unknown',
          title:       metadata.title,
          tags:        metadata.tags || [],
          imageUrl:    downloadURL,
          storagePath: storageRef.fullPath,
          likes:       0,
          uploadedAt:  serverTimestamp(),
        });

        resolve({ id: docRef.id, imageUrl: downloadURL });
      }
    );
  });
}

/**
 * Fetch gallery images, newest first.
 */
export async function fetchGallery(limitCount = 20) {
  try {
    const q    = query(collection(db, 'gallery'), orderBy('uploadedAt', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[GuildDB] fetchGallery:', err);
    return [];
  }
}


/* ═══════════════════════════════════════
   ⑦ QUESTS — Fetch from Firestore
═══════════════════════════════════════ */

/**
 * Fetch all active quests for the Quest Board.
 * [Beru] Replace static QUESTIONS array in quest-arena.html with this.
 */
export async function fetchQuests(limitCount = 12) {
  try {
    const q    = query(collection(db, 'quests'), where('active', '==', true), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[GuildDB] fetchQuests:', err);
    return [];
  }
}

/**
 * Fetch questions for a specific quest.
 * Returns array sorted by order field.
 */
export async function fetchQuestQuestions(questId) {
  try {
    const q    = query(
      collection(db, 'quests', questId, 'questions'),
      orderBy('order', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[GuildDB] fetchQuestQuestions:', err);
    return [];
  }
}

/**
 * Fetch player's personal best for a quest.
 */
export async function getPlayerBestScore(questId) {
  const user = getCurrentUser();
  if (!user) return null;

  const q    = query(
    collection(db, 'quest_results'),
    where('userId',  '==', user.uid),
    where('questId', '==', questId),
    orderBy('score', 'desc'),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data();
}


/* ═══════════════════════════════════════
   ⑧ HALL OF FAME — Top 10
═══════════════════════════════════════ */

/**
 * Fetch season leaderboard for Hall of Fame page.
 */
export async function fetchHallOfFame(season = 'season3', limitCount = 10) {
  try {
    const q    = query(
      collection(db, 'players'),
      orderBy('score', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d, i) => ({ rank: i + 1, ...d.data() }));
  } catch (err) {
    console.error('[GuildDB] fetchHallOfFame:', err);
    return [];
  }
}


/* ═══════════════════════════════════════
   ⑨ HELPER — Render Leaderboard into DOM
   Drop this function call into any page
   that has a leaderboard list element.
═══════════════════════════════════════ */
export function renderLeaderboardIntoDOM(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Show loading state
  container.innerHTML = '<div style="padding:16px;text-align:center;font-family:\'Orbitron\',monospace;font-size:.65rem;color:var(--ghost)">Loading Rankings...</div>';

  const unsubscribe = listenLeaderboard((board) => {
    if (board.length === 0) {
      container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--ghost);font-size:.8rem">No rankings yet. Play a Quest!</div>';
      return;
    }

    const rankIcons   = ['👑', '🌙', '⚡', '🗡️', '🌸', '🔥', '🎯', '🐉', '⭐', '🌊'];
    const rankClasses = ['rank-1', 'rank-2', 'rank-3'];

    container.innerHTML = board.map((p, i) => `
      <div class="rank-item ${rankClasses[i] || 'rank-other'}">
        <div class="rank-num">${i + 1}</div>
        <div class="rank-avatar">${rankIcons[i] || '•'}</div>
        <div class="rank-info">
          <div class="rank-name">${p.username || 'Unknown'}</div>
          <div class="rank-level">LVL <strong>${p.level || 1}</strong> · ${p.rank || 'E'}-Class</div>
        </div>
        <div class="rank-score">${(p.score || 0).toLocaleString()}</div>
      </div>
    `).join('');
  });

  // Return unsubscribe so caller can clean up on page leave
  return unsubscribe;
}
