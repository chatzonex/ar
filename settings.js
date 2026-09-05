/**
 * ChatZone - settings.js (Clean Rebuilt 100%)
 * نسخة نضيفة بدون أي تشفير - تحل كل مشاكل _0x27a145 is not a function
 */

import {
  db, doc, getDoc, setDoc, updateDoc, auth, onAuthStateChanged,
  ensureAuthenticated
} from './firebase-init.js';

const $ = (id) => document.getElementById(id);
const myEmail = (localStorage.getItem('cz_verified_email') || '').toLowerCase();

// ===== Theme Handling =====
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

// ===== Language =====
function applyLang(lang) {
  localStorage.setItem('cz_lang', lang);
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
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

// ===== Privacy Switches =====
async function loadPrivacySettings() {
  if (!myEmail) return;
  try {
    const userRef = doc(db, 'users', myEmail);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      const hidePhoto = data.hidePhotoFromOthers || false;
      const hideRead = data.hideReadReceipts || false;
      
      const photoSwitch = $('privacySwitch-hidePhotoFromOthers');
      const readSwitch = $('privacySwitch-hideReadReceipts');
      
      if (photoSwitch) photoSwitch.checked = hidePhoto;
      if (readSwitch) readSwitch.checked = hideRead;
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
    showToast('تم الحفظ');
  } catch (e) {
    console.error('فشل تحديث إخفاء صورة البروفايل:', e);
    showToast('فشل الحفظ');
  }
}

function initPrivacySwitches() {
  const photoSwitch = $('privacySwitch-hidePhotoFromOthers');
  const readSwitch = $('privacySwitch-hideReadReceipts');
  
  if (photoSwitch) {
    photoSwitch.addEventListener('change', (e) => {
      updatePrivacySetting('hidePhotoFromOthers', e.target.checked);
    });
  }
  
  if (readSwitch) {
    readSwitch.addEventListener('change', (e) => {
      updatePrivacySetting('hideReadReceipts', e.target.checked);
    });
  }
  
  loadPrivacySettings();
}

// ===== Liquid Glass Effects =====
function initLiquidGlass() {
  const isVIP = localStorage.getItem('cz_is_vip') === 'true';
  
  ['bottombar', 'icons', 'chat'].forEach(key => {
    const switchEl = $(`lg-${key}`);
    if (switchEl) {
      const saved = localStorage.getItem(`cz_lg_${key}`) === 'true';
      switchEl.checked = saved;
      switchEl.disabled = !isVIP;
      
      switchEl.addEventListener('change', (e) => {
        if (!isVIP) {
          showToast('الخاصية دي لمشتركي VIP بس');
          e.target.checked = false;
          return;
        }
        localStorage.setItem(`cz_lg_${key}`, e.target.checked);
        applyLiquidGlass();
      });
    }
  });
}

function applyLiquidGlass() {
  const bottombar = localStorage.getItem('cz_lg_bottombar') === 'true';
  const icons = localStorage.getItem('cz_lg_icons') === 'true';
  const chat = localStorage.getItem('cz_lg_chat') === 'true';
  
  document.documentElement.classList.toggle('lg-bottombar-on', bottombar);
  document.documentElement.classList.toggle('lg-icons-on', icons);
  document.documentElement.classList.toggle('lg-chat-on', chat);
}

// ===== Ghost Mode & Airplane Mode =====
function initGhostAndAirplane() {
  const ghostSwitch = $('ghostModeSwitch');
  const airplaneSwitch = $('airplaneModeSwitch');
  
  if (ghostSwitch) {
    const saved = localStorage.getItem('cz_ghost_mode') === 'true';
    ghostSwitch.checked = saved;
    
    ghostSwitch.addEventListener('change', (e) => {
      if (e.target.checked) {
        if (!confirm('تفعيل وضع الشبح؟\nردودك هتوصل عادي، لكن هتفضل ظاهر عند الطرف التاني تيك واحد بس لحد ما تلغي الوضع')) {
          e.target.checked = false;
          return;
        }
      }
      localStorage.setItem('cz_ghost_mode', e.target.checked);
      showToast(e.target.checked ? 'تم تفعيل وضع الشبح' : 'تم إلغاء وضع الشبح');
    });
  }
  
  if (airplaneSwitch) {
    const saved = localStorage.getItem('cz_airplane_mode') === 'true';
    airplaneSwitch.checked = saved;
    
    airplaneSwitch.addEventListener('change', (e) => {
      if (e.target.checked) {
        if (!confirm('تفعيل وضع الطيران؟\nهتتقطع عن الإنترنت جوه التطبيق تمامًا، ومش هتوصلك أي رسايل جديدة لحد ما تلغيه')) {
          e.target.checked = false;
          return;
        }
      } else {
        if (!confirm('إلغاء وضع الطيران؟\nهترجع تتصل بالإنترنت جوه التطبيق عادي وهتوصلك الرسايل تاني')) {
          e.target.checked = true;
          return;
        }
      }
      localStorage.setItem('cz_airplane_mode', e.target.checked);
      showToast(e.target.checked ? 'تم تفعيل وضع الطيران' : 'تم إلغاء وضع الطيران');
    });
  }
}

// ===== Sheets =====
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
    btn.addEventListener('click', () => {
      openSheet(btn.getAttribute('data-open-sheet'));
    });
  });
  
  document.querySelectorAll('[data-close-sheet]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close-sheet');
      closeSheet(id);
    });
  });
  
  document.querySelectorAll('.sheet-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });
}

// ===== Navigation =====
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
    if (el) {
      el.addEventListener('click', () => openSheet(navMap[id]));
    }
  });
}

// ===== Toast =====
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

// ===== Init =====
async function init() {
  await ensureAuthenticated();
  initThemes();
  initLanguage();
  initPrivacySwitches();
  initLiquidGlass();
  initGhostAndAirplane();
  initSheets();
  initNavigation();
  applyLiquidGlass();
}

init();
