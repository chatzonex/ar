/**
 * ChatZone - conversation.js (Clean Rebuilt Version)
 * فك التشفير + إعادة بناء نضيفة 100% - شغالة
 * 
 * الملف الأصلي كان متشفر بـ obfuscator.io طبقتين
 * ده نسخة نضيفة مبنية من الصفر بنفس المنطق
 */

import {
  db, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, deleteField,
  arrayUnion, arrayRemove, collection, query, where, orderBy, onSnapshot,
  serverTimestamp, writeBatch, ensureAuthenticated
} from './firebase-init.js';

// ===== Helpers =====
const $ = (id) => document.getElementById(id);
const myEmail = (localStorage.getItem('cz_verified_email') || '').toLowerCase();
const params = new URLSearchParams(location.search);
const otherEmail = (params.get('email') || params.get('id') || params.get('uid') || params.get('chatId') || '').toLowerCase();
const chatId = params.get('chatId') || [myEmail, otherEmail].sort().join('__');

let replyToMsg = null;
let selectedMessages = new Set();
let isSelectMode = false;
let unsubscribeMessages = null;

// ===== Verify ownership =====
async function verifyOwnership(email, uid) {
  try {
    const userDoc = doc(db, "users", email.toLowerCase());
    const snap = await getDoc(userDoc);
    if (!snap.exists()) return false;
    const data = snap.data();
    return data.uid === uid;
  } catch (e) {
    console.error('فشل التحقق من ملكية الإيميل:', e);
    return false;
  }
}

async function saveContact(myEmail, otherEmail) {
  if (!myEmail || !otherEmail) return;
  const contactRef = doc(db, "users", myEmail.toLowerCase(), 'contacts', otherEmail.toLowerCase());
  await setDoc(contactRef, {
    email: otherEmail.toLowerCase(),
    lastContactAt: serverTimestamp()
  }, { merge: true });
}

// ===== UI Helpers =====
function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return escapeHtml(text).replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

// ===== Load Other User Info =====
async function loadOtherUser() {
  if (!otherEmail) return;
  try {
    const userRef = doc(db, "users", otherEmail);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      $('convName').textContent = data.name || data.displayName || otherEmail;
      $('convAboutToastName').textContent = data.name || otherEmail;
      $('convAboutToastBody').textContent = data.about || data.bio || 'مستخدم ChatZone';
      if (data.photoURL || data.photo) {
        const img = `<img src="${data.photoURL || data.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        $('convAvatar').innerHTML = img;
        $('convAboutToastAvatar').innerHTML = img;
      }
    } else {
      $('convName').textContent = otherEmail;
    }
  } catch (e) {
    console.error(e);
    $('convName').textContent = otherEmail;
  }
}

// ===== Render Messages =====
function createMessageEl(msg, isMine) {
  const div = document.createElement('div');
  div.className = `msg-row ${isMine ? 'mine' : 'theirs'}`;
  div.dataset.msgId = msg.id;
  
  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'}`;
  
  // Reply preview
  if (msg.replyTo) {
    const replyDiv = document.createElement('div');
    replyDiv.className = 'msg-reply-preview';
    replyDiv.innerHTML = `<span class="reply-name">${escapeHtml(msg.replyTo.senderName || '')}</span><span class="reply-text">${escapeHtml((msg.replyTo.text || '').slice(0, 60))}</span>`;
    bubble.appendChild(replyDiv);
  }
  
  const textDiv = document.createElement('div');
  textDiv.className = 'msg-text';
  textDiv.innerHTML = linkify(msg.text || '');
  bubble.appendChild(textDiv);
  
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = `<span class="msg-time">${formatTime(msg.createdAt)}</span> ${isMine ? `<span class="msg-status">${msg.seen ? '✓✓' : '✓'}</span>` : ''}`;
  bubble.appendChild(meta);
  
  div.appendChild(bubble);
  
  // Long press / right click for context menu
  let pressTimer;
  div.addEventListener('touchstart', () => {
    pressTimer = setTimeout(() => openCtxMenu(msg, div), 600);
  });
  div.addEventListener('touchend', () => clearTimeout(pressTimer));
  div.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openCtxMenu(msg, div);
  });
  
  // Click to select in select mode
  div.addEventListener('click', () => {
    if (isSelectMode) toggleSelect(msg.id, div);
  });
  
  return div;
}

let messagesCache = new Map();

function renderMessages(messages) {
  const container = $('convMessages');
  container.innerHTML = '';
  messages.forEach(msg => {
    const isMine = (msg.sender || '').toLowerCase() === myEmail;
    const el = createMessageEl(msg, isMine);
    container.appendChild(el);
    messagesCache.set(msg.id, msg);
  });
  container.scrollTop = container.scrollHeight;
}

