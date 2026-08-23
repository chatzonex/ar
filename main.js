import {
    db,
    doc,
    getDoc,
    updateDoc,
    deleteField,
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
    // pinned: تثبيت الشات (خاص بيا أنا بس) — pinnedFor.{myUid} == true
    // deletedAt: وقت "حذف الشات من عندي" (خاص بيا أنا بس) — أي رسالة
    // جاية بعد الوقت ده بترجّع الشات يظهر تاني تلقائيًا.
    const chatsState = new Map(); // chatId -> { otherEmail, lastMessage, lastAt, unread, pinned, deletedAt }
    let messageUnsubscribers = new Map(); // chatId -> unsubscribe fn
    let unreadUnsubscribers = new Map(); // chatId -> unsubscribe fn
    let myUidGlobal = null;

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
        // الشات اللي اتحذف "من عندي" بيتخفي من القائمة، إلا لو وصلت
        // رسالة جديدة بعد وقت الحذف (يعني لسه في محادثة فعلية شغالة).
        const entries = Array.from(chatsState.entries())
            .filter(([, entry]) => !entry.deletedAt || (entry.lastAt || 0) > entry.deletedAt)
            .map(([chatId, entry]) => ({ chatId, ...entry }));

        if (!entries.length) {
            renderEmptyChatsState();
            updateGlobalUnreadBadge();
            return;
        }

        // المثبّت الأول، وبعدين ترتيب حسب آخر رسالة
        entries.sort((a, b) => {
            const ap = a.pinned ? 1 : 0;
            const bp = b.pinned ? 1 : 0;
            if (ap !== bp) return bp - ap;
            return (b.lastAt || 0) - (a.lastAt || 0);
        });

        const pinIconSvg = `<svg class="chat-row-pin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>`;

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
                <div class="chat-row${unreadCount > 0 ? ' chat-row-unread' : ''}${entry.pinned ? ' chat-row-pinned' : ''}" data-email="${entry.otherEmail}" data-chat-id="${entry.chatId}" data-pinned="${entry.pinned ? '1' : '0'}">
                    <div class="chat-row-avatar">${initial}</div>
                    <div class="chat-row-text">
                        <h4 class="chat-row-name">${name}</h4>
                        <p class="chat-row-preview">${preview}</p>
                    </div>
                    <div class="chat-row-meta">
                        <div class="chat-row-meta-top">
                            ${entry.pinned ? pinIconSvg : ''}
                            <span class="chat-row-time">${timeStr}</span>
                        </div>
                        ${unreadBadge}
                    </div>
                </div>`;
        }));

        chatsListEl.innerHTML = rows.join('');

        chatsListEl.querySelectorAll('.chat-row').forEach(row => {
            attachChatRowInteractions(row);
        });

        updateGlobalUnreadBadge();
    }

    // =====================================================
    // ضغطة مطولة على كارت الشات -> قايمة (تثبيت / حذف)
    // =====================================================
    const LONG_PRESS_MS = 450;

    function attachChatRowInteractions(row) {
        row.addEventListener('click', () => {
            goToConversation(row.getAttribute('data-email'));
        });

        let pressTimer = null;
        let longPressed = false;
        let startX = 0, startY = 0;

        function cancelPress() {
            if (pressTimer) clearTimeout(pressTimer);
            pressTimer = null;
        }

        function startPress(x, y) {
            longPressed = false;
            startX = x; startY = y;
            pressTimer = setTimeout(() => {
                longPressed = true;
                if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
                openChatCtxMenu(row);
            }, LONG_PRESS_MS);
        }

        row.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            startPress(touch.clientX, touch.clientY);
        }, { passive: true });

        row.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
                cancelPress();
            }
        }, { passive: true });

        row.addEventListener('touchend', () => {
            cancelPress();
        });

        row.addEventListener('mousedown', (e) => {
            startPress(e.clientX, e.clientY);
        });
        row.addEventListener('mouseup', cancelPress);
        row.addEventListener('mouseleave', cancelPress);

        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openChatCtxMenu(row);
        });

        // بنمنع الـ click العادي (فتح الشات) لو كانت الضغطة طويلة فعلاً
        row.addEventListener('click', (e) => {
            if (longPressed) {
                e.stopImmediatePropagation();
                e.preventDefault();
                longPressed = false;
            }
        }, true);
    }

    // ===== Context menu: تثبيت / حذف =====
    const chatCtxOverlay = document.getElementById('chatCtxOverlay');
    const chatCtxMenu = document.getElementById('chatCtxMenu');
    const chatCtxPin = document.getElementById('chatCtxPin');
    const chatCtxPinLabel = document.getElementById('chatCtxPinLabel');
    const chatCtxDelete = document.getElementById('chatCtxDelete');
    let ctxTargetChatId = null;
    let ctxTargetEmail = null;

    function openChatCtxMenu(row) {
        ctxTargetChatId = row.getAttribute('data-chat-id');
        ctxTargetEmail = row.getAttribute('data-email');
        const isPinned = row.getAttribute('data-pinned') === '1';
        if (chatCtxPinLabel) {
            chatCtxPinLabel.textContent = isPinned
                ? t('إلغاء تثبيت المحادثة', 'Unpin chat')
                : t('تثبيت المحادثة', 'Pin chat');
        }

        if (!chatCtxMenu || !chatCtxOverlay) return;
        const rect = row.getBoundingClientRect();
        const isRtl = document.documentElement.dir === 'rtl';
        let top = rect.bottom + 6;
        const menuHeightEstimate = 110;
        if (top + menuHeightEstimate > window.innerHeight) {
            top = Math.max(10, rect.top - menuHeightEstimate - 6);
        }
        chatCtxMenu.style.top = top + 'px';
        if (isRtl) {
            chatCtxMenu.style.right = Math.max(10, window.innerWidth - rect.right) + 'px';
            chatCtxMenu.style.left = 'auto';
        } else {
            chatCtxMenu.style.left = Math.max(10, rect.left) + 'px';
            chatCtxMenu.style.right = 'auto';
        }
        chatCtxMenu.classList.add('open');
        chatCtxOverlay.classList.add('open');
    }

    function closeChatCtxMenu() {
        if (chatCtxMenu) chatCtxMenu.classList.remove('open');
        if (chatCtxOverlay) chatCtxOverlay.classList.remove('open');
    }

    if (chatCtxOverlay) chatCtxOverlay.addEventListener('click', closeChatCtxMenu);

    if (chatCtxPin) {
        chatCtxPin.addEventListener('click', async () => {
            const chatId = ctxTargetChatId;
            closeChatCtxMenu();
            if (!chatId || !myUidGlobal) return;
            const entry = chatsState.get(chatId);
            const willPin = !(entry && entry.pinned);
            try {
                await updateDoc(doc(db, 'chats', chatId), {
                    ['pinnedFor.' + myUidGlobal]: willPin ? true : deleteField()
                });
                if (entry) {
                    entry.pinned = willPin;
                    chatsState.set(chatId, entry);
                    renderChatsList();
                }
            } catch (e) {
                console.error('فشل تحديث تثبيت المحادثة:', e);
            }
        });
    }

    // ===== حذف الشات (من عندي بس) =====
    if (chatCtxDelete) {
        chatCtxDelete.addEventListener('click', () => {
            closeChatCtxMenu();
            openSheet('sheet-delete-chat');
        });
    }

    const deleteChatConfirmBtn = document.getElementById('deleteChatConfirmBtn');
    if (deleteChatConfirmBtn) {
        deleteChatConfirmBtn.addEventListener('click', async () => {
            const chatId = ctxTargetChatId;
            closeSheet('sheet-delete-chat');
            if (!chatId || !myUidGlobal) return;
            try {
                await updateDoc(doc(db, 'chats', chatId), {
                    ['deletedFor.' + myUidGlobal]: Date.now(),
                    ['pinnedFor.' + myUidGlobal]: deleteField()
                });
                const entry = chatsState.get(chatId);
                if (entry) {
                    entry.deletedAt = Date.now();
                    entry.pinned = false;
                    chatsState.set(chatId, entry);
                    renderChatsList();
                }
            } catch (e) {
                console.error('فشل حذف المحادثة:', e);
            }
        });
    }

    // ===== Sheet helpers (نفس منطق باقي الأبب) =====
    function openSheet(id) {
        const overlay = document.getElementById(id);
        if (overlay) overlay.classList.add('open');
    }
    function closeSheet(id) {
        const overlay = document.getElementById(id);
        if (overlay) overlay.classList.remove('open');
    }
    document.querySelectorAll('[data-close-sheet]').forEach(el => {
        el.addEventListener('click', () => closeSheet(el.dataset.closeSheet));
    });
    document.querySelectorAll('.sheet-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSheet(overlay.id);
        });
    });

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
    // معيّن، وبيحدّث الرقم على كارت الشات وعلى تاب الدردشات فورًا —
    // ده بيشتغل حتى لو المستخدم خارج شاشة الشات نفسها، طول ما
    // main.js فاتح (الصفحة الرئيسية).
    //
    // ملحوظة مهمة: الاستعلام هنا بيفلتر بـ status == 'unread' بس (فلتر
    // واحد)، وبنستبعد رسايلي أنا نفسي (senderUid == myUid) على مستوى
    // الكود مش داخل الاستعلام. ليه؟ لأن الفلتر المركّب اللي كان موجود
    // قبل كده (status == 'unread' AND senderUid != myUid) بيحتاج
    // composite index في Firestore غير موجود أصلاً في المشروع ده، فكل
    // مرة كان بيحصل فيها تحديث كان onSnapshot بيرجّع خطأ "failed-
    // precondition / index required" بدل الداتا، والكود القديم كان
    // بيكتفي بطباعة الخطأ في الكونسول من غير ما يحدّث entry.unread —
    // فالعدد كان بيفضل واقف على آخر قيمة نجحت تتحسب قبل كده بالصدفة
    // (غالبًا 1)، وده بالظبط سبب المشكلة اللي كانت بتظهر أحيانًا وأحيانًا
    // لأ، وبتجيب رسالة واحدة بس مش مقروءة مع إن فيه أكتر من واحدة.
    // الحل: استعلام بفلتر واحد بس (مش محتاج index)، والفلترة التانية
    // (استبعاد رسايلي أنا) بتتعمل على النتيجة نفسها بعد وصولها.
    function listenToUnreadCount(chatId, otherEmail, myUid) {
        if (unreadUnsubscribers.has(chatId)) return;
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, where('status', '==', 'unread'));
        const unsub = onSnapshot(q, (snap) => {
            let count = 0;
            snap.forEach(d => {
                const data = d.data();
                if (data.senderUid !== myUid) count++;
            });
            const entry = chatsState.get(chatId) || { otherEmail };
            entry.unread = count;
            chatsState.set(chatId, entry);
            renderChatsList();
        }, (err) => {
            console.error('فشل الاستماع لعدد الرسائل غير المقروءة:', err);
        });
        unreadUnsubscribers.set(chatId, unsub);
    }

    async function initChatsList() {
        let myUid = null;
        try {
            const user = await ensureAuthenticated();
            myUid = user.uid;
            myUidGlobal = user.uid;
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

                const pinnedFor = data.pinnedFor || {};
                const deletedFor = data.deletedFor || {};
                const pinned = !!pinnedFor[myUid];
                const deletedAt = typeof deletedFor[myUid] === 'number' ? deletedFor[myUid] : null;

                const entry = chatsState.get(chatDoc.id) || { otherEmail, lastMessage: '', lastAt: 0, unread: 0 };
                entry.pinned = pinned;
                entry.deletedAt = deletedAt;
                chatsState.set(chatDoc.id, entry);

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
