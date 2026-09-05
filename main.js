/**
 * ChatZone - main.js (Clean Rebuilt 100% - FIXED)
 * نسخة نضيفة بدون تشفير - تصلح كل مشاكل الـ permissions و setDoc
 */

import {
  db, doc, getDoc, getDocs, setDoc, collection, query, where, orderBy, onSnapshot,
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
    let q;
    try {
      q = query(chatsRef, where('participants', 'array-contains', myEmail), orderBy('updatedAt', 'desc'));
    } catch(e) {
      q = query(chatsRef, where('participants', 'array-contains', myEmail));
    }
    
    onSnapshot(q, async (snapshot) => {
      chatsCache = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (data.isGroup || data.type === 'group') continue;
        
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
    }, (err) => {
      if (err.code === 'permission-denied') {
        console.warn('loadChats: permission-denied, يرجى تحديث قواعد Firebase');
        renderChats([]);
      } else {
        console.warn('loadChats error', err);
      }
    });
  } catch (e) {
    console.warn('loadChats error', e);
  }
}

function renderChats(chats) {
  const container = document.getElementById('chatsList') || document.getElementById('mainChatsList');
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
    let q;
    try {
      q = query(groupsRef, where('members', 'array-contains', myEmail), orderBy('updatedAt', 'desc'));
    } catch(e) {
      q = query(groupsRef, where('members', 'array-contains', myEmail));
    }
    
    onSnapshot(q, (snapshot) => {
      groupsCache = [];
      snapshot.forEach(docSnap => {
        groupsCache.push({ id: docSnap.id, ...docSnap.data() });
      });
      if (currentTab === 'groups') renderGroups(groupsCache);
    }, (err) => {
      if (err.code === 'permission-denied') {
        console.warn('loadGroups: permission-denied, سيتم تحميل الجروبات من الشاتات');
      }
      loadGroupsFromChats();
    });
  } catch (e) {
    console.warn('loadGroups error', e);
    loadGroupsFromChats();
  }
}

async function loadGroupsFromChats() {
  try {
    const chatsRef = collection(db, 'chats');
    const q = query(chatsRef, where('participants', 'array-contains', myEmail));
    onSnapshot(q, (snapshot) => {
      groupsCache = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isGroup || data.type === 'group') {
          groupsCache.push({ id: docSnap.id, ...data });
        }
      });
      if (currentTab === 'groups') renderGroups(groupsCache);
      else if (groupsCache.length === 0) {
        // Still render empty if no groups tab
      }
    }, (err) => {
      console.warn('loadGroupsFromChats permission-denied', err.code);
      renderGroups([]);
    });
  } catch (e) {
    console.warn('loadGroupsFromChats', e);
    renderGroups([]);
  }
}

function renderGroups(groups) {
  const container = document.getElementById('groupsList') || document.getElementById('mainGroupsList');
  if (!container) return;
  
  if (groups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <div class="empty-title">No groups yet</div>
        <div class="empty-sub">لا يوجد جروبات</div>
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
  const chatsContainer = document.getElementById('chatsList') || document.getElementById('mainChatsList');
  const groupsContainer = document.getElementById('groupsList') || document.getElementById('mainGroupsList');
  
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

function initSearch() {
  const searchInput = document.getElementById('mainSearchInput') || document.getElementById('searchInput');
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

function initNewChat() {
  const newChatBtn = document.getElementById('newChatBtn') || document.getElementById('openNewChatSheet');
  const newChatSheet = document.getElementById('sheet-new-chat');
  const startChatBtn = document.getElementById('startChatBtn');
  const emailInput = document.getElementById('newChatEmailInput');
  
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

function initBottomBar() {
  const bottomBar = document.querySelector('.bottombar');
  if (!bottomBar) return;
  const isLg = localStorage.getItem('cz_lg_bottombar') === 'true';
  bottomBar.classList.toggle('lg-bottombar-on', isLg);
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

// ===== Fix hidden-chats permissions error =====
async function loadHiddenChats() {
  try {
    const hiddenRef = doc(db, 'users', myEmail, 'settings', 'hiddenChats');
    const snap = await getDoc(hiddenRef);
    if (snap.exists()) {
      return snap.data();
    }
    return { enabled: false, password: '' };
  } catch (e) {
    if (e.code === 'permission-denied' || (e.message && e.message.includes('permissions'))) {
      console.warn('فشل تحميل بيانات باسورد الشاتات المخفية: ليس لديك صلاحية، سيتم استخدام التخزين المحلي فقط');
      const localPassword = localStorage.getItem('cz_hidden_chats_password') || '';
      const localEnabled = localStorage.getItem('cz_hidden_chats_enabled') === 'true';
      return { enabled: localEnabled, password: localPassword, isLocal: true };
    }
    console.warn('فشل تحميل بيانات باسورد الشاتات المخفية:', e.message);
    return { enabled: false, password: '' };
  }
}

async function init() {
  if (!myEmail) {
    window.location.href = 'index.html';
    return;
  }
  
  await ensureAuthenticated();
  const hiddenData = await loadHiddenChats();
  console.log('Hidden chats loaded:', hiddenData ? 'yes' : 'no');
  
  loadChats();
  loadGroups();
  initTabs();
  initSearch();
  initNewChat();
  initBottomBar();
  
  const theme = localStorage.getItem('cz_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

init();
