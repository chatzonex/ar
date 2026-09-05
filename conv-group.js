/**
 * ChatZone - conv-group.js (Clean Rebuilt Version)
 * فك التشفير + إعادة بناء نضيفة 100% - جروبات
 */

import {
  db, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  arrayUnion, arrayRemove, collection, query, orderBy, onSnapshot,
  serverTimestamp, writeBatch, ensureAuthenticated
} from './firebase-init.js';

const $ = (id) => document.getElementById(id);
const myEmail = (localStorage.getItem('cz_verified_email') || '').toLowerCase();
const params = new URLSearchParams(location.search);
const groupId = params.get('id') || params.get('groupId') || params.get('gid') || params.get('chatId') || '';

// ===== Emoji Feature (iOS style custom emoji) =====
const EMOJI_SPRITE_URL = 'emoji-sprite.webp';
const EMOJI_MANIFEST_URL = 'emoji-manifest.json';
const EMOJI_TOKEN_PREFIX = '[[czemoji:';
const EMOJI_TOKEN_SUFFIX = ']]';
const EMOJI_TOKEN_RE = /\[\[czemoji:([a-zA-Z0-9_]+)\]\]/g;
let emojiManifestData = null;
let emojiManifestById = {};

function loadEmojiManifest() {
  if (emojiManifestData) return Promise.resolve(emojiManifestData);
  return fetch(EMOJI_MANIFEST_URL)
    .then(r => r.json())
    .then(data => {
      emojiManifestData = data;
      data.items.forEach(it => { emojiManifestById[it.id] = it; });
      return data;
    })
    .catch(e => {
      console.error('فشل تحميل manifest الإيموجي:', e);
      return null;
    });
}

function buildEmojiSpanHTML(emojiId, sizePx) {
  const it = emojiManifestById[emojiId];
  if (!it || !emojiManifestData) return '';
  const size = emojiManifestData.size;
  const scale = (sizePx || 22) / size;
  const bgW = Math.round(emojiManifestData.cols * size * scale);
  const bgH = Math.round(emojiManifestData.rows * size * scale);
  const bgX = Math.round(it.x * scale);
  const bgY = Math.round(it.y * scale);
  const s = (sizePx || 22);
  return `<span class="cz-emoji-img" data-emoji-id="${emojiId}" style="display:inline-block;vertical-align:-4px;width:${s}px;height:${s}px;background-image:url('${EMOJI_SPRITE_URL}');background-repeat:no-repeat;background-position:-${bgX}px -${bgY}px;background-size:${bgW}px ${bgH}px;"></span>`;
}

function renderTextWithEmoji(text, sizePx) {
  if (!text || text.indexOf(EMOJI_TOKEN_PREFIX) === -1) return null;
  let out = '';
  let lastIndex = 0;
  let m;
  EMOJI_TOKEN_RE.lastIndex = 0;
  while ((m = EMOJI_TOKEN_RE.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index);
    if (before) out += escapeHtml(before);
    out += buildEmojiSpanHTML(m[1], sizePx);
    lastIndex = EMOJI_TOKEN_RE.lastIndex;
  }
  out += escapeHtml(text.slice(lastIndex));
  return out;
}

function insertEmojiToken(emojiId) {
  const textarea = $('convTextarea');
  if (!textarea) return;
  const token = EMOJI_TOKEN_PREFIX + emojiId + EMOJI_TOKEN_SUFFIX;
  const start = textarea.selectionStart || textarea.value.length;
  const end = textarea.selectionEnd || textarea.value.length;
  const val = textarea.value;
  textarea.value = val.slice(0, start) + token + val.slice(end);
  const newPos = start + token.length;
  textarea.setSelectionRange(newPos, newPos);
  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

let emojiPickerEl = null;

function buildEmojiPicker() {
  if (emojiPickerEl) return emojiPickerEl;
  const overlay = document.createElement('div');
  overlay.id = 'czEmojiPickerOverlay';
  overlay.className = 'cz-emoji-picker-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'cz-emoji-picker-sheet';

  const handle = document.createElement('div');
  handle.className = 'cz-emoji-picker-handle';
  sheet.appendChild(handle);

  const grid = document.createElement('div');
  grid.className = 'cz-emoji-picker-grid';
  grid.id = 'czEmojiPickerGrid';
  sheet.appendChild(grid);

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeEmojiPicker();
  });

  emojiPickerEl = overlay;
  return overlay;
}

