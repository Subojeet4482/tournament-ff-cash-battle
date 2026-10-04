/**
 * Firebase bootstrap — single place for config + SDK imports.
 * Every other module imports what it needs from here.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, collectionGroup, getDocs, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, query, orderBy, limit, addDoc, where, deleteDoc, serverTimestamp, onSnapshot, increment, runTransaction, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

    const firebaseConfig = {
    apiKey: "AIzaSyA1DJ5TQaK8HxasfTwKHNTxgNPHRCy4KRY",
    authDomain: "tournament-e8da7.firebaseapp.com",
    projectId: "tournament-e8da7",
    storageBucket: "tournament-e8da7.firebasestorage.app",
    messagingSenderId: "461449506021",
    appId: "1:461449506021:web:93cab101e9d382f8a2f80c"
};

export const appInstance = initializeApp(firebaseConfig);
export const authService = getAuth(appInstance);
export const dbService = getFirestore(appInstance);
export const storageService = getStorage(appInstance);

export {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut,
    updateProfile, EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail,
    GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
    getFirestore, collection, collectionGroup, getDocs, doc, setDoc, getDoc, updateDoc,
    arrayUnion, arrayRemove, query, orderBy, limit, addDoc, where, deleteDoc,
    serverTimestamp, onSnapshot, increment, runTransaction, writeBatch,
    getStorage, sRef, uploadBytes, getDownloadURL, deleteObject
};
