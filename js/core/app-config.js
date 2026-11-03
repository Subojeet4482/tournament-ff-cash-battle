/**
 * ONE place for the settings you may need to change.
 *
 * CHAT_FIREBASE_CONFIG — web config of the separate CHAT Firebase project (tournament2-75029).
 * CHAT_TOKEN_URL       — the Main Admin Panel (service 1) token endpoint, e.g.
 *                        "https://YOUR-MAIN-PANEL.onrender.com/api/chat/token"
 *                        >>> FILL THIS IN. Until it is set, chat keeps running inside the MAIN project. <<<
 * CHAT_TTL_HOURS       — default life of a chat message (admin can change it live in Chat Manager -> World settings).
 */
export const CHAT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBW8cLulCXc4zwBgs3xHJFF3GvafFRqA0A",
    authDomain: "tournament2-75029.firebaseapp.com",
    projectId: "tournament2-75029",
    storageBucket: "tournament2-75029.firebasestorage.app",
    messagingSenderId: "505785259739",
    appId: "1:505785259739:web:143cf42fca376e5cd21efe",
    measurementId: "G-4KR4L4PZTP"
};
export const CHAT_TOKEN_URL = "";
export const CHAT_TTL_HOURS = 24;

/** 4 Ball Match runs on the Main Admin Panel (same server as chat tokens). Derived automatically from CHAT_TOKEN_URL. */
export const GAME_API = CHAT_TOKEN_URL ? CHAT_TOKEN_URL.replace(/\/api\/chat\/token\/?$/, '') + '/api/ball' : '';