function populateEmojiGrid() {
  const grid = $('czEmojiPickerGrid');
  if (!grid || !emojiManifestData) return;
  if (grid.childElementCount > 0) return;

  const frag = document.createDocumentFragment();
  emojiManifestData.items.forEach(it => {
    const cell = document.createElement('div');
    cell.className = 'cz-emoji-picker-cell';
    cell.innerHTML = buildEmojiSpanHTML(it.id, 34);
    cell.addEventListener('click', () => {
      insertEmojiToken(it.id);
      closeEmojiPicker();
    });
    frag.appendChild(cell);
  });
  grid.appendChild(frag);
}

function openEmojiPicker() {
  const overlay = buildEmojiPicker();
  loadEmojiManifest().then(() => {
    populateEmojiGrid();
    overlay.classList.add('open');
  });
}

function closeEmojiPicker() {
  if (emojiPickerEl) emojiPickerEl.classList.remove('open');
}

function injectEmojiButton() {
  const inputBar = $('convInputBar');
  const textarea = $('convTextarea');
  if (!inputBar || !textarea) return null;
  if ($('czEmojiBtn')) return $('czEmojiBtn');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'czEmojiBtn';
  btn.className = 'cz-emoji-trigger-btn';
  btn.setAttribute('aria-label', 'إيموجي');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.3"></circle><path d="M8.3 14.2c1 1.3 2.2 2 3.7 2s2.7-.7 3.7-2"></path><circle cx="8.7" cy="9.7" r="1" fill="currentColor" stroke="none"></circle><circle cx="15.3" cy="9.7" r="1" fill="currentColor" stroke="none"></circle></svg>';

  inputBar.insertBefore(btn, textarea);
  btn.addEventListener('click', () => openEmojiPicker());
  return btn;
}

function processMessageBubbleEmoji(bubbleEl) {
  if (!emojiManifestData) return;
  if (bubbleEl.dataset.czEmojiProcessed === '1') return;

  const textEl = bubbleEl.querySelector('.msg-text');
  if (!textEl) return;

  const raw = textEl.textContent || '';
  if (raw.indexOf(EMOJI_TOKEN_PREFIX) === -1) {
    bubbleEl.dataset.czEmojiProcessed = '1';
    return;
  }

  const html = renderTextWithEmoji(raw, 22);
  if (html !== null) {
    textEl.innerHTML = html;
    bubbleEl.classList.add('cz-has-emoji');
  }
  bubbleEl.dataset.czEmojiProcessed = '1';
}

function processAllVisibleMessagesEmoji() {
  const container = $('convMessages');
  if (!container) return;
  container.querySelectorAll('.msg-bubble').forEach(processMessageBubbleEmoji);
}

function initEmojiFeature() {
  injectEmojiButton();
  loadEmojiManifest().then(() => {
    processAllVisibleMessagesEmoji();
  });

  const container = $('convMessages');
  if (container) {
    const observer = new MutationObserver((mutations) => {
      if (!emojiManifestData) return;
      const needsProcess = mutations.some(m => m.addedNodes && m.addedNodes.length);
      if (needsProcess) processAllVisibleMessagesEmoji();
    });
    observer.observe(container, { childList: true, subtree: true });
  }
}

let replyToMsg = null;
let selectedMessages = new Set();
let isSelectMode = false;
let unsubscribeMessages = null;
let groupData = null;

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
  return escapeHtml(text).replace(urlRegex, url => `<a href="${url}" target="_blank">${url}</a>`);
}

