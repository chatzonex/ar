/**
 * ChatZone - firebase-init.js (Clean)
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, deleteField,
  arrayUnion, arrayRemove, collection, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, enableNetwork, disableNetwork, writeBatch
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {
  getAuth, signInAnonymously, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, deleteUser
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyDFgxjZgoaP7Q7vSUjXOJvM1-UIRYIEsyk",
  authDomain: "chatzone-b296a.firebaseapp.com",
  projectId: "chatzone-b296a",
  storageBucket: "chatzone-b296a.firebasestorage.app",
  messagingSenderId: "157945849107",
  appId: "1:157945849107:web:e1aa8f36f1bca9a7ab66e6",
  measurementId: "G-DYPL4KPMXX"
};

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch(e) {}
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch(e) {
  db = initializeFirestore(app, {});
}
const auth = getAuth(app);

function waitForAuthUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
  });
}

async function ensureAuthenticated() {
  try {
    const existing = await new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
    });
    if (existing) return existing;
  } catch(e) {}
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch(e) { return null; }
}

async function signInAdmin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export {
  db, auth, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, deleteField,
  arrayUnion, arrayRemove, collection, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, enableNetwork, disableNetwork, writeBatch,
  signInAnonymously, signInWithEmailAndPassword, onAuthStateChanged, signOut, deleteUser,
  waitForAuthUser, ensureAuthenticated, signInAdmin
};
