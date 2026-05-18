/**
 * ═══════════════════════════════════════════════════
 *  ANIME AAWAJ GUILD — Firebase Core Configuration
 *  Iron (Shield of Structure) — Phase 5A
 * ═══════════════════════════════════════════════════
 *
 *  ⚠️  SECURITY: Replace with your actual config.
 *      Never commit real API keys to public GitHub.
 *      Use Firebase security rules (see guild-rules.txt).
 *
 *  HOW TO USE in any HTML page:
 *  ─────────────────────────────
 *  <!-- Step 1: Add these 3 script tags BEFORE closing </body> -->
 *  <script src="js/firebase-config.js"></script>
 *  <script src="js/guild-auth.js"></script>
 *  <script src="js/guild-db.js"></script>
 */

// ── Firebase SDK via CDN (v10 modular compat build) ──
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAaTQ6ndxg8Q7Jgi69NBf1st1ZqVMSKUR4",
  authDomain: "anime-aawaj.firebaseapp.com",
  projectId: "anime-aawaj",
  storageBucket: "anime-aawaj.firebasestorage.app",
  messagingSenderId: "1010486828289",
  appId: "1:1010486828289:web:708b9aea2cda5ad34bcf00",
  measurementId: "G-HWE3NR7XRF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// ── Export everything so other JS files can import ──
export { app, auth, db, storage, analytics };
