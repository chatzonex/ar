/**
 * ChatZone - main.js (Clean Rebuilt 100%)
 * نسخة نضيفة بدون تشفير - تحل مشكلة _0x29514d is not defined
 */

import {
  db, doc, getDoc, getDocs, collection, query, where, orderBy, onSnapshot,
  serverTimestamp, ensureAuthenticated
} from './firebase-init.js';

const $ = (id) => document.getElementById(id);
const myEmail = (localStorage.getItem('cz_verified_email') || '').toLowerCase();

let chatsCache = [];
let groupsCache = [];
let currentTab = 'chats';

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'الآن';
  if (diff < 3600000) return Math.floor(diff/60000) + ' د';
  if (diff < 86400000) return Math.floor(diff/3600000) + ' س';
  return d.toLocaleDateString('ar-EG');
}

// ===== Load Chats =====
async function loadChats() {
  if (!myEmail) return;
  
  try {
    const chatsRef = collection(db, 'chats');
    const q = query(chatsRef, where('participants', 'array-contains', myEmail), orderBy('updatedAt', 'desc'));
    
    onSnapshot(q, async (snapshot) => {
      chatsCache = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (data.isGroup || data.type === 'group') continue; // Skip groups
        
        // Get other participant
        const otherEmail = (data.participants || []).find(e => e !== myEmail) || '';
        let otherName = otherEmail;
        let otherPhoto = null;
        
        if (otherEmail) {
          try {
            const userRef = doc(db, 'users', otherEmail);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const userData = userSnap.data();
              otherName = userData.name || userData.displayName || otherEmail;
              otherPhoto = userData.photoURL || userData.photo || null;
            }
          } catch(e) {}
        }
        
        chatsCache.push({
          id: docSnap.id,
          otherEmail,
          otherName,
          otherPhoto,
          ...data
        });
      }
      if (currentTab === 'chats') renderChats(chatsCache);
    });
  } catch (e) {
    console.error('loadChats error', e);
  }
}

function renderChats(chats) {
  const container = $('chatsList') || $('mainChatsList');
  if (!container) return;
  
  if (chats.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <div class="empty-title">لا يوجد دردشات</div>
        <div class="empty-sub">ابدأ محادثة بإيميل جديد</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  chats.forEach(chat => {
    const div = document.createElement('div');
    div.className = 'chat-item';
    div.innerHTML = `
      <div class="chat-avatar">
        ${chat.otherPhoto ? `<img src="${chat.otherPhoto}" alt="">` : `<span>${escapeHtml((chat.otherName || '?')[0].toUpperCase())}</span>`}
      </div>
      <div class="chat-info">
        <div class="chat-name">${escapeHtml(chat.otherName || chat.otherEmail)}</div>
        <div class="chat-last-msg">${escapeHtml((chat.lastMessage || '').slice(0, 40))}</div>
      </div>
      <div class="chat-meta">
        <div class="chat-time">${formatTime(chat.updatedAt || chat.lastMessageAt)}</div>
        ${chat.unreadCount ? `<div class="chat-unread">${chat.unreadCount}</div>` : ''}
      </div>
    `;
    div.addEventListener('click', () => {
      window.location.href = `conversation.html?email=${encodeURIComponent(chat.otherEmail)}&chatId=${encodeURIComponent(chat.id)}`;
    });
    container.appendChild(div);
  });
}

// ===== Load Groups =====
async function loadGroups() {
  if (!myEmail) return;
  
  try {
    const groupsRef = collection(db, 'groups');
    const q = query(groupsRef, where('members', 'array-contains', myEmail), orderBy('updatedAt', 'desc'));
    
    onSnapshot(q, (snapshot) => {
      groupsCache = [];
      snapshot.forEach(docSnap => {
        groupsCache.push({ id: docSnap.id, ...docSnap.data() });
      });
      if (currentTab === 'groups') renderGroups(groupsCache);
    });
  } catch (e) {
    console.error('loadGroups error', e);
  }
}

function renderGroups(groups) {
  const container = $('groupsList') || $('mainGroupsList');
  if (!container) return;
  
  if (groups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <div class="empty-title">No groups yet</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  groups.forEach(group => {
    const div = document.createElement('div');
    div.className = 'group-item';
    div.innerHTML = `
      <div class="group-avatar">
        <span>${escapeHtml((group.name || '?')[0].toUpperCase())}</span>
      </div>
      <div class="group-info">
        <div class="group-name">${escapeHtml(group.name || 'جروب')}</div>
        <div class="group-last-msg">${escapeHtml((group.lastMessage || '').slice(0, 40))}</div>
      </div>
      <div class="group-meta">
        <div class="group-time">${formatTime(group.updatedAt)}</div>
        <div class="group-count">${group.members?.length || 0} عضو</div>
      </div>
    `;
    div.addEventListener('click', () => {
      window.location.href = `conv-group.html?id=${encodeURIComponent(group.id)}`;
    });
    container.appendChild(div);
  });
}

// ===== Tabs =====
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn, [data-tab]');
  const chatsContainer = $('chatsList') || $('mainChatsList');
  const groupsContainer = $('groupsList') || $('mainGroupsList');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab || btn.getAttribute('data-tab');
      if (!tab) return;
      
      currentTab = tab;
      
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      if (chatsContainer && groupsContainer) {
        if (tab === 'chats') {
          chatsContainer.style.display = 'block';
          groupsContainer.style.display = 'none';
          renderChats(chatsCache);
        } else if (tab === 'groups') {
          chatsContainer.style.display = 'none';
          groupsContainer.style.display = 'block';
          renderGroups(groupsCache);
        }
      }
    });
  });
}