// ===== Listen to Messages =====
function listenToMessages() {
  const chatRef = doc(db, "chats", chatId);
  const messagesRef = collection(chatRef, "messages");
  const q = query(messagesRef, orderBy("createdAt", "asc"));
  
  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    const msgs = [];
    snapshot.forEach(docSnap => {
      msgs.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderMessages(msgs);
  }, (err) => {
    console.error('listen error', err);
    showToast('فشل تحميل الرسائل');
  });
}

// ===== Send Message =====
async function sendMessage() {
  const textarea = $('convTextarea');
  const text = textarea.value.trim();
  if (!text) return;
  
  const chatRef = doc(db, "chats", chatId);
  const messagesRef = collection(chatRef, "messages");
  
  try {
    // Ensure chat exists
    await setDoc(chatRef, {
      participants: [myEmail, otherEmail],
      participantEmails: [myEmail, otherEmail],
      updatedAt: serverTimestamp(),
      lastMessage: text.slice(0, 100),
      lastMessageAt: serverTimestamp()
    }, { merge: true });
    
    const msgData = {
      sender: myEmail,
      text: text,
      createdAt: serverTimestamp(),
      type: 'text',
      seen: false
    };
    if (replyToMsg) {
      msgData.replyTo = {
        id: replyToMsg.id,
        text: replyToMsg.text,
        sender: replyToMsg.sender,
        senderName: replyToMsg.sender === myEmail ? 'أنت' : $('convName').textContent
      };
    }
    
    await addDoc(messagesRef, msgData);
    await saveContact(myEmail, otherEmail);
    await saveContact(otherEmail, myEmail);
    
    textarea.value = '';
    textarea.style.height = 'auto';
    clearReply();
  } catch (e) {
    console.error('send error', e);
    showToast('فشل إرسال الرسالة');
  }
}

// ===== Reply =====
function setReply(msg) {
  replyToMsg = msg;
  $('convReplyBarName').textContent = msg.sender === myEmail ? 'أنت' : $('convName').textContent;
  $('convReplyBarPreview').textContent = (msg.text || '').slice(0, 80);
  $('convReplyBar').classList.add('active');
  $('convTextarea').focus();
}

function clearReply() {
  replyToMsg = null;
  $('convReplyBar').classList.remove('active');
}

// ===== Select Mode =====
function toggleSelectMode(on) {
  isSelectMode = on;
  $('convTopbarNormal').style.display = on ? 'none' : 'flex';
  $('convTopbarSelect').style.display = on ? 'flex' : 'none';
  if (!on) {
    selectedMessages.clear();
    document.querySelectorAll('.msg-row.selected').forEach(el => el.classList.remove('selected'));
  }
  updateSelectCount();
}

function toggleSelect(msgId, el) {
  if (selectedMessages.has(msgId)) {
    selectedMessages.delete(msgId);
    el.classList.remove('selected');
  } else {
    selectedMessages.add(msgId);
    el.classList.add('selected');
  }
  updateSelectCount();
}

function updateSelectCount() {
  $('convSelectCount').textContent = selectedMessages.size;
}

// ===== Context Menu =====
let currentCtxMsg = null;
function openCtxMenu(msg, el) {
  currentCtxMsg = msg;
  $('msgCtxOverlay').classList.add('active');
  $('msgCtxMenu').classList.add('active');
}

function closeCtxMenu() {
  $('msgCtxOverlay').classList.remove('active');
  $('msgCtxMenu').classList.remove('active');
  currentCtxMsg = null;
}

// ===== Delete =====
async function deleteMessageForMe(msgId) {
  try {
    const chatRef = doc(db, "chats", chatId);
    const msgRef = doc(chatRef, "messages", msgId);
    // Soft delete for me - add to deletedFor
    await updateDoc(msgRef, {
      deletedFor: arrayUnion(myEmail)
    });
    showToast('تم الحذف من عندك');
  } catch (e) {
    console.error(e);
  }
}

async function deleteMessageForEveryone(msgId) {
  try {
    const chatRef = doc(db, "chats", chatId);
    const msgRef = doc(chatRef, "messages", msgId);
    await deleteDoc(msgRef);
    showToast('تم الحذف للجميع');
  } catch (e) {
    console.error(e);
  }
}

// ===== Bubble Colors & Fonts (from original logic) =====
function applyBubbleColors() {
  const mineColor = localStorage.getItem('cz_bubble_mine_color') || '#0084ff';
  const theirsColor = localStorage.getItem('cz_bubble_theirs_color') || '#f0f0f0';
  document.documentElement.style.setProperty('--bubble-mine-bg', mineColor);
  document.documentElement.style.setProperty('--bubble-theirs-bg', theirsColor);
}

