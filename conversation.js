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
            unknown_contact: 'مستخدم',
            conv_menu_bubbles: 'تخصيص لون الفقاعات',
            conv_menu_bubbles_sub: 'غيّر لون فقاعات الرسائل في الشات ده بس',
            conv_menu_font: 'تخصيص الخط',
            conv_menu_font_sub: 'اختر خط الكتابة في الشات',
            conv_menu_info: 'معلومات الحساب',
            conv_menu_info_sub: 'اسم وإيميل الشخص اللي بتكلمه',
            bubbles_title: 'تخصيص لون الفقاعات',
            bubbles_body: 'الألوان دي هتتطبق في الشات ده بس. لو دخلت شات تاني هتلاقي الفقاعات البيضاء العادية.',
            bubbles_mine_title: 'فقاعتي أنا',
            bubbles_theirs_title: 'فقاعة الطرف التاني',
            bubbles_default: 'افتراضي',
            bubbles_silver: 'فضي',
            bubbles_green: 'أخضر',
            bubbles_blue: 'أزرق',
            bubbles_pink: 'وردي',
            bubbles_purple: 'بنفسجي',
            bubbles_orange: 'برتقالي',
            bubbles_cyan: 'سماوي',
            bubbles_red: 'أحمر',
            bubbles_dark: 'داكن',
            bubbles_reset: 'إرجاع الافتراضي',
            font_title: 'تخصيص الخط',
            font_body: 'اختر خط الكتابة في الشات، وسيتم حفظه واستخدامه دايمًا في كل المحادثات.',
            font_default: 'الافتراضي',
            font_deco_ar: '(خط زخرفي عربي)',
            font_deco_en: '(خط زخرفي إنجليزي)',
            info_name_label: 'الاسم',
            info_email_label: 'البريد الإلكتروني'
        },
        en: {
            type_message: 'Type a message...',
            back: 'Back',
            unknown_contact: 'User',
            conv_menu_bubbles: 'Customize bubble colors',
            conv_menu_bubbles_sub: 'Change message bubble colors for this chat only',
            conv_menu_font: 'Customize font',
            conv_menu_font_sub: 'Choose the chat font',
            conv_menu_info: 'Account info',
            conv_menu_info_sub: 'Name and email of the person you\'re chatting with',
            bubbles_title: 'Customize bubble colors',
            bubbles_body: 'These colors apply to this chat only. Other chats will still show the default white bubbles.',
            bubbles_mine_title: 'My bubble',
            bubbles_theirs_title: 'Their bubble',
            bubbles_default: 'Default',
            bubbles_silver: 'Silver',
            bubbles_green: 'Green',
            bubbles_blue: 'Blue',
            bubbles_pink: 'Pink',
            bubbles_purple: 'Purple',
            bubbles_orange: 'Orange',
            bubbles_cyan: 'Cyan',
            bubbles_red: 'Red',
            bubbles_dark: 'Dark',
            bubbles_reset: 'Reset to default',
            font_title: 'Customize font',
            font_body: 'Choose the chat font. It will be saved and used across all conversations.',
            font_default: 'Default',
            font_deco_ar: '(Arabic decorative font)',
            font_deco_en: '(English decorative font)',
            info_name_label: 'Name',
            info_email_label: 'Email'
        }
    };
    const T = I18N[isAr ? 'ar' : 'en'];

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (T[key] !== undefined) el.textContent = T[key];
    });

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

    let otherRealName = displayNameFromEmail(otherEmail);

    async function loadOtherRealName() {
        try {
            const otherUserRef = doc(db, 'users', otherEmail.toLowerCase());
            const snap = await getDoc(otherUserRef);
            if (snap.exists()) {
                const data = snap.data();
                if (data.name) {
                    otherRealName = data.name;
                    convNameEl.textContent = data.name;
                }
            }
        } catch (e) {
            // لو فشل الجلب لأي سبب، بيفضل الاسم المشتق من الإيميل كبديل
            console.error('فشل جلب الاسم الحقيقي للطرف التاني:', e);
        } finally {
            populateAccountInfo();
        }
    }

    // =====================================================
    // معلومات الحساب (اسم + إيميل الطرف التاني) — بتتحط في
    // شيت "معلومات الحساب" اللي بيتفتح من قايمة التلت نقط
    // =====================================================
    function populateAccountInfo() {
        const avatarEl = document.getElementById('accountInfoAvatar');
        const nameEl = document.getElementById('accountInfoName');
        const emailEl = document.getElementById('accountInfoEmail');
        const nameValEl = document.getElementById('accountInfoNameValue');
        const emailValEl = document.getElementById('accountInfoEmailValue');

        if (avatarEl) avatarEl.textContent = otherRealName.trim().charAt(0).toUpperCase() || '؟';
        if (nameEl) nameEl.textContent = otherRealName;
        if (emailEl) emailEl.textContent = otherEmail;
        if (nameValEl) nameValEl.textContent = otherRealName;
        if (emailValEl) emailValEl.textContent = otherEmail;
    }

    populateAccountInfo();
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

    // =====================================================
    // 4.1) قايمة التلت نقط الخاصة بشاشة الشات (زي اللي في
    //      الصفحة الرئيسية بالظبط، بس بخيارات مختلفة)
    // =====================================================
    const convMenuBtn = document.getElementById('convMenuBtn');
    const convSidebarMenu = document.getElementById('convSidebarMenu');
    const convSidebarOverlay = document.getElementById('convSidebarOverlay');

    function openConvMenu() {
        if (!convSidebarMenu || !convSidebarOverlay || !convMenuBtn) return;
        const isRtl = document.documentElement.dir === 'rtl';
        const btnRect = convMenuBtn.getBoundingClientRect();
        convSidebarMenu.style.top = (btnRect.bottom + 8) + 'px';
        if (isRtl) {
            convSidebarMenu.style.right = (window.innerWidth - btnRect.right) + 'px';
            convSidebarMenu.style.left = 'auto';
        } else {
            convSidebarMenu.style.left = btnRect.left + 'px';
            convSidebarMenu.style.right = 'auto';
        }
        convSidebarMenu.classList.add('open');
        convSidebarOverlay.classList.add('open');
    }

    function closeConvMenu() {
        if (!convSidebarMenu || !convSidebarOverlay) return;
        convSidebarMenu.classList.remove('open');
        convSidebarOverlay.classList.remove('open');
    }

    if (convMenuBtn) {
        convMenuBtn.addEventListener('click', () => {
            if (convSidebarMenu && convSidebarMenu.classList.contains('open')) {
                closeConvMenu();
            } else {
                openConvMenu();
            }
        });
    }
    if (convSidebarOverlay) {
        convSidebarOverlay.addEventListener('click', closeConvMenu);
    }

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

    const convOpenBubbleColors = document.getElementById('convOpenBubbleColors');
    const convOpenFont = document.getElementById('convOpenFont');
    const convOpenInfo = document.getElementById('convOpenInfo');

    if (convOpenBubbleColors) {
        convOpenBubbleColors.addEventListener('click', () => {
            closeConvMenu();
            openSheet('sheet-bubble-colors');
        });
    }
    if (convOpenFont) {
        convOpenFont.addEventListener('click', () => {
            closeConvMenu();
            openSheet('sheet-font');
        });
    }
    if (convOpenInfo) {
        convOpenInfo.addEventListener('click', () => {
            closeConvMenu();
            openSheet('sheet-account-info');
        });
    }

    // =====================================================
    // 4.2) تخصيص لون الفقاعات — خاص بكل شات لوحده (بيتحفظ
    //      باستخدام chatId كجزء من المفتاح)، وبيتطبق فورًا
    //      عن طريق CSS variables على .conv-shell
    // =====================================================
    const convShellEl = document.querySelector('.conv-shell');
    const BUBBLE_MINE_KEY = 'cz_bubble_mine_' + chatId;
    const BUBBLE_THEIRS_KEY = 'cz_bubble_theirs_' + chatId;

    function textColorFor(hex, isDark) {
        if (isDark === '1') return '#10161A';
        return '#FFFFFF';
    }

    function timeColorFor(hex, isDark) {
        return isDark === '1' ? 'rgba(16, 22, 26, 0.55)' : 'rgba(255, 255, 255, 0.7)';
    }

    function tickColorFor(isDark) {
        return isDark === '1' ? 'rgba(16, 22, 26, 0.45)' : 'rgba(255, 255, 255, 0.6)';
    }

    function applyBubbleColors() {
        const mineColor = localStorage.getItem(BUBBLE_MINE_KEY);
        const theirsColor = localStorage.getItem(BUBBLE_THEIRS_KEY);
        const mineDark = localStorage.getItem(BUBBLE_MINE_KEY + '_dark') || '1';
        const theirsDark = localStorage.getItem(BUBBLE_THEIRS_KEY + '_dark') || '1';

        if (convShellEl) {
            if (mineColor) {
                convShellEl.style.setProperty('--bubble-mine-bg', mineColor);
                convShellEl.style.setProperty('--bubble-mine-text', textColorFor(mineColor, mineDark));
                convShellEl.style.setProperty('--bubble-mine-time', timeColorFor(mineColor, mineDark));
                convShellEl.style.setProperty('--bubble-mine-tick', tickColorFor(mineDark));
            } else {
                convShellEl.style.removeProperty('--bubble-mine-bg');
                convShellEl.style.removeProperty('--bubble-mine-text');
                convShellEl.style.removeProperty('--bubble-mine-time');
                convShellEl.style.removeProperty('--bubble-mine-tick');
            }
            if (theirsColor) {
                convShellEl.style.setProperty('--bubble-theirs-bg', theirsColor);
                convShellEl.style.setProperty('--bubble-theirs-text', textColorFor(theirsColor, theirsDark));
                convShellEl.style.setProperty('--bubble-theirs-time', timeColorFor(theirsColor, theirsDark));
            } else {
                convShellEl.style.removeProperty('--bubble-theirs-bg');
                convShellEl.style.removeProperty('--bubble-theirs-text');
                convShellEl.style.removeProperty('--bubble-theirs-time');
            }
        }
    }

    function markSelectedSwatch(gridEl, savedColor) {
        if (!gridEl) return;
        const options = gridEl.querySelectorAll('.bubble-swatch-option');
        options.forEach(opt => {
            const isDefault = opt.dataset.color === '#FFFFFF' && !savedColor;
            const isMatch = savedColor && opt.dataset.color.toLowerCase() === savedColor.toLowerCase();
            opt.classList.toggle('selected', isDefault || isMatch);
        });
    }

    const gridMine = document.getElementById('bubbleSwatchGridMine');
    const gridTheirs = document.getElementById('bubbleSwatchGridTheirs');
    const bubbleResetBtn = document.getElementById('bubbleResetBtn');

    function initBubbleColorUI() {
        markSelectedSwatch(gridMine, localStorage.getItem(BUBBLE_MINE_KEY));
        markSelectedSwatch(gridTheirs, localStorage.getItem(BUBBLE_THEIRS_KEY));
    }

    if (gridMine) {
        gridMine.querySelectorAll('.bubble-swatch-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const color = opt.dataset.color;
                const isDark = opt.dataset.textDark;
                if (color === '#FFFFFF') {
                    localStorage.removeItem(BUBBLE_MINE_KEY);
                    localStorage.removeItem(BUBBLE_MINE_KEY + '_dark');
                } else {
                    localStorage.setItem(BUBBLE_MINE_KEY, color);
                    localStorage.setItem(BUBBLE_MINE_KEY + '_dark', isDark);
                }
                markSelectedSwatch(gridMine, localStorage.getItem(BUBBLE_MINE_KEY));
                applyBubbleColors();
                if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
            });
        });
    }

    if (gridTheirs) {
        gridTheirs.querySelectorAll('.bubble-swatch-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const color = opt.dataset.color;
                const isDark = opt.dataset.textDark;
                if (color === '#FFFFFF') {
                    localStorage.removeItem(BUBBLE_THEIRS_KEY);
                    localStorage.removeItem(BUBBLE_THEIRS_KEY + '_dark');
                } else {
                    localStorage.setItem(BUBBLE_THEIRS_KEY, color);
                    localStorage.setItem(BUBBLE_THEIRS_KEY + '_dark', isDark);
                }
                markSelectedSwatch(gridTheirs, localStorage.getItem(BUBBLE_THEIRS_KEY));
                applyBubbleColors();
                if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
            });
        });
    }

    if (bubbleResetBtn) {
        bubbleResetBtn.addEventListener('click', () => {
            localStorage.removeItem(BUBBLE_MINE_KEY);
            localStorage.removeItem(BUBBLE_MINE_KEY + '_dark');
            localStorage.removeItem(BUBBLE_THEIRS_KEY);
            localStorage.removeItem(BUBBLE_THEIRS_KEY + '_dark');
            initBubbleColorUI();
            applyBubbleColors();
            if (navigator.vibrate) { try { navigator.vibrate([6, 30, 6]); } catch (e) {} }
        });
    }

    initBubbleColorUI();
    applyBubbleColors();

    // =====================================================
    // 4.3) تخصيص الخط — عام لكل الشاتات (مش خاص بشات واحد
    //      زي الفقاعات)، بيتحفظ ويفضل شغال دايمًا لحد ما
    //      يتغيّر تاني من نفس الشيت
    // =====================================================
    const FONT_KEY = 'cz_chat_font';
    const FONT_CLASS_PREFIX = 'font-';
    const FONT_IDS = ['default', 'cairo', 'tajawal', 'amiri', 'reem', 'lobster', 'pacifico', 'dancing'];

    function applyChatFont(fontId) {
        if (!convShellEl) return;
        FONT_IDS.forEach(id => convShellEl.classList.remove(FONT_CLASS_PREFIX + id));
        if (fontId && fontId !== 'default') {
            convShellEl.classList.add(FONT_CLASS_PREFIX + fontId);
        }
    }

    function markSelectedFont(fontId) {
        document.querySelectorAll('.font-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.font === fontId);
        });
    }

    const savedFont = localStorage.getItem(FONT_KEY) || 'default';
    applyChatFont(savedFont);
    markSelectedFont(savedFont);

    document.querySelectorAll('.font-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const fontId = opt.dataset.font;
            localStorage.setItem(FONT_KEY, fontId);
            applyChatFont(fontId);
            markSelectedFont(fontId);
            if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
        });
    });

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
        // الحل الجديد للمشكلة: "الطرف التاني مش شايف الشات في قائمة
        // الدردشات عنده لحد ما هو بنفسه يفتح المحادثة الأول". قبل
        // إنشاء الشات، بنجرب نجيب uid بتاع الطرف التاني من
        // users/{otherEmail} — لو هو مسجّل بالفعل في الأبب (حتى لو
        // معندوش شات مفتوح معايا لسه)، بنحط uid بتاعه هو كمان جوه
        // participants من الأول، فيظهر عنده الشات فورًا في قائمته
        // الرئيسية من غير ما يحتاج يفتح المحادثة بنفسه الأول.
        //
        // لو لسه مش مسجّل خالص (users/{email} مش موجود)، بنكمل عادي
        // بـ uid بتاعي أنا بس، وهيتضاف هو تلقائيًا أول ما يفتح
        // المحادثة أو يسجّل بعدين (نفس السلوك القديم كـ fallback).
        // =====================================================
        let otherUid = null;
        try {
            const otherUserSnap = await getDoc(doc(db, 'users', otherEmail.toLowerCase()));
            if (otherUserSnap.exists() && otherUserSnap.data().uid) {
                otherUid = otherUserSnap.data().uid;
            }
        } catch (e) {
            // لو فشل الجلب لأي سبب، هنكمل من غير uid بتاع الطرف التاني
            // (fallback القديم: هيتضاف هو بنفسه أول ما يفتح الشات)
            console.error('تعذّر جلب uid الطرف التاني وقت إنشاء المحادثة:', e);
        }

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
        //      كان فعلاً أول مرة، وخلاص إحنا الطرف الوحيد (أو إحنا +
        //      الطرف التاني لو كان مسجّل ولقينا uid بتاعه فوق).
        //   2) لو فشل بـ "already-exists" أو "permission-denied"
        //      (لأن create مسموحة بس لو المستند مش موجود أصلاً حسب
        //      قواعد Firestore الداخلية)، معناه إن حد تاني سبقنا
        //      وعمل المستند، فنحاول بعدها updateDoc (arrayUnion)
        //      اللي مسموح بيه حتى لو أنا مش participant لسه.
        // =====================================================
        let joined = false;

        const initialParticipants = otherUid ? [myUid, otherUid] : [myUid];

        try {
            await setDoc(chatDocRef, {
                participants: initialParticipants,
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
