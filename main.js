import {
    db,
    doc,
    getDoc,
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    ensureAuthenticated
} from "./firebase-init.js";

(function () {
    // ===== حماية الصفحة: أي حد يفتح MainActivity مباشرة من غير تسجيل دخول يترحّل =====
    if (!localStorage.getItem('cz_verified_email')) {
        window.location.href = 'index.html';
        return;
    }

    const savedEmail = localStorage.getItem('cz_verified_email');
    const savedEmailLower = savedEmail.toLowerCase();

    // ===== مودال محادثة جديدة =====
    const addChatBtn = document.getElementById('addChatBtn');
    const newChatOverlay = document.getElementById('newChatOverlay');
    const newChatEmail = document.getElementById('newChatEmail');
    const newChatError = document.getElementById('newChatError');
    const cancelNewChat = document.getElementById('cancelNewChat');
    const startNewChat = document.getElementById('startNewChat');
    const chatsListEl = document.getElementById('chatsList');

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function openNewChatModal() {
        newChatOverlay.classList.remove('hidden');
        newChatEmail.value = '';
        clearNewChatError();
        setTimeout(() => newChatEmail.focus(), 50);
    }

    function closeNewChatModal() {
        newChatOverlay.classList.add('hidden');
    }

    function showNewChatError(message) {
        newChatError.textContent = message;
        newChatEmail.classList.add('error');
    }

    function clearNewChatError() {
        newChatError.textContent = '';
        newChatEmail.classList.remove('error');
    }

    function t(arText, enText) {
        return (localStorage.getItem('cz_lang') || 'ar') === 'en' ? enText : arText;
    }

    function goToConversation(email) {
        localStorage.setItem('cz_active_chat_email', email);
        window.location.href = 'conversation.html';
    }

    function handleStartChat() {
        const email = newChatEmail.value.trim();

        if (!email) {
            showNewChatError(t('من فضلك اكتب الإيميل', 'Please enter an email'));
            return;
        }
        if (!isValidEmail(email)) {
            showNewChatError(t('الإيميل ده مش صحيح', 'This email is not valid'));
            return;
        }
        if (savedEmail && email.toLowerCase() === savedEmail.toLowerCase()) {
            showNewChatError(t('متقدرش تبدأ محادثة مع نفسك', "You can't start a chat with yourself"));
            return;
        }

        clearNewChatError();
        // بنحفظ الإيميل اللي هيتفتح معاه المحادثة عشان صفحة conversation تقرأه
        goToConversation(email);
    }

    addChatBtn.addEventListener('click', openNewChatModal);
    cancelNewChat.addEventListener('click', closeNewChatModal);
    newChatOverlay.addEventListener('click', (e) => {
        if (e.target === newChatOverlay) closeNewChatModal();
    });

    newChatEmail.addEventListener('input', clearNewChatError);
    newChatEmail.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleStartChat();
    });

    startNewChat.addEventListener('click', handleStartChat);

    // =====================================================
    // عرض قائمة المحادثات في الشاشة الرئيسية
    // =====================================================

    function displayNameFromEmail(email) {
        if (!email) return t('مستخدم', 'User');
        const namePart = email.split('@')[0];
        return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }

    // بنكاش الاسم الحقيقي لكل إيميل عشان منعملش getDoc لنفس الإيميل
    // كذا مرة لو ظهر في أكتر من محادثة أو تحديث.
    const nameCache = new Map();

    async function getRealName(email) {
        const key = email.toLowerCase();
        if (nameCache.has(key)) return nameCache.get(key);
        try {
            const snap = await getDoc(doc(db, 'users', key));
            const name = snap.exists() && snap.data().name ? snap.data().name : displayNameFromEmail(email);
            nameCache.set(key, name);
            return name;
        } catch (e) {
            return displayNameFromEmail(email);
        }
    }

    function renderEmptyChatsState() {
        chatsListEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <p class="empty-title">${t('مفيش شتات لسه', 'No chats yet')}</p>
                <p class="empty-sub">${t('دوس على علامة + وابدأ أول محادثة', 'Tap + to start your first chat')}</p>
            </div>`;
    }

    function formatChatTime(date) {
        if (!date) return '';
        const now = new Date();
        const sameDay = date.toDateString() === now.toDateString();
        if (sameDay) {
            let h = date.getHours();
            const m = date.getMinutes().toString().padStart(2, '0');
            const ampm = h < 12 ? t('ص', 'AM') : t('م', 'PM');
            h = h % 12 || 12;
            return `${h}:${m} ${ampm}`;
        }
        return date.toLocaleDateString(t('ar-EG', 'en-US'), { day: 'numeric', month: 'short' });
    }

    // بنخزّن آخر بيانات معروفة لكل شات عشان نعيد الرسم كله مرة واحدة
    // وبترتيب صحيح كل ما يوصل تحديث (سواء تحديث الشات نفسه، أو رسالة
    // جديدة جاية من listener تاني).
    const chatsState = new Map(); // chatId -> { otherEmail, lastMessage, lastAt, unread }
    let messageUnsubscribers = new Map(); // chatId -> unsubscribe fn

    async function renderChatsList() {
        const entries = Array.from(chatsState.values());
        if (!entries.length) {
            renderEmptyChatsState();
            return;
        }

        entries.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));

        const rows = await Promise.all(entries.map(async (entry) => {
            const name = await getRealName(entry.otherEmail);
            const initial = name.charAt(0).toUpperCase();
            const timeStr = entry.lastAt ? formatChatTime(new Date(entry.lastAt)) : '';
            const preview = entry.lastMessage
                ? entry.lastMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')
                : t('ابدأ المحادثة', 'Start the conversation');

            return `
                <div class="chat-row" data-email="${entry.otherEmail}">
                    <div class="chat-row-avatar">${initial}</div>
                    <div class="chat-row-text">
                        <h4 class="chat-row-name">${name}</h4>
                        <p class="chat-row-preview">${preview}</p>
                    </div>
                    <span class="chat-row-time">${timeStr}</span>
                </div>`;
        }));

        chatsListEl.innerHTML = rows.join('');

        chatsListEl.querySelectorAll('.chat-row').forEach(row => {
            row.addEventListener('click', () => {
                goToConversation(row.getAttribute('data-email'));
            });
        });
    }

    function listenToChatMessages(chatId, otherEmail) {
        if (messageUnsubscribers.has(chatId)) return;
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(1));
        const unsub = onSnapshot(q, (snap) => {
            const entry = chatsState.get(chatId) || { otherEmail };
            if (!snap.empty) {
                const data = snap.docs[0].data();
                entry.lastMessage = data.text || '';
                entry.lastAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().getTime() : Date.now();
            }
            chatsState.set(chatId, entry);
            renderChatsList();
        }, (err) => {
            console.error('فشل الاستماع لآخر رسالة في المحادثة:', err);
        });
        messageUnsubscribers.set(chatId, unsub);
    }

    async function initChatsList() {
        try {
            await ensureAuthenticated();
        } catch (e) {
            console.error('فشل تسجيل الدخول في Firebase Auth:', e);
            return;
        }

        const chatsRef = collection(db, 'chats');
        const q = query(chatsRef, where('participantsEmails', 'array-contains', savedEmailLower));

        onSnapshot(q, (snapshot) => {
            snapshot.forEach(chatDoc => {
                const data = chatDoc.data();
                const emails = data.participantsEmails || [];
                const otherEmail = emails.find(e => e.toLowerCase() !== savedEmailLower) || '';
                if (!otherEmail) return;

                if (!chatsState.has(chatDoc.id)) {
                    chatsState.set(chatDoc.id, { otherEmail, lastMessage: '', lastAt: 0 });
                }
                listenToChatMessages(chatDoc.id, otherEmail);
            });

            if (!snapshot.size) {
                renderEmptyChatsState();
            } else {
                renderChatsList();
            }
        }, (err) => {
            console.error('فشل جلب قائمة المحادثات:', err);
        });
    }

    initChatsList();
})();
