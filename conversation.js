import {
    db,
    doc,
    setDoc,
    getDoc,
    addDoc,
    updateDoc,
    arrayUnion,
    collection,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    ensureAuthenticated
} from "./firebase-init.js";

(function () {
    // =====================================================
    // 1) احترام الثيم واللغة والـ Liquid Glass المحفوظين
    //    من شاشة الإعدادات — بنفس منطق باقي شاشات الأبب
    // =====================================================
    const lang = localStorage.getItem('cz_lang') || 'ar';
    const theme = localStorage.getItem('cz_theme') || 'dark';
    const isAr = lang === 'ar';

    document.documentElement.lang = lang;
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';

    if (theme === 'white') document.body.classList.add('theme-white');
    if (theme === 'custom') {
        document.body.classList.add('theme-custom');
        const color = localStorage.getItem('cz_theme_color');
        if (color) document.documentElement.style.setProperty('--accent', color);
    }

    if (localStorage.getItem('cz_lg_bottombar') === 'on') {
        document.body.classList.add('lg-bottombar-on');
    }

    const I18N = {
        ar: {
            type_message: 'اكتب رسالة...',
            back: 'رجوع',
            online: 'أونلاين',
            offline: 'غير متصل',
            unknown_contact: 'مستخدم',
            connecting: 'جاري الاتصال...'
        },
        en: {
            type_message: 'Type a message...',
            back: 'Back',
            online: 'Online',
            offline: 'Offline',
            unknown_contact: 'User',
            connecting: 'Connecting...'
        }
    };
    const T = I18N[isAr ? 'ar' : 'en'];

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (T[key]) el.setAttribute('placeholder', T[key]);
    });

    // =====================================================
    // 2) لازم يكون فيه مستخدم مسجل دخول (Firebase Auth) قبل
    //    أي حاجة، وإلا نرجّعه لصفحة التسجيل
    // =====================================================
    const myEmail = localStorage.getItem('cz_verified_email');
    const otherEmail = localStorage.getItem('cz_active_chat_email') || '';

    if (!myEmail || !otherEmail) {
        window.location.href = 'MainActivity.html';
        return;
    }

    const convNameEl = document.getElementById('convName');
    const convStatusEl = document.getElementById('convStatus');

    function displayNameFromEmail(email) {
        if (!email) return T.unknown_contact;
        const namePart = email.split('@')[0];
        return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }

    convNameEl.textContent = displayNameFromEmail(otherEmail);
    convStatusEl.textContent = T.connecting;

    // =====================================================
    // 3) زرار الرجوع
    // =====================================================
    const backBtn = document.getElementById('convBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'MainActivity.html';
        });
    }

    // =====================================================
    // 4) بناء chatId ثابت من الإيميلين (مرتبين أبجديًا) عشان
    //    نفس الاتنين يوصلوا لنفس المحادثة أيًا كان مين بدأها
    // =====================================================
    function makeChatId(emailA, emailB) {
        return [emailA.toLowerCase(), emailB.toLowerCase()].sort().join('__');
    }

    const chatId = makeChatId(myEmail, otherEmail);

    const TICK_ICON = {
        unsent: 'tick-unsent',
        offline: 'tick-offline',
        unread: 'tick-unread',
        read: 'tick-read'
    };

    function formatTime(date) {
        let h = date.getHours();
        const m = date.getMinutes().toString().padStart(2, '0');
        const ampmAr = h < 12 ? 'ص' : 'م';
        const ampmEn = h < 12 ? 'AM' : 'PM';
        h = h % 12;
        if (h === 0) h = 12;
        return isAr ? `${h}:${m} ${ampmAr}` : `${h}:${m} ${ampmEn}`;
    }

    const messagesEl = document.getElementById('convMessages');

    function appendMessage(msg, myUid) {
        const isMine = msg.senderUid === myUid;

        const row = document.createElement('div');
        row.className = 'msg-row ' + (isMine ? 'from-me' : 'from-them');

        const bubble = document.createElement('div');
        bubble.className = 'bubble ' + (isMine ? 'bubble-right' : 'bubble-left');

        const textEl = document.createElement('p');
        textEl.className = 'bubble-text';
        textEl.textContent = msg.text;
        bubble.appendChild(textEl);

        const meta = document.createElement('div');
        meta.className = 'bubble-meta';

        const timeEl = document.createElement('span');
        timeEl.className = 'bubble-time';
        const time = msg.createdAt && msg.createdAt.toDate ? msg.createdAt.toDate() : new Date();
        timeEl.textContent = formatTime(time);
        meta.appendChild(timeEl);

        if (isMine) {
            const tick = document.createElement('span');
            const status = msg.status || 'unread';
            tick.className = 'bubble-tick ' + (TICK_ICON[status] || TICK_ICON.unread);
            meta.appendChild(tick);
        }

        bubble.appendChild(meta);
        row.appendChild(bubble);
        messagesEl.appendChild(row);
    }

    function scrollToBottom(smooth) {
        messagesEl.scrollTo({
            top: messagesEl.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
        });
    }

    function renderEmptyState() {
        messagesEl.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'conv-empty';
        empty.textContent = isAr ? 'مفيش رسائل لسه، ابدأ المحادثة 👋' : 'No messages yet, say hi 👋';
        messagesEl.appendChild(empty);
    }

    // =====================================================
    // 5) بار الكتابة
    // =====================================================
    const textarea = document.getElementById('convTextarea');
    const inputBar = document.getElementById('convInputBar');
    const sendBtn = document.getElementById('convSendBtn');

    function autoResize() {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    function updateSendVisibility() {
        const hasText = textarea.value.trim().length > 0;
        inputBar.classList.toggle('has-text', hasText);
    }

    textarea.addEventListener('input', () => {
        autoResize();
        updateSendVisibility();
    });

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    updateSendVisibility();

    // =====================================================
    // 6) الاتصال الفعلي بـ Firestore
    // =====================================================
    let myUid = null;
    let unsubscribeMessages = null;

    async function initChat() {
        // لازم جلسة Firebase Auth حقيقية قبل أي قراءة/كتابة، وإلا
        // الـ Firestore Rules هترفض الطلب.
        const user = await ensureAuthenticated();
        myUid = user.uid;

        const chatDocRef = doc(db, 'chats', chatId);

        // بنفرّق هنا بين حالتين مختلفتين تمامًا:
        //   - المستند مش موجود خالص (أول مرة يتفتح فيها الشات ده) → ننشئه.
        //   - المستند موجود، لكن الـ Rules رفضت القراءة لأن uid بتاعي
        //     لسه مش مسجل ضمن participants (أنا الطرف التاني وبفتح
        //     المحادثة أول مرة) → نضيف نفسي بـ updateDoc.
        let chatExists = false;
        let iAmAlreadyParticipant = false;

        try {
            const chatSnap = await getDoc(chatDocRef);
            chatExists = chatSnap.exists();
            if (chatExists) {
                const data = chatSnap.data();
                iAmAlreadyParticipant = !!(data.participants && data.participants.includes(myUid));
            }
        } catch (err) {
            // permission-denied هنا معناها الأرجح: المستند موجود بالفعل
            // لكن أنا لسه مش طرف مسجل فيه، فالـ Rules رفضت القراءة.
            chatExists = true;
            iAmAlreadyParticipant = false;
        }

        if (!chatExists) {
            // أول مرة يتفتح فيها الشات ده على الإطلاق.
            await setDoc(chatDocRef, {
                participants: [myUid],
                participantsEmails: [myEmail.toLowerCase(), otherEmail.toLowerCase()],
                createdAt: serverTimestamp()
            });
        } else if (!iAmAlreadyParticipant) {
            // المحادثة موجودة أصلاً (أنشأها الطرف التاني)، وأنا بفتحها
            // لأول مرة، فلازم أضيف uid بتاعي لمصفوفة participants.
            // الـ Rules بتسمح بده لأني بضيف نفسي بس من غير ما أشيل حد.
            await updateDoc(chatDocRef, {
                participants: arrayUnion(myUid)
            });
        }

        // حالة الأونلاين: نسجّل وقت آخر ظهور بتاعي في مستند المحادثة،
        // ونقرا حالة الطرف التاني من نفس المستند لحظيًا.
        markMyPresence(chatDocRef);
        window.addEventListener('beforeunload', () => markMyPresence(chatDocRef, true));

        onSnapshot(chatDocRef, (snap) => {
            if (!snap.exists()) return;
            updateOtherPresence(snap.data());
        });

        // الاستماع اللحظي للرسايل
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'));

        unsubscribeMessages = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs;
            if (!docs.length) {
                renderEmptyState();
                return;
            }
            messagesEl.innerHTML = '';
            docs.forEach(d => appendMessage(d.data(), myUid));
            scrollToBottom(false);
        }, (err) => {
            console.error('فشل الاستماع للرسايل:', err);
        });
    }

    // نعتبر المستخدم أونلاين لو آخر تحديث لحضوره كان خلال آخر 25 ثانية
    const PRESENCE_HEARTBEAT_MS = 15000;
    const PRESENCE_ONLINE_THRESHOLD_MS = 25000;
    let presenceInterval = null;

    async function markMyPresence(chatDocRef, isLeaving) {
        try {
            await updateDoc(chatDocRef, {
                ['presence_' + myUid]: isLeaving ? null : serverTimestamp()
            });
        } catch (e) {
            // مينفعش نستنى رد وقت إغلاق الصفحة، فبنتجاهل الخطأ بهدوء
        }
    }

    function updateOtherPresence(chatData) {
        // بندور على أي مفتاح presence_* غير بتاعي أنا
        const otherPresenceKey = Object.keys(chatData).find(
            k => k.startsWith('presence_') && k !== 'presence_' + myUid
        );
        const lastSeenTs = otherPresenceKey ? chatData[otherPresenceKey] : null;

        let isOnline = false;
        if (lastSeenTs && lastSeenTs.toDate) {
            isOnline = (Date.now() - lastSeenTs.toDate().getTime()) < PRESENCE_ONLINE_THRESHOLD_MS;
        }

        if (isOnline) {
            convStatusEl.textContent = T.online;
            convStatusEl.classList.add('is-online');
        } else {
            convStatusEl.textContent = T.offline;
            convStatusEl.classList.remove('is-online');
        }
    }

    function sendMessage() {
        const text = textarea.value.trim();
        if (!text || !myUid) return;

        textarea.value = '';
        autoResize();
        updateSendVisibility();

        const messagesRef = collection(db, 'chats', chatId, 'messages');
        addDoc(messagesRef, {
            senderUid: myUid,
            senderEmail: myEmail,
            text,
            createdAt: serverTimestamp(),
            status: 'unread'
        }).then(() => {
            if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
        }).catch((err) => {
            console.error('فشل إرسال الرسالة:', err);
        });
    }

    sendBtn.addEventListener('click', sendMessage);

    initChat().then(() => {
        presenceInterval = setInterval(() => {
            const chatDocRef = doc(db, 'chats', chatId);
            markMyPresence(chatDocRef);
        }, PRESENCE_HEARTBEAT_MS);
    }).catch((err) => {
        console.error('فشل تهيئة المحادثة:', err);
        convStatusEl.textContent = isAr ? 'تعذر الاتصال' : 'Connection failed';
    });

    window.addEventListener('unload', () => {
        if (unsubscribeMessages) unsubscribeMessages();
        if (presenceInterval) clearInterval(presenceInterval);
    });
})();
