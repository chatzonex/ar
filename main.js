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
    let unreadUnsubscribers = new Map(); // chatId -> unsubscribe fn

    // إجمالي عدد الرسائل غير المقروءة في كل الشاتات مجتمعة، بيتحدّث
    // فورًا مع أي تغيير وبيتعرض كـ badge على تاب "الدردشات" في شريط
    // التنقل السفلي، حتى لو المستخدم مش فاتح شاشة الدردشات دلوقتي.
    function updateGlobalUnreadBadge() {
        let total = 0;
        chatsState.forEach(entry => { total += (entry.unread || 0); });
        const navChatsBtn = document.getElementById('navChats');
        if (!navChatsBtn) return;
        let badge = navChatsBtn.querySelector('.nav-unread-badge');
        if (total > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'nav-unread-badge';
                navChatsBtn.appendChild(badge);
            }
            badge.textContent = total > 99 ? '99+' : String(total);
        } else if (badge) {
            badge.remove();
        }
        // تحديث عنوان التاب (favicon/title) اختياري لاحقًا لو احتجنا
        document.title = total > 0 ? `(${total > 99 ? '99+' : total}) ChatZone` : 'ChatZone';
    }

    async function renderChatsList() {
        const entries = Array.from(chatsState.values());
        if (!entries.length) {
            renderEmptyChatsState();
            updateGlobalUnreadBadge();
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
            const unreadCount = entry.unread || 0;
            const unreadBadge = unreadCount > 0
                ? `<span class="chat-row-unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>`
                : '';

            return `
                <div class="chat-row${unreadCount > 0 ? ' chat-row-unread' : ''}" data-email="${entry.otherEmail}">
                    <div class="chat-row-avatar">${initial}</div>
                    <div class="chat-row-text">
                        <h4 class="chat-row-name">${name}</h4>
                        <p class="chat-row-preview">${preview}</p>
                    </div>
                    <div class="chat-row-meta">
                        <span class="chat-row-time">${timeStr}</span>
                        ${unreadBadge}
                    </div>
                </div>`;
        }));

        chatsListEl.innerHTML = rows.join('');

        chatsListEl.querySelectorAll('.chat-row').forEach(row => {
            row.addEventListener('click', () => {
                goToConversation(row.getAttribute('data-email'));
            });
        });

        updateGlobalUnreadBadge();
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

    // بيستمع لعدد الرسائل غير المقروءة الجاية من الطرف التاني في شات
    // معيّن (status == 'unread' و senderUid مش أنا)، وبيحدّث الرقم على
    // كارت الشات وعلى تاب الدردشات فورًا — ده بيشتغل حتى لو المستخدم
    // خارج شاشة الشات نفسها، طول ما main.js فاتح (الصفحة الرئيسية).
    function listenToUnreadCount(chatId, otherEmail, myUid) {
        if (unreadUnsubscribers.has(chatId)) return;
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(
            messagesRef,
            where('status', '==', 'unread'),
            where('senderUid', '!=', myUid)
        );
        const unsub = onSnapshot(q, (snap) => {
            const entry = chatsState.get(chatId) || { otherEmail };
            entry.unread = snap.size;
            chatsState.set(chatId, entry);
            renderChatsList();
        }, (err) => {
            // بعض الاستعلامات المركّبة زي دي محتاجة composite index في
            // Firestore، فلو حصل فشل هنا (مثلاً "index required")،
            // بنطبعه بوضوح عشان يظهر لينك إنشاء الـ index في الكونسول.
            console.error('فشل الاستماع لعدد الرسائل غير المقروءة:', err);
        });
        unreadUnsubscribers.set(chatId, unsub);
    }

    async function initChatsList() {
        let myUid = null;
        try {
            const user = await ensureAuthenticated();
            myUid = user.uid;
        } catch (e) {
            console.error('فشل تسجيل الدخول في Firebase Auth:', e);
            return;
        }

        // بنستعلم بالـ uid بتاعي على حقل participants (مش الإيميل على
        // participantsEmails)، لأن الـ Security Rules بتاعة قراءة
        // chats بتتحقق بالـ uid فقط (request.auth.uid in
        // resource.data.participants). لو استعلمنا بحقل تاني غير
        // اللي الـ rule بتتحقق منه، Firestore بيرفض الـ query كله
        // بمجرد إنه مش قادر يضمن إن كل نتيجة محتملة هتعدي الـ rule.
        const chatsRef = collection(db, 'chats');
        const q = query(chatsRef, where('participants', 'array-contains', myUid));

        onSnapshot(q, (snapshot) => {
            snapshot.forEach(chatDoc => {
                const data = chatDoc.data();
                const emails = data.participantsEmails || [];
                const otherEmail = emails.find(e => e.toLowerCase() !== savedEmailLower) || '';
                if (!otherEmail) return;

                if (!chatsState.has(chatDoc.id)) {
                    chatsState.set(chatDoc.id, { otherEmail, lastMessage: '', lastAt: 0, unread: 0 });
                }
                listenToChatMessages(chatDoc.id, otherEmail);
                listenToUnreadCount(chatDoc.id, otherEmail, myUid);
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

    window.addEventListener('unload', () => {
        messageUnsubscribers.forEach(unsub => unsub());
        unreadUnsubscribers.forEach(unsub => unsub());
    });
})();