async function loadGroupInfo() {
  if (!groupId) return;
  try {
    const groupRef = doc(db, "groups", groupId);
    const snap = await getDoc(groupRef);
    if (!snap.exists()) {
      // Try chats collection
      const chatRef = doc(db, "chats", groupId);
      const chatSnap = await getDoc(chatRef);
      if (chatSnap.exists()) {
        groupData = chatSnap.data();
      }
    } else {
      groupData = snap.data();
    }
    
    if (groupData) {
      $('convName').textContent = groupData.name || groupData.groupName || 'جروب';
      $('convStatus').textContent = `${(groupData.members?.length || groupData.participants?.length || 0)} عضو`;
      $('accountInfoName').textContent = groupData.name || 'جروب';
      $('groupInfoMemberCount').textContent = `${groupData.members?.length || 0} عضو`;
      
      const initial = (groupData.name || '?')[0].toUpperCase();
      $('groupAvatarInitial').textContent = initial;
      $('groupInfoAvatarInitial').textContent = initial;
      
      // Load members
      const membersContainer = $('groupMembersScroll');
      if (membersContainer && groupData.members) {
        membersContainer.innerHTML = '';
        for (let email of groupData.members) {
          try {
            const userRef = doc(db, "users", email.toLowerCase());
            const userSnap = await getDoc(userRef);
            const userData = userSnap.exists() ? userSnap.data() : { name: email, email };
            const div = document.createElement('div');
            div.className = 'group-member-item';
            div.innerHTML = `
              <div class="group-member-avatar">${escapeHtml((userData.name || email)[0])}</div>
              <div class="group-member-info">
                <div class="group-member-name">${escapeHtml(userData.name || email)}</div>
                <div class="group-member-email">${escapeHtml(email)}</div>
              </div>
              ${email === myEmail ? '<span class="you-badge">أنت</span>' : ''}
            `;
            membersContainer.appendChild(div);
          } catch(e) {}
        }
      }
    }
  } catch (e) {
    console.error('loadGroupInfo', e);
  }
}

function createMessageEl(msg, isMine) {
  const div = document.createElement('div');
  div.className = `msg-row ${isMine ? 'mine' : 'theirs'} ${msg.sender ? '' : 'system'}`;
  div.dataset.msgId = msg.id;
  
  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'}`;
  
  if (!isMine && groupData) {
    const senderName = document.createElement('div');
    senderName.className = 'msg-sender-name';
    senderName.textContent = msg.senderName || msg.sender || '';
    bubble.appendChild(senderName);
  }
  
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
  meta.innerHTML = `<span class="msg-time">${formatTime(msg.createdAt)}</span>`;
  bubble.appendChild(meta);
  
  div.appendChild(bubble);
  
  let pressTimer;
  div.addEventListener('touchstart', () => {
    pressTimer = setTimeout(() => openCtxMenu(msg, div), 600);
  });
  div.addEventListener('touchend', () => clearTimeout(pressTimer));
  div.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openCtxMenu(msg, div);
  });
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

function listenToMessages() {
  if (!groupId) return;
  let groupRef = doc(db, "groups", groupId);
  let messagesRef = collection(groupRef, "messages");
  
  // Fallback to chats collection
  const q = query(messagesRef, orderBy("createdAt", "asc"));
  
  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    const msgs = [];
    snapshot.forEach(docSnap => {
      msgs.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderMessages(msgs);
  }, async (err) => {
    console.error('listen group error', err);
    // Try chats collection
    try {
      const chatRef = doc(db, "chats", groupId);
      const chatMessagesRef = collection(chatRef, "messages");
      const q2 = query(chatMessagesRef, orderBy("createdAt", "asc"));
      onSnapshot(q2, (snap) => {
        const msgs = [];
        snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
        renderMessages(msgs);
      });
    } catch(e) {}
  });
}