// ===== Search =====
function initSearch() {
  const searchInput = $('mainSearchInput') || $('searchInput');
  if (!searchInput) return;
  
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    if (currentTab === 'chats') {
      const filtered = chatsCache.filter(c => 
        (c.otherName || '').toLowerCase().includes(q) ||
        (c.otherEmail || '').toLowerCase().includes(q) ||
        (c.lastMessage || '').toLowerCase().includes(q)
      );
      renderChats(filtered);
    } else {
      const filtered = groupsCache.filter(g => 
        (g.name || '').toLowerCase().includes(q)
      );
      renderGroups(filtered);
    }
  });
}

// ===== New Chat =====
function initNewChat() {
  const newChatBtn = $('newChatBtn') || $('openNewChatSheet');
  const newChatSheet = $('sheet-new-chat');
  const startChatBtn = $('startChatBtn');
  const emailInput = $('newChatEmailInput');
  
  if (newChatBtn && newChatSheet) {
    newChatBtn.addEventListener('click', () => {
      newChatSheet.classList.add('active');
    });
  }
  
  if (startChatBtn && emailInput) {
    startChatBtn.addEventListener('click', () => {
      const email = emailInput.value.trim().toLowerCase();
      if (!email) {
        showToast('اكتب الإيميل اللي هتكلمه');
        return;
      }
      if (email === myEmail) {
        showToast('ما ينفعش تكلم نفسك');
        return;
      }
      window.location.href = `conversation.html?email=${encodeURIComponent(email)}`;
    });
  }
  
  document.querySelectorAll('[data-close-sheet]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close-sheet');
      const sheet = document.getElementById(id);
      if (sheet) sheet.classList.remove('active');
    });
  });
}

// ===== Bottom Bar =====
function initBottomBar() {
  const bottomBar = document.querySelector('.bottombar');
  if (!bottomBar) return;
  
  const isLg = localStorage.getItem('cz_lg_bottombar') === 'true';
  bottomBar.classList.toggle('lg-bottombar-on', isLg);
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

// ===== Fix hidden-chats permissions error =====
async function loadHiddenChats() {
  try {
    const hiddenRef = doc(db, 'users', myEmail, 'settings', 'hiddenChats');
    const snap = await getDoc(hiddenRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (e) {
    if (e.code === 'permission-denied' || e.message.includes('Missing or insufficient permissions')) {
      console.warn('فشل تحميل بيانات باسورد الشاتات المخفية: ليس لديك صلاحية، سيتم إنشاء الإعدادات الافتراضية');
      // Create default settings if not exists
      try {
        const hiddenRef = doc(db, 'users', myEmail, 'settings', 'hiddenChats');
        await setDoc(hiddenRef, { enabled: false, password: '' }, { merge: true });
      } catch(e2) {
        console.warn('فشل إنشاء إعدادات الشاتات المخفية:', e2);
      }
      return { enabled: false };
    }
    console.error('فشل تحميل بيانات باسورد الشاتات المخفية:', e);
  }
  return null;
}

// ===== Init =====
async function init() {
  if (!myEmail) {
    window.location.href = 'index.html';
    return;
  }
  
  await ensureAuthenticated();
  await loadHiddenChats();
  loadChats();
  loadGroups();
  initTabs();
  initSearch();
  initNewChat();
  initBottomBar();
  
  // Apply theme
  const theme = localStorage.getItem('cz_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

init();
