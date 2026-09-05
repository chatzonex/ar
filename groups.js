/**
 * ChatZone - groups.js (Clean Rebuilt 100%)
 * نسخة نضيفة بدون تشفير - تحل مشكلة _0x15df07 is not a function
 */

import {
  db, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove, ensureAuthenticated
} from './firebase-init.js';

const $ = (id) => document.getElementById(id);
const myEmail = (localStorage.getItem('cz_verified_email') || '').toLowerCase();

let groupsCache = [];
let unsubscribeGroups = null;

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function loadGroups() {
  if (!myEmail) return;
  
  try {
    // Try groups collection
    const groupsRef = collection(db, 'groups');
    const q = query(groupsRef, where('members', 'array-contains', myEmail), orderBy('updatedAt', 'desc'));
    
    unsubscribeGroups = onSnapshot(q, (snapshot) => {
      groupsCache = [];
      snapshot.forEach(docSnap => {
        groupsCache.push({ id: docSnap.id, ...docSnap.data() });
      });
      renderGroups(groupsCache);
    }, (err) => {
      console.error('loadGroups error', err);
      // Fallback to chats with type group
      loadGroupsFromChats();
    });
  } catch (e) {
    console.error(e);
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
      renderGroups(groupsCache);
    });
  } catch (e) {
    console.error('loadGroupsFromChats', e);
  }
}

function renderGroups(groups) {
  const container = $('groupsList') || $('groupsContainer');
  if (!container) return;
  
  if (groups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <div class="empty-title">No groups yet</div>
        <div class="empty-sub">لا يوجد جروبات بعد</div>
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
        <span class="group-avatar-initial">${escapeHtml((group.name || '?')[0].toUpperCase())}</span>
      </div>
      <div class="group-info">
        <div class="group-name">${escapeHtml(group.name || 'جروب بدون اسم')}</div>
        <div class="group-last-msg">${escapeHtml((group.lastMessage || '').slice(0, 50))}</div>
      </div>
      <div class="group-meta">
        <div class="group-time">${formatTime(group.updatedAt || group.lastMessageAt)}</div>
        <div class="group-members-count">${group.members?.length || 0} عضو</div>
      </div>
    `;
    div.addEventListener('click', () => {
      window.location.href = `conv-group.html?id=${encodeURIComponent(group.id)}`;
    });
    container.appendChild(div);
  });
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

async function createGroup() {
  const nameInput = $('groupNameInput');
  const membersInput = $('groupMembersInput');
  
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    showToast('اكتب اسم الجروب');
    return;
  }
  
  let members = [myEmail];
  if (membersInput && membersInput.value.trim()) {
    const extra = membersInput.value.split(',').map(e => e.trim().toLowerCase()).filter(e => e);
    members = [...new Set([...members, ...extra])];
  }
  
  try {
    const groupsRef = collection(db, 'groups');
    const docRef = await addDoc(groupsRef, {
      name: name,
      members: members,
      createdBy: myEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: '',
      lastMessageAt: serverTimestamp()
    });
    
    showToast('تم إنشاء الجروب');
    closeSheet('sheet-create-group');
    if (nameInput) nameInput.value = '';
    if (membersInput) membersInput.value = '';
    
    setTimeout(() => {
      window.location.href = `conv-group.html?id=${encodeURIComponent(docRef.id)}`;
    }, 500);
  } catch (e) {
    console.error('createGroup error', e);
    showToast('فشل إنشاء الجروب');
  }
}

function openSheet(id) {
  const sheet = document.getElementById(id);
  if (sheet) sheet.classList.add('active');
}

function closeSheet(id) {
  const sheet = document.getElementById(id);
  if (sheet) sheet.classList.remove('active');
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

function initEvents() {
  const createBtn = $('createGroupBtn');
  const openCreateBtn = $('openCreateGroupSheet');
  
  if (openCreateBtn) {
    openCreateBtn.addEventListener('click', () => openSheet('sheet-create-group'));
  }
  
  if (createBtn) {
    createBtn.addEventListener('click', createGroup);
  }
  
  document.querySelectorAll('[data-close-sheet]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeSheet(btn.getAttribute('data-close-sheet'));
    });
  });
  
  const searchInput = $('groupSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = groupsCache.filter(g => 
        (g.name || '').toLowerCase().includes(q)
      );
      renderGroups(filtered);
    });
  }
}

async function init() {
  if (!myEmail) {
    window.location.href = 'index.html';
    return;
  }
  await ensureAuthenticated();
  loadGroups();
  initEvents();
}

init();
