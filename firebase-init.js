// firebase-init.js
// ملف موحّد لتهيئة Firebase (يتستخدم في كل صفحات المشروع)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  arrayUnion,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

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

// الـ Analytics ممكن يفشل لو الموقع شغال محليًا (localhost/file)، فبنحميه
try {
  getAnalytics(app);
} catch (e) {
  console.warn("Analytics غير متاح في البيئة الحالية:", e);
}

const db = getFirestore(app);
const auth = getAuth(app);

/**
 * بيرجع Promise بحالة تسجيل الدخول الحالية في Firebase Auth (أول مرة بس،
 * بعدين بيقفل نفسه). لازم يتستنى قبل أي قراءة/كتابة في Firestore محمية
 * بقاعدة "request.auth != null".
 */
function waitForAuthUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

/**
 * بيتأكد إن فيه مستخدم مسجل دخول (anonymous) في Firebase Auth، ولو مفيش
 * بيعمل signInAnonymously تلقائيًا. ده بيوفر request.auth.uid حقيقي
 * تقدر Firestore Rules تعتمد عليه بدل قاعدة "allow read, write: if true".
 *
 * ملحوظة مهمة: ده بيقفل ثغرة "أي حد يقرا/يمسح الداتا بيز من غير أي
 * تسجيل دخول أصلاً"، لكنه لسه مش بديل كامل عن تحقق سيرفري حقيقي من
 * ملكية الإيميل (ده محتاج Cloud Function + Custom Token).
 */
async function ensureAuthenticated() {
  const existing = await waitForAuthUser();
  if (existing) return existing;
  const result = await signInAnonymously(auth);
  return result.user;
}

export {
  db,
  auth,
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  arrayUnion,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
  waitForAuthUser,
  ensureAuthenticated
};