function applyChatFont() {
  const font = localStorage.getItem('cz_chat_font') || 'Cairo';
  document.documentElement.style.setProperty('--chat-font', font);
  $('convMessages').style.fontFamily = font;
}

function applyChatBg() {
  const bg = localStorage.getItem(`cz_chat_bg_color__${chatId}`) || localStorage.getItem('cz_chat_bg_color');
  if (bg) {
    $('convMessages').style.background = bg;
  }
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

// ===== Events =====
function initEvents() {
  $('convBackBtn').addEventListener('click', () => history.back());
  $('convMenuBtn').addEventListener('click', () => {
    $('convSidebarOverlay').classList.add('active');
    $('convSidebarMenu').classList.add('active');
  });
  $('convSidebarOverlay').addEventListener('click', () => {
    $('convSidebarOverlay').classList.remove('active');
    $('convSidebarMenu').classList.remove('active');
    $('msgCtxOverlay').classList.remove('active');
    $('msgCtxMenu').classList.remove('active');
  });
  
  $('convTextarea').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
  });
  
  $('convTextarea').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  $('convSendBtn').addEventListener('click', sendMessage);
  $('convReplyBarClose').addEventListener('click', clearReply);
  
  // Context menu actions
  $('msgCtxReply').addEventListener('click', () => {
    if (currentCtxMsg) setReply(currentCtxMsg);
    closeCtxMenu();
  });
  $('msgCtxCopy').addEventListener('click', () => {
    if (currentCtxMsg) navigator.clipboard.writeText(currentCtxMsg.text || '');
    showToast('تم النسخ');
    closeCtxMenu();
  });
  $('msgCtxSelect').addEventListener('click', () => {
    if (currentCtxMsg) {
      toggleSelectMode(true);
      const el = document.querySelector(`[data-msg-id="${currentCtxMsg.id}"]`);
      if (el) toggleSelect(currentCtxMsg.id, el);
    }
    closeCtxMenu();
  });
  $('msgCtxDelete').addEventListener('click', () => {
    if (currentCtxMsg) {
      $('sheet-delete-msg').classList.add('active');
    }
    closeCtxMenu();
  });
  
  $('msgCtxOverlay').addEventListener('click', closeCtxMenu);
  
  // Delete sheets
  $('deleteMsgForMeBtn')?.addEventListener('click', async () => {
    if (currentCtxMsg) await deleteMessageForMe(currentCtxMsg.id);
    $('sheet-delete-msg').classList.remove('active');
  });
  $('deleteMsgForEveryoneBtn')?.addEventListener('click', async () => {
    if (currentCtxMsg) await deleteMessageForEveryone(currentCtxMsg.id);
    $('sheet-delete-msg').classList.remove('active');
  });
  
  // Select mode
  $('convSelectCancelBtn').addEventListener('click', () => toggleSelectMode(false));
  $('convSelectDeleteBtn').addEventListener('click', () => {
    $('sheet-delete-selected').classList.add('active');
  });
  $('deleteSelectedConfirmBtn')?.addEventListener('click', async () => {
    for (let id of selectedMessages) {
      const msg = messagesCache.get(id);
      if (msg && msg.sender === myEmail) {
        await deleteMessageForEveryone(id);
      } else {
        await deleteMessageForMe(id);
      }
    }
    toggleSelectMode(false);
    $('sheet-delete-selected').classList.remove('active');
  });
  
  // Close sheets
  document.querySelectorAll('[data-close-sheet]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close-sheet');
      $(id).classList.remove('active');
    });
  });
  
  // Bubble colors
  $('convOpenBubbleColors')?.addEventListener('click', () => {
    $('sheet-bubble-colors').classList.add('active');
  });
  
  // Fonts
  $('convOpenFonts')?.addEventListener('click', () => {
    $('sheet-fonts').classList.add('active');
  });
}

// ===== Init =====
async function init() {
  if (!myEmail) {
    location.replace('index.html');
    return;
  }
  if (!otherEmail && !chatId) {
    showToast('لا يوجد محادثة محددة');
    return;
  }
  
  await ensureAuthenticated();
  applyBubbleColors();
  applyChatFont();
  applyChatBg();
  await loadOtherUser();
  listenToMessages();
  initEvents();
  
  // Show about toast once
  setTimeout(() => {
    const toast = $('convAboutToast');
    if (toast) {
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 4000);
    }
  }, 800);
}

init();
