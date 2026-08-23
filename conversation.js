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

// =====================================================
// دالة أمان أساسية: بتتأكد إن الـ uid الحالي بتاع جلسة
// Firebase Auth (anonymous) هو فعلاً نفس الـ uid اللي
// اتسجل وقت التحقق من الإيميل ده (users/{email}.uid).
//
// المشكلة اللي بتحلها: لو حد كتب إيميلك يدويًا في
// localStorage بتاعه (cz_verified_email) على جهاز تاني،
// هيدخل بجلسة anonymous جديدة ليها uid مختلف تمامًا عن
// اللي مسجل فعليًا لإيميلك. من غير الفحص ده، الكود القديم
// كان بيسمحله يفتح المحادثة ويضيف نفسه للـ participants
// (arrayUnion) من غير أي تحقق حقيقي إنه صاحب الإيميل.
//
// ملحوظة: ده تحسين على مستوى الفرونت إند بيمنع السيناريو
// العملي (حد يكتب إيميلك في localStorage بتاعه). مش بديل
// كامل عن تحقق سيرفري حقيقي (Cloud Function + custom token)
// لأن أي حد عنده أدوات مطورين برضو يقدر نظريًا يتلاعب بالكود
// الشغال عنده محليًا. الحل الكامل محتاج Blaze plan.
// =====================================================
async function verifyOwnership(email, uid) {
    try {
        const userDocRef = doc(db, 'users', email.toLowerCase());
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) return false;
        const data = userSnap.data();
        return data.uid === uid;
    } catch (e) {
        console.error('فشل التحقق من ملكية الإيميل:', e);
        return false;
    }
}

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
            unknown_contact: 'مستخدم'
        },
        en: {
            type_message: 'Type a message...',
            back: 'Back',
            unknown_contact: 'User'
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

    // بنحط اسم مبدئي مشتق من الإيميل فورًا (عشان الشاشة متفضلش فاضية)،
    // وبعدين نستبدله بالاسم الحقيقي المحفوظ في users/{email}.name أول
    // ما نجيبه من Firestore. مفيش حالة أونلاين/أوفلاين خالص دلوقتي —
    // شاشة الحالة اتشالت نهائيًا بناءً على طلب المستخدم.
    convNameEl.textContent = displayNameFromEmail(otherEmail);
    convStatusEl.textContent = '';

    async function loadOtherRealName() {
        try {
            const otherUserRef = doc(db, 'users', otherEmail.toLowerCase());
            const snap = await getDoc(otherUserRef);
            if (snap.exists()) {
                const data = snap.data();
                if (data.name) {
                    convNameEl.textContent = data.name;
                }
            }
        } catch (e) {
            // لو فشل الجلب لأي سبب، بيفضل الاسم المشتق من الإيميل كبديل
            console.error('فشل جلب الاسم الحقيقي للطرف التاني:', e);
        }
    }

    loadOtherRealName();

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

    function appendMessage(msg, myEmailLower) {
        // بنحدد "هل الرسالة دي بتاعتي أنا؟" بمقارنة الإيميل، مش الـ uid،
        // لأن الـ uid بتاع Anonymous Auth ممكن يتغيّر بين جلسة وتانية
        // (لو الكاش اتمسح أو الجهاز غيّر حالة الاتصال)، لكن الإيميل ثابت.
        const isMine = (msg.senderEmail || '').toLowerCase() === myEmailLower;

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

    // بتستنى لحد ما مستند الشات على السيرفر فعليًا يحتوي على uid بتاعي
    // جوه participants، مع محاولات محدودة عشان منعلقش لو حصل مشكلة
    // تانية غير متوقعة.
    async function waitUntilIAmParticipant(chatDocRef, uid, maxTries) {
        maxTries = maxTries || 10;
        for (let i = 0; i < maxTries; i++) {
            try {
                const snap = await getDoc(chatDocRef);
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.participants && data.participants.includes(uid)) {
                        return true;
                    }
                }
            } catch (e) {
                // لسه مرفوضة، هنكمل نحاول
            }
            await new Promise(res => setTimeout(res, 300));
        }
        console.error('لم يتم التأكد من انضمامي إلى participants بعد عدة محاولات.');
        return false;
    }

    // بتحاول تحدّث حالة رسالة لـ read مع إعادة محاولة لو فشلت لأول مرة
    // (بسبب توقيت الـ Security Rules)، بدل ما تفشل بصمت للأبد.
    function updateStatusWithRetry(docRef, tries) {
        tries = tries || 3;
        updateDoc(docRef, { status: 'read' }).catch((err) => {
            if (tries > 1) {
                setTimeout(() => updateStatusWithRetry(docRef, tries - 1), 500);
            } else {
                console.error('فشل تحديث حالة الرسالة إلى مقروءة نهائيًا:', err);
            }
        });
    }

    async function initChat() {
        // لازم جلسة Firebase Auth حقيقية قبل أي قراءة/كتابة، وإلا
        // الـ Firestore Rules هترفض الطلب.
        const user = await ensureAuthenticated();
        myUid = user.uid;

        // فحص ملكية الإيميل: لازم الـ uid الحالي يطابق اللي مسجل
        // فعليًا لإيميلي في users/{email}. لو مش متطابق، معناه إن
        // اللي حاطط الإيميل ده في localStorage مش هو صاحبه الحقيقي،
        // فنرفض الدخول فورًا قبل ما نلمس أي محادثة.
        const owns = await verifyOwnership(myEmail, myUid);
        if (!owns) {
            console.error('فشل التحقق من ملكية الإيميل — الجلسة الحالية غير مطابقة.');
            localStorage.removeItem('cz_verified_email');
            localStorage.removeItem('cz_active_chat_email');
            window.location.href = 'MainActivity.html';
            return;
        }

        const chatDocRef = doc(db, 'chats', chatId);

        // =====================================================
        // ليه غيّرنا الطريقة بالكامل:
        // مع الـ Rules الحالية، لو المستند مش موجود خالص، أي محاولة
        // لقراءته (getDoc) بترمي "permission-denied" (مش "not found")
        // لأن الـ rule بتحاول توصل resource.data.participants على
        // مستند مالوش data أصلاً. يعني مستحيل نفرّق من نتيجة القراءة
        // بس هل المستند "مش موجود" أو "موجود ومرفوض" — الاتنين شكلهم
        // نفس الخطأ بالظبط.
        //
        // الحل: منعتمدش على القراءة خالص لتحديد الحالة. بدل كده:
        //   1) نجرب ننشئ المستند (setDoc بدون merge) — لو نجح، معناه
        //      كان فعلاً أول مرة، وخلاص إحنا الطرف الوحيد لحد دلوقتي.
        //   2) لو فشل بـ "already-exists" أو "permission-denied"
        //      (لأن create مسموحة بس لو المستند مش موجود أصلاً حسب
        //      قواعد Firestore الداخلية)، معناه إن حد تاني سبقنا
        //      وعمل المستند، فنحاول بعدها updateDoc (arrayUnion)
        //      اللي مسموح بيه حتى لو أنا مش participant لسه.
        // =====================================================
        let joined = false;

        try {
            await setDoc(chatDocRef, {
                participants: [myUid],
                participantsEmails: [myEmail.toLowerCase(), otherEmail.toLowerCase()],
                createdAt: serverTimestamp()
            });
            joined = true;
        } catch (createErr) {
            // فشل الإنشاء = غالبًا المستند موجود بالفعل (الطرف التاني
            // بدأ المحادثة قبلي). نحاول أضيف نفسي بدل ما أنشئه.
        }

        if (!joined) {
            try {
                await updateDoc(chatDocRef, {
                    participants: arrayUnion(myUid)
                });
                joined = true;
            } catch (updateErr) {
                console.error(
                    'فشل الانضمام كـ participant للمحادثة. كود الخطأ:',
                    updateErr.code, updateErr.message
                );
                throw updateErr;
            }
        }

        // =====================================================
        // تأكيد فعلي إن الـ uid بتاعي بقى موجود في participants على
        // السيرفر (مش بس إن الـ Promise فوق خلص من غير error) قبل ما
        // نبدأ نستمع للرسايل. ده بيمنع المشكلة اللي كانت بتحصل:
        // markIncomingMessagesAsRead بيتنفذ بسرعة جدًا بعد الانضمام،
        // والـ Security Rules بترفض تحديث status لأن الانضمام لسه ما
        // اتأكدش فعليًا في نسخة السيرفر من المستند (خصوصًا مع اتصال
        // بطيء)، فرسايل الطرف التاني تفضل "صح واحدة" للأبد عند
        // المرسل حتى لو أنا فاتح الشات وشايفها فعليًا.
        // =====================================================
        await waitUntilIAmParticipant(chatDocRef, myUid);

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
            docs.forEach(d => appendMessage(d.data(), myEmail.toLowerCase()));
            scrollToBottom(false);

            // أي رسالة وصلتلي من الطرف التاني ولسه حالتها unread،
            // معناه إني دلوقتي فاتح الشات وشايفها فعليًا، فنعلّمها read
            // عشان الطرف اللي بعتها يشوف الصح الزرقة عنده.
            markIncomingMessagesAsRead(docs);
        }, (err) => {
            console.error('فشل الاستماع للرسايل:', err);
        });
    }

    const myEmailLower = myEmail.toLowerCase();

    function markIncomingMessagesAsRead(docs) {
        docs.forEach(d => {
            const data = d.data();
            const isFromOther = (data.senderEmail || '').toLowerCase() !== myEmailLower;
            const needsUpdate = data.status === 'unread';
            if (isFromOther && needsUpdate) {
                updateStatusWithRetry(d.ref);
            }
        });
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
            // كل رسالة بتتبعت بحالة "unread" (صح رمادية)، وتتحول "read"
            // (صح زرقاء) لما الطرف التاني يفتح الشات فعليًا ويشوفها —
            // مفيش تفرقة أونلاين/أوفلاين خالص دلوقتي.
            status: 'unread'
        }).then(() => {
            if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
        }).catch((err) => {
            console.error('فشل إرسال الرسالة:', err);
        });
    }

    sendBtn.addEventListener('click', sendMessage);

    initChat().catch((err) => {
        console.error('فشل تهيئة المحادثة. الكود:', err && err.code, '— الرسالة:', err && err.message, err);
    });

    window.addEventListener('unload', () => {
        if (unsubscribeMessages) unsubscribeMessages();
    });
})();
