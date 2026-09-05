/**
 * ChatZone - settings.js (Clean Rebuilt 100% - FIXED)
 */

import {
  db, doc, getDoc, setDoc, auth, ensureAuthenticated
} from './firebase-init.js';

const $ = (id) => document.getElementById(id);
const myEmail = (localStorage.getItem('cz_verified_email') || '').toLowerCase();

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('cz_theme', theme);
  document.querySelectorAll('.theme-opt').forEach(el => {
    el.classList.toggle('selected', el.dataset.theme === theme);
  });
}

function initThemes() {
  const saved = localStorage.getItem('cz_theme') || 'dark';
  applyTheme(saved);
  document.querySelectorAll('.theme-opt').forEach(el => {
    el.addEventListener('click', () => {
      applyTheme(el.dataset.theme);
      closeSheet('sheet-themes');
    });
  });
}

function applyLang(lang) {
  localStorage.setItem('cz_lang', lang);
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  document.querySelectorAll('.lang-opt').forEach(el => {
    el.classList.toggle('selected', el.dataset.lang === lang);
  });
}

function initLanguage() {
  const saved = localStorage.getItem('cz_lang') || 'ar';
  applyLang(saved);
  document.querySelectorAll('.lang-opt').forEach(el => {
    el.addEventListener('click', () => {
      applyLang(el.dataset.lang);
      closeSheet('sheet-language');
    });
  });
}

async function loadPrivacySettings() {
  if (!myEmail) return;
  try {
    const userRef = doc(db, 'users', myEmail);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      const photoSwitch = $('privacySwitch-hidePhotoFromOthers');
      const readSwitch = $('privacySwitch-hideReadReceipts');
      if (photoSwitch) photoSwitch.checked = data.hidePhotoFromOthers || false;
      if (readSwitch) readSwitch.checked = data.hideReadReceipts || false;
    }
  } catch (e) {
    console.warn('تعذّر تحميل حالة إخفاء صورة البروفايل:', e);
  }
}

async function updatePrivacySetting(field, value) {
  if (!myEmail) return;
  try {
    const userRef = doc(db, 'users', myEmail);
    await setDoc(userRef, { [field]: value }, { merge: true });
  } catch (e) {
    console.warn('فشل تحديث إخفاء صورة البروفايل:', e);
  }
}

function initPrivacySwitches() {
  const photoSwitch = $('privacySwitch-hidePhotoFromOthers');
  const readSwitch = $('privacySwitch-hideReadReceipts');
  if (photoSwitch) {
    photoSwitch.addEventListener('change', (e) => updatePrivacySetting('hidePhotoFromOthers', e.target.checked));
  }
  if (readSwitch) {
    readSwitch.addEventListener('change', (e) => updatePrivacySetting('hideReadReceipts', e.target.checked));
  }
  loadPrivacySettings();
}

function openSheet(id) {
  const sheet = document.getElementById(id);
  if (sheet) sheet.classList.add('active');
}

function closeSheet(id) {
  if (id) {
    const sheet = document.getElementById(id);
    if (sheet) sheet.classList.remove('active');
  } else {
    document.querySelectorAll('.sheet-overlay').forEach(s => s.classList.remove('active'));
  }
}

function initSheets() {
  document.querySelectorAll('[data-open-sheet]').forEach(btn => {
    btn.addEventListener('click', () => openSheet(btn.getAttribute('data-open-sheet')));
  });
  document.querySelectorAll('[data-close-sheet]').forEach(btn => {
    btn.addEventListener('click', () => closeSheet(btn.getAttribute('data-close-sheet')));
  });
}

function initNavigation() {
  const navMap = {
    openThemes: 'sheet-themes',
    openLanguage: 'sheet-language',
    openPrivacy: 'sheet-privacy',
    openVersion: 'sheet-version',
    openAbout: 'sheet-about'
  };
  Object.keys(navMap).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => openSheet(navMap[id]));
  });
}

async function init() {
  await ensureAuthenticated();
  initThemes();
  initLanguage();
  initPrivacySwitches();
  initSheets();
  initNavigation();
}

init();
