/**
 * Chat database connection.
 *
 * SEPARATE CHAT PROJECT (recommended):
 *   1. Create a 2nd Firebase project, enable Firestore + Authentication (no providers needed, custom tokens are used)
 *   2. Paste its WEB config below and your admin server token URL, e.g. https://your-admin.onrender.com/api/chat/token
 *   3. On the admin server add the env key FIREBASE_CREDENTIALS_B641 (service-account JSON of the chat project, base64)
 *   4. Publish chat.firestore.rules in the chat project
 * The chat web config now lives in js/core/app-config.js (together with CHAT_TOKEN_URL).
 * Until CHAT_TOKEN_URL is filled in, chat runs inside the MAIN project (same c* collections) — then the optional chat block of
 * FIREBASE_CREDENTIALS_B64.txt must be published. Once the separate project is set up, that block can be removed.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { authService, dbService } from './firebase.js';

import { CHAT_FIREBASE_CONFIG, CHAT_TOKEN_URL, CHAT_TTL_HOURS } from './app-config.js';
export { CHAT_FIREBASE_CONFIG, CHAT_TOKEN_URL, CHAT_TTL_HOURS };

export const chatSeparate = !!(CHAT_FIREBASE_CONFIG.projectId && CHAT_TOKEN_URL);
let capp = null, cauth = null;
export let chatDb = dbService;
if (chatSeparate) {
    capp = initializeApp(CHAT_FIREBASE_CONFIG, 'chat'); cauth = getAuth(capp); chatDb = getFirestore(capp);
    // Optional analytics for the chat project (never blocks chat; silently skipped when unsupported / blocked)
    if (CHAT_FIREBASE_CONFIG.measurementId) {
        import("https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js")
            .then(async (m) => { if (await m.isSupported()) m.getAnalytics(capp); })
            .catch(() => {});
    }
}

/** Makes sure the user is signed in to the chat project (same uid as the main app). */
export async function chatReady() {
    if (!chatSeparate) return true;
    const me = authService.currentUser; if (!me) throw new Error('Please login first');
    if (cauth.currentUser && cauth.currentUser.uid === me.uid) return true;
    const idt = await me.getIdToken();
    const r = await fetch(CHAT_TOKEN_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + idt } });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || 'Chat server not reachable');
    await signInWithCustomToken(cauth, j.token);
    return true;
}

/* ---- Compatibility exports (so older/stale chat files never crash the app with "does not provide an export named ...") ---- */
export async function chatSyncVerified() { try { return await chatReady(); } catch (e) { return false; } }
export const chatSync = chatSyncVerified;
export const chatAuth = () => cauth;
export default { chatDb, chatReady, chatSeparate, chatSyncVerified };