async function sendMessage() {
  const textarea = $('convTextarea');
  const text = textarea.value.trim();
  if (!text || !groupId) return;
  
  try {
    let groupRef = doc(db, "groups", groupId);
    let snap = await getDoc(groupRef);
    if (!snap.exists()) {
      groupRef = doc(db, "chats", groupId);
    }
    const messagesRef = collection(groupRef, "messages");
    
    const msgData = {
      sender: myEmail,
      senderName: localStorage.getItem('cz_user_name') || myEmail,
      text: text,
      createdAt: serverTimestamp(),
      type: 'text'
    };
    if (replyToMsg) {
      msgData.replyTo = {
        id: replyToMsg.id,
        text: replyToMsg.text,
        sender: replyToMsg.sender,
        senderName: replyToMsg.senderName || replyToMsg.sender
      };
    }
    
    await addDoc(messagesRef, msgData);
    await updateDoc(groupRef, {
      lastMessage: text.slice(0, 100),
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    textarea.value = '';
    textarea.style.height = 'auto';
    clearReply();
  } catch (e) {
    console.error('send group error', e);
    showToast('فشل إرسال الرسالة');
  }
}

function setReply(msg) {
  replyToMsg = msg;
  $('convReplyBarName').textContent = msg.senderName || msg.sender || '';
  $('convReplyBarPreview').textContent = (msg.text || '').slice(0, 80);
  $('convReplyBar').classList.add('active');
  $('convTextarea').focus();
}

function clearReply() {
  replyToMsg = null;
  $('convReplyBar').classList.remove('active');
}

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

async function deleteMessageForMe(msgId) {
  try {
    let groupRef = doc(db, "groups", groupId);
    let msgRef = doc(groupRef, "messages", msgId);
    let snap = await getDoc(groupRef);
    if (!snap.exists()) {
      groupRef = doc(db, "chats", groupId);
      msgRef = doc(groupRef, "messages", msgId);
    }
    await updateDoc(msgRef, { deletedFor: arrayUnion(myEmail) });
    showToast('تم الحذف من عندك');
  } catch (e) { console.error(e); }
}

async function deleteMessageForEveryone(msgId) {
  try {
    let groupRef = doc(db, "groups", groupId);
    let msgRef = doc(groupRef, "messages", msgId);
    let snap = await getDoc(groupRef);
    if (!snap.exists()) {
      groupRef = doc(db, "chats", groupId);
      msgRef = doc(groupRef, "messages", msgId);
    }
    await deleteDoc(msgRef);
    showToast('تم الحذف للجميع');
  } catch (e) { console.error(e); }
}

function applyBubbleColors() {
  const mineColor = localStorage.getItem('cz_bubble_mine_color') || '#0084ff';
  const theirsColor = localStorage.getItem('cz_bubble_theirs_color') || '#f0f0f0';
  document.documentElement.style.setProperty('--bubble-mine-bg', mineColor);
  document.documentElement.style.setProperty('--bubble-theirs-bg', theirsColor);
}

function applyChatFont() {
  const font = localStorage.getItem('cz_chat_font') || 'Cairo';
  document.documentElement.style.setProperty('--chat-font', font);
  const el = $('convMessages');
  if (el) el.style.fontFamily = font;
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
    if (currentCtxMsg) $('sheet-delete-msg').classList.add('active');
    closeCtxMenu();
  });
  
  $('msgCtxOverlay').addEventListener('click', closeCtxMenu);
  
  $('deleteMsgForMeBtn')?.addEventListener('click', async () => {
    if (currentCtxMsg) await deleteMessageForMe(currentCtxMsg.id);
    $('sheet-delete-msg').classList.remove('active');
  });
  $('deleteMsgForEveryoneBtn')?.addEventListener('click', async () => {
    if (currentCtxMsg) await deleteMessageForEveryone(currentCtxMsg.id);
    $('sheet-delete-msg').classList.remove('active');
  });
  
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
  
  document.querySelectorAll('[data-close-sheet]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close-sheet');
      $(id).classList.remove('active');
    });
  });
}

async function init() {
  if (!myEmail) {
    location.replace('index.html');
    return;
  }
  if (!groupId) {
    showToast('لا يوجد جروب محدد');
    return;
  }
  
  await ensureAuthenticated();
  applyBubbleColors();
  applyChatFont();
  await loadGroupInfo();
  listenToMessages();
  initEvents();
  initEmojiFeature();
}

init();
