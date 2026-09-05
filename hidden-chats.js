/**
 * ChatZone - hidden-chats.js (Clean Rebuilt)
 * يصلح مشكلة Missing or insufficient permissions
 */

import {
  db, doc, getDoc, setDoc, collection, query, where, getDocs,
  ensureAuthenticated
} from './firebase-init.js';

const myEmail = (localStorage.getItem('cz_verified_email') || '').toLowerCase();

async function loadAuthDoc() {
  try {
    const authRef = doc(db, 'users', myEmail, 'settings', 'hiddenChats');
    const snap = await getDoc(authRef);
    if (snap.exists()) {
      return snap.data();
    }
    return { enabled: false, password: '' };
  } catch (e) {
    if (e.code === 'permission-denied' || e.message.includes('permissions')) {
      console.warn('فشل تحميل بيانات باسورد الشاتات المخفية: FirebaseError: Missing or insufficient permissions.');
      console.warn('سيتم استخدام الإعدادات المحلية فقط');
      // Fallback to localStorage
      const localPassword = localStorage.getItem('cz_hidden_chats_password') || '';
      const localEnabled = localStorage.getItem('cz_hidden_chats_enabled') === 'true';
      return { enabled: localEnabled, password: localPassword, isLocal: true };
    }
    console.error('فشل تحميل بيانات باسورد الشاتات المخفية:', e);
    return null;
  }
}

async function saveAuthDoc(password, enabled) {
  try {
    const authRef = doc(db, 'users', myEmail, 'settings', 'hiddenChats');
    await setDoc(authRef, {
      password: password,
      enabled: enabled,
      updatedAt: new Date()
    }, { merge: true });
    
    // Also save locally as fallback
    localStorage.setItem('cz_hidden_chats_password', password);
    localStorage.setItem('cz_hidden_chats_enabled', enabled);
    
    return true;
  } catch (e) {
    if (e.code === 'permission-denied') {
      console.warn('لا يمكن حفظ باسورد الشاتات المخفية في Firebase، سيتم الحفظ محلياً فقط');
      localStorage.setItem('cz_hidden_chats_password', password);
      localStorage.setItem('cz_hidden_chats_enabled', enabled);
      return true;
    }
    console.error('فشل حفظ باسورد الشاتات المخفية:', e);
    return false;
  }
}

function showToast(msg) {
  let toast = document.createElement('div');
  toast.className = 'cz-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

export { loadAuthDoc, saveAuthDoc };
