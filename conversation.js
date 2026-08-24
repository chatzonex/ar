import {
    db,
    doc,
    setDoc,
    getDoc,
    addDoc,
    updateDoc,
    deleteField,
    arrayUnion,
    arrayRemove,
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

    // الزجاج السائل في شاشة الشات بقى مفتاح مستقل تمامًا (cz_lg_chat)
    // عن زجاج الرئيسية (cz_lg_bottombar) — كل واحد بيتفعّل لوحده من
    // غير ما يأثر على التاني.
    if (localStorage.getItem('cz_lg_chat') === 'on') {
        document.body.classList.add('lg-chat-on');
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
            info_email_label: 'البريد الإلكتروني',
            info_rename_label: 'تغيير الاسم',
            info_rename_placeholder: 'اكتب اسم جديد',
            info_rename_save: 'حفظ',
            info_rename_success: 'اتغيّر الاسم',
            info_rename_empty: 'اكتب اسم الأول',
            ctx_reply: 'رد',
            ctx_delete_msg: 'حذف الرسالة',
            ctx_delete_everyone: 'حذف من عند الطرفين',
            ctx_delete_me: 'حذف من عندي بس',
            delete_msg_title: 'حذف الرسالة؟',
            delete_msg_body_mine: 'تقدر تحذفها من عندك بس، أو من عند الطرفين.',
            delete_msg_body_theirs: 'هتتحذف من عندك أنت بس، ولسه هتفضل ظاهرة عند الطرف التاني.',
            deleted_msg_text: 'تم حذف هذه الرسالة',
            reply_you: 'أنت',
            msg_deleted_toast: 'اتحذفت الرسالة',
            typing_status: 'يكتب الآن...'
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
            info_email_label: 'Email',
            info_rename_label: 'Change name',
            info_rename_placeholder: 'Type a new name',
            info_rename_save: 'Save',
            info_rename_success: 'Name updated',
            info_rename_empty: 'Type a name first',
            ctx_reply: 'Reply',
            ctx_delete_msg: 'Delete message',
            ctx_delete_everyone: 'Delete for everyone',
            ctx_delete_me: 'Delete for me',
            delete_msg_title: 'Delete this message?',
            delete_msg_body_mine: 'You can delete it for you only, or for everyone.',
            delete_msg_body_theirs: 'It will be deleted for you only. It will still show for the other person.',
            deleted_msg_text: 'This message was deleted',
            reply_you: 'You',
            msg_deleted_toast: 'Message deleted',
            typing_status: 'typing...'
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
    // الاسم اللي أنا (بس أنا) غيّرته لجهة الاتصال دي في الشات ده —
    // لو موجود، بيتعرض بدل الاسم الحقيقي بتاعها، وده تأثير محلي عندي
    // أنا بس ومش بيغيّر أي حاجة عند الطرف التاني.
    let myContactName = '';

    function currentDisplayName() {
        return myContactName || otherRealName;
    }

    function refreshTopBarName() {
        convNameEl.textContent = currentDisplayName();
    }

    async function loadOtherRealName() {
        try {
            const otherUserRef = doc(db, 'users', otherEmail.toLowerCase());
            const snap = await getDoc(otherUserRef);
            if (snap.exists()) {
                const data = snap.data();
                if (data.name) {
                    otherRealName = data.name;
                    refreshTopBarName();
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
        const renameInput = document.getElementById('accountInfoRenameInput');

        const shownName = currentDisplayName();
        if (avatarEl) avatarEl.textContent = shownName.trim().charAt(0).toUpperCase() || '؟';
        if (nameEl) nameEl.textContent = shownName;
        if (emailEl) emailEl.textContent = otherEmail;
        if (nameValEl) nameValEl.textContent = shownName;
        if (emailValEl) emailValEl.textContent = otherEmail;
        // بنحط الاسم المخصّص (لو موجود) جاهز في خانة التعديل، مش الاسم
        // الحقيقي، عشان يبان للمستخدم إنه ده اللي هيتعدّل
        if (renameInput && document.activeElement !== renameInput) {
            renameInput.value = myContactName || '';
        }
    }

    populateAccountInfo();
    loadOtherRealName();

    // =====================================================
    // 2.1) تغيير اسم جهة الاتصال — محلي عندي أنا بس، بيتخزن جوه
    //      مستند الشات بتاعي تحت contactNames.{myUid}، وبيتطبق في كل
    //      حتة اسم الطرف التاني بيظهر فيها في الشات ده (مش بيغيّر
    //      اسمه الحقيقي عند حد تاني خالص).
    // =====================================================
    const renameInput = document.getElementById('accountInfoRenameInput');
    const renameSaveBtn = document.getElementById('accountInfoRenameSave');

    async function loadMyContactName() {
        try {
            const chatSnap = await getDoc(doc(db, 'chats', chatId));
            if (chatSnap.exists()) {
                const data = chatSnap.data();
                const names = data.contactNames || {};
                if (myUid && names[myUid]) {
                    myContactName = names[myUid];
                    refreshTopBarName();
                    populateAccountInfo();
                }
            }
        } catch (e) {
            console.error('فشل جلب الاسم المخصص لجهة الاتصال:', e);
        }
    }

    async function saveContactRename() {
        if (!renameInput || !myUid) return;
        const newName = renameInput.value.trim();
        if (!newName) {
            showToast(T.info_rename_empty);
            return;
        }
        renameSaveBtn.disabled = true;
        try {
            await updateDoc(doc(db, 'chats', chatId), {
                ['contactNames.' + myUid]: newName
            });
            myContactName = newName;
            refreshTopBarName();
            populateAccountInfo();
            showToast(T.info_rename_success);
            if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
        } catch (e) {
            console.error('فشل حفظ الاسم المخصص:', e);
        } finally {
            renameSaveBtn.disabled = false;
        }
    }

    if (renameSaveBtn) {
        renameSaveBtn.addEventListener('click', saveContactRename);
    }
    if (renameInput) {
        renameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveContactRename();
        });
    }

    // =====================================================
    // توست صغير (تأكيد "اتغيّر الاسم"، "اتحذفت الرسالة"... إلخ)
    // =====================================================
    let toastTimer = null;
    function showToast(message) {
        let toastEl = document.getElementById('czToast');
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.id = 'czToast';
            toastEl.className = 'cz-toast';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = message;
        toastEl.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
    }

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
    let messagesById = new Map(); // docId -> { data, isMine }

    function messagePreviewText(data) {
        if (data.deleted) return T.deleted_msg_text;
        return (data.text || '').length > 60 ? data.text.slice(0, 60) + '…' : (data.text || '');
    }

    function appendMessage(docId, msg, myEmailLower) {
        // بنحدد "هل الرسالة دي بتاعتي أنا؟" بمقارنة الإيميل، مش الـ uid،
        // لأن الـ uid بتاع Anonymous Auth ممكن يتغيّر بين جلسة وتانية
        // (لو الكاش اتمسح أو الجهاز غيّر حالة الاتصال)، لكن الإيميل ثابت.
        const isMine = (msg.senderEmail || '').toLowerCase() === myEmailLower;

        const row = document.createElement('div');
        row.className = 'msg-row ' + (isMine ? 'from-me' : 'from-them');
        row.dataset.msgId = docId;

        const inner = document.createElement('div');
        inner.className = 'msg-row-inner';

        const replyIcon = document.createElement('div');
        replyIcon.className = 'msg-row-reply-icon';
        replyIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>';
        row.appendChild(replyIcon);

        const bubble = document.createElement('div');
        bubble.className = 'bubble ' + (isMine ? 'bubble-right' : 'bubble-left');

        // لو الرسالة دي رد على رسالة تانية، بنعرض مقتطف صغير منها فوق
        // نص الرسالة نفسها (زي واتساب)
        if (msg.replyTo && msg.replyTo.text) {
            const quote = document.createElement('div');
            quote.className = 'bubble-reply-quote';
            const qName = document.createElement('span');
            qName.className = 'bubble-reply-quote-name';
            qName.textContent = msg.replyTo.isMineAuthor === undefined
                ? (msg.replyTo.senderName || '')
                : '';
            const qText = document.createElement('span');
            qText.className = 'bubble-reply-quote-text';
            qText.textContent = msg.replyTo.deleted ? T.deleted_msg_text : msg.replyTo.text;
            if (msg.replyTo.senderName) quote.appendChild(qName);
            quote.appendChild(qText);
            bubble.appendChild(quote);
            if (msg.replyTo.senderName) qName.textContent = msg.replyTo.senderName;
        }

        const textEl = document.createElement('p');
        textEl.className = 'bubble-text' + (msg.deleted ? ' deleted' : '');
        textEl.textContent = msg.deleted ? T.deleted_msg_text : msg.text;
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
        inner.appendChild(bubble);
        row.appendChild(inner);
        messagesEl.appendChild(row);

        if (!msg.deleted) {
            attachMessageInteractions(row, docId, msg, isMine);
        }
    }

    // ===== فقاعة "بيكتب الآن" المتحركة تحت آخر رسالة (زي واتساب) =====
    // ملحوظة: messagesEl.innerHTML بيتصفر بالكامل مع كل تحديث رسايل
    // (onSnapshot)، فمينفعش نعتمد على وجود العنصر في الـ DOM كعلامة
    // حالة — بنحتفظ بمتغيّر منفصل (otherIsTypingNow) وبنعيد إضافة
    // الفقاعة بعد أي إعادة رسم لو لسه محتاجة تظهر.
    let otherIsTypingNow = false;

    function renderTypingBubbleIfNeeded() {
        if (!otherIsTypingNow) return;
        const bubble = document.createElement('div');
        bubble.className = 'msg-row from-them typing-row';
        bubble.innerHTML = `
            <div class="msg-row-inner">
                <div class="bubble bubble-left bubble-typing">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
            </div>`;
        messagesEl.appendChild(bubble);
    }

    function setOtherTyping(isTyping) {
        if (otherIsTypingNow === isTyping) return;
        otherIsTypingNow = isTyping;
        const existing = messagesEl.querySelector('.typing-row');
        if (isTyping) {
            if (!existing) renderTypingBubbleIfNeeded();
            scrollToBottom(true);
        } else if (existing) {
            existing.remove();
        }
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
        renderTypingBubbleIfNeeded();
    }

    // =====================================================
    // ريبلاي بالسحب لمنتصف الشاشة (زي واتساب) + ضغطة مطولة
    // لحذف الرسالة
    // =====================================================
    const SWIPE_REPLY_THRESHOLD = 46; // بكسل يسحبها المستخدم قبل ما نعتبرها "قرر يرد"
    const LONG_PRESS_MSG_MS = 420;

    function attachMessageInteractions(row, docId, msg, isMine) {
        const inner = row.querySelector('.msg-row-inner');

        // ===== سحب لمنتصف الشاشة = ريبلاي =====
        let touchStartX = 0, touchStartY = 0, dragging = false, currentDx = 0;

        row.addEventListener('touchstart', (e) => {
            const t0 = e.touches[0];
            touchStartX = t0.clientX;
            touchStartY = t0.clientY;
            dragging = false;
            currentDx = 0;
        }, { passive: true });

        row.addEventListener('touchmove', (e) => {
            const t0 = e.touches[0];
            const dx = t0.clientX - touchStartX;
            const dy = t0.clientY - touchStartY;
            // بنتأكد إن السحب أفقي أكتر منه رأسي عشان منمنعش سكرول الشات العادي
            if (!dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
                dragging = true;
            }
            if (dragging) {
                // بغض النظر عن اتجاه الرسالة (يمين/شمال)، بنسمح بالسحب
                // في الاتجاهين ونحدد أقصى مسافة بسيطة
                const clamped = Math.max(-70, Math.min(70, dx));
                currentDx = clamped;
                inner.style.transform = `translateX(${clamped}px)`;
                row.classList.toggle('swiping', Math.abs(clamped) > 14);
                if (Math.abs(clamped) > 10) e.preventDefault();
            }
        }, { passive: false });

        row.addEventListener('touchend', () => {
            if (dragging && Math.abs(currentDx) >= SWIPE_REPLY_THRESHOLD) {
                if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) {} }
                startReply(docId, msg, isMine);
            }
            inner.style.transform = '';
            row.classList.remove('swiping');
            dragging = false;
            currentDx = 0;
        });

        row.addEventListener('touchcancel', () => {
            inner.style.transform = '';
            row.classList.remove('swiping');
            dragging = false;
            currentDx = 0;
        });

        // ===== ضغطة مطولة = تحديد الرسالة وفتح قايمة (رد / حذف) =====
        let pressTimer = null;
        function cancelPress() {
            if (pressTimer) clearTimeout(pressTimer);
            pressTimer = null;
        }
        row.addEventListener('touchstart', () => {
            pressTimer = setTimeout(() => {
                if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
                openMsgCtxMenu(row, docId, msg, isMine);
            }, LONG_PRESS_MSG_MS);
        }, { passive: true });
        row.addEventListener('touchmove', cancelPress, { passive: true });
        row.addEventListener('touchend', cancelPress);
        row.addEventListener('touchcancel', cancelPress);

        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openMsgCtxMenu(row, docId, msg, isMine);
        });

        // دعم الماوس (ديسكتوب/تجربة): ضغطة مطولة بالماوس تعمل نفس الحاجة
        let mouseTimer = null;
        row.addEventListener('mousedown', () => {
            mouseTimer = setTimeout(() => openMsgCtxMenu(row, docId, msg, isMine), LONG_PRESS_MSG_MS);
        });
        row.addEventListener('mouseup', () => { if (mouseTimer) clearTimeout(mouseTimer); });
        row.addEventListener('mouseleave', () => { if (mouseTimer) clearTimeout(mouseTimer); });
    }

    // ===== قايمة رد/حذف الخاصة بالرسالة =====
    const msgCtxOverlay = document.getElementById('msgCtxOverlay');
    const msgCtxMenu = document.getElementById('msgCtxMenu');
    const msgCtxReply = document.getElementById('msgCtxReply');
    const msgCtxDelete = document.getElementById('msgCtxDelete');
    let ctxMsgId = null, ctxMsgData = null, ctxMsgIsMine = false;

    function openMsgCtxMenu(row, docId, msg, isMine) {
        ctxMsgId = docId;
        ctxMsgData = msg;
        ctxMsgIsMine = isMine;
        document.querySelectorAll('.msg-row.selected').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');

        if (!msgCtxMenu || !msgCtxOverlay) return;
        const rect = row.getBoundingClientRect();
        const isRtl = document.documentElement.dir === 'rtl';
        let top = rect.bottom + 6;
        const menuHeightEstimate = 110;
        if (top + menuHeightEstimate > window.innerHeight) {
            top = Math.max(10, rect.top - menuHeightEstimate - 6);
        }
        msgCtxMenu.style.top = top + 'px';
        const centerX = rect.left + rect.width / 2;
        if (isRtl) {
            msgCtxMenu.style.right = Math.max(10, window.innerWidth - centerX - 100) + 'px';
            msgCtxMenu.style.left = 'auto';
        } else {
            msgCtxMenu.style.left = Math.max(10, centerX - 100) + 'px';
            msgCtxMenu.style.right = 'auto';
        }
        msgCtxMenu.classList.add('open');
        msgCtxOverlay.classList.add('open');
    }

    function closeMsgCtxMenu() {
        if (msgCtxMenu) msgCtxMenu.classList.remove('open');
        if (msgCtxOverlay) msgCtxOverlay.classList.remove('open');
        document.querySelectorAll('.msg-row.selected').forEach(r => r.classList.remove('selected'));
    }

    if (msgCtxOverlay) msgCtxOverlay.addEventListener('click', closeMsgCtxMenu);

    if (msgCtxReply) {
        msgCtxReply.addEventListener('click', () => {
            const id = ctxMsgId, msg = ctxMsgData, mine = ctxMsgIsMine;
            closeMsgCtxMenu();
            if (id && msg) startReply(id, msg, mine);
        });
    }

    if (msgCtxDelete) {
        msgCtxDelete.addEventListener('click', () => {
            closeMsgCtxMenu();
            openDeleteMsgSheet(ctxMsgId, ctxMsgData, ctxMsgIsMine);
        });
    }

    // =====================================================
    // بار الريبلاي فوق مكان الكتابة
    // =====================================================
    const convReplyBar = document.getElementById('convReplyBar');
    const convReplyBarName = document.getElementById('convReplyBarName');
    const convReplyBarPreview = document.getElementById('convReplyBarPreview');
    const convReplyBarClose = document.getElementById('convReplyBarClose');
    let activeReply = null; // { id, text, senderName, isMine }

    function startReply(docId, msg, isMine) {
        if (msg.deleted) return;
        activeReply = {
            id: docId,
            text: msg.text || '',
            senderName: isMine ? T.reply_you : currentDisplayName(),
            isMine
        };
        if (convReplyBarName) convReplyBarName.textContent = activeReply.senderName;
        if (convReplyBarPreview) convReplyBarPreview.textContent = messagePreviewText(msg);
        if (convReplyBar) convReplyBar.classList.add('open');
        textarea.focus();
    }

    function cancelReply() {
        activeReply = null;
        if (convReplyBar) convReplyBar.classList.remove('open');
    }

    if (convReplyBarClose) convReplyBarClose.addEventListener('click', cancelReply);

    // =====================================================
    // حذف رسالة: من عندي بس، أو من عند الطرفين (لو هي رسالتي أنا)
    // =====================================================
    const deleteMsgSheetBody = document.getElementById('deleteMsgSheetBody');
    const deleteMsgForEveryoneBtn = document.getElementById('deleteMsgForEveryoneBtn');
    const deleteMsgForMeBtn = document.getElementById('deleteMsgForMeBtn');
    let deleteTargetId = null, deleteTargetIsMine = false;

    function openDeleteMsgSheet(docId, msg, isMine) {
        deleteTargetId = docId;
        deleteTargetIsMine = isMine;
        if (deleteMsgSheetBody) {
            deleteMsgSheetBody.textContent = isMine ? T.delete_msg_body_mine : T.delete_msg_body_theirs;
        }
        // خيار "حذف من عند الطرفين" متاح بس لو الرسالة رسالتي أنا
        if (deleteMsgForEveryoneBtn) {
            deleteMsgForEveryoneBtn.style.display = isMine ? '' : 'none';
        }
        openSheet('sheet-delete-msg');
    }

    async function deleteMessageForMe() {
        const id = deleteTargetId;
        closeSheet('sheet-delete-msg');
        closeMsgCtxMenu();
        if (!id || !myUid) return;
        try {
            await updateDoc(doc(db, 'chats', chatId, 'messages', id), {
                deletedFor: arrayUnion(myUid)
            });
            showToast(T.msg_deleted_toast);
        } catch (e) {
            console.error('فشل حذف الرسالة من عندي:', e);
        }
    }

    async function deleteMessageForEveryone() {
        const id = deleteTargetId;
        closeSheet('sheet-delete-msg');
        closeMsgCtxMenu();
        if (!id) return;
        try {
            await updateDoc(doc(db, 'chats', chatId, 'messages', id), {
                deleted: true,
                text: ''
            });
            showToast(T.msg_deleted_toast);
        } catch (e) {
            console.error('فشل حذف الرسالة من عند الطرفين:', e);
        }
    }

    if (deleteMsgForMeBtn) deleteMsgForMeBtn.addEventListener('click', deleteMessageForMe);
    if (deleteMsgForEveryoneBtn) deleteMsgForEveryoneBtn.addEventListener('click', deleteMessageForEveryone);

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

    // =====================================================
    // 5.1) بث حالة "بيكتب الآن" — بنكتب uid بتاعي جوه مستند الشات
    //      نفسه تحت typing.{myUid} = true وقت الكتابة الفعلية، وبنمسحه
    //      (typing.{myUid} = false) بعد فترة سكون أو عند الإرسال/مغادرة
    //      الصفحة. الطرف التاني بيسمع نفس المستند ويعرض "يكتب الآن..."
    //      تحت اسمه في شاشة المحادثة، ونقطة/أيقونة جنب اسمه في قايمة
    //      الدردشات الرئيسية.
    // =====================================================
    const TYPING_IDLE_MS = 2500;
    let typingIdleTimer = null;
    let iAmMarkedTyping = false;

    function setTypingState(isTyping) {
        if (!myUid) return;
        if (isTyping === iAmMarkedTyping) return;
        iAmMarkedTyping = isTyping;
        updateDoc(doc(db, 'chats', chatId), {
            ['typing.' + myUid]: isTyping
        }).catch(() => {
            // لو فشل التحديث (مشكلة شبكة مؤقتة مثلاً)، منسيبش الحالة
            // عالقة على "بيكتب" للأبد — نرجّعها false تاني عشان تتحاول
            // تتحدث صح في المرة الجاية.
            if (isTyping) iAmMarkedTyping = false;
        });
    }

    function pingTyping() {
        setTypingState(true);
        if (typingIdleTimer) clearTimeout(typingIdleTimer);
        typingIdleTimer = setTimeout(() => setTypingState(false), TYPING_IDLE_MS);
    }

    textarea.addEventListener('input', () => {
        autoResize();
        updateSendVisibility();
        if (textarea.value.trim().length > 0) {
            pingTyping();
        } else {
            if (typingIdleTimer) clearTimeout(typingIdleTimer);
            setTypingState(false);
        }
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

        // نجيب الاسم المخصص اللي أنا (بس أنا) حطيته لجهة الاتصال دي،
        // ونجيب حالة التثبيت/الحذف بتاعتي للشات ده (لو موجودة)
        loadMyContactName();

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

        // الاستماع اللحظي لحالة "بيكتب الآن" بتاعة الطرف التاني بس
        // (مش بتاعتي أنا) — بنعرضها في مكان "الحالة" تحت الاسم في
        // البار العلوي (convStatus)، وبتتشال تلقائيًا أول ما هو يوقف
        // عن الكتابة أو يمسح النص.
        onSnapshot(chatDocRef, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            const typingMap = data.typing || {};
            const otherIsTyping = Object.keys(typingMap).some(uid => uid !== myUid && typingMap[uid]);
            convStatusEl.textContent = otherIsTyping ? T.typing_status : '';
            convStatusEl.classList.toggle('conv-status-typing', otherIsTyping);
            setOtherTyping(otherIsTyping);
        }, (err) => {
            console.error('فشل الاستماع لحالة الكتابة:', err);
        });

        // الاستماع اللحظي للرسايل
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'));

        unsubscribeMessages = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs;

            // الرسايل اللي حذفتها "من عندي بس" (deletedFor بتحتوي على
            // uid بتاعي) بتتشال من العرض خالص عندي أنا، مع إنها لسه
            // موجودة وظاهرة بشكل طبيعي عند الطرف التاني.
            const visibleDocs = docs.filter(d => {
                const data = d.data();
                const deletedFor = data.deletedFor || [];
                return !deletedFor.includes(myUid);
            });

            messagesById = new Map(visibleDocs.map(d => [d.id, d.data()]));

            if (!visibleDocs.length) {
                renderEmptyState();
                return;
            }
            messagesEl.innerHTML = '';
            visibleDocs.forEach(d => {
                const data = d.data();
                // لو الرسالة دي رد على رسالة تانية، بنجهّز اسم صاحب
                // الرسالة الأصلية عشان يتعرض جوه المقتطف
                if (data.replyTo && data.replyTo.id) {
                    const original = messagesById.get(data.replyTo.id);
                    if (original) {
                        const originalIsMine = (original.senderEmail || '').toLowerCase() === myEmail.toLowerCase();
                        data.replyTo.senderName = originalIsMine ? T.reply_you : currentDisplayName();
                        data.replyTo.deleted = !!original.deleted;
                    }
                }
                appendMessage(d.id, data, myEmail.toLowerCase());
            });
            renderTypingBubbleIfNeeded();
            scrollToBottom(false);

            // أي رسالة وصلتلي من الطرف التاني ولسه حالتها unread،
            // معناه إني دلوقتي فاتح الشات وشايفها فعليًا، فنعلّمها read
            // عشان الطرف اللي بعتها يشوف الصح الزرقة عنده.
            markIncomingMessagesAsRead(visibleDocs);
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
        if (typingIdleTimer) clearTimeout(typingIdleTimer);
        setTypingState(false);

        const payload = {
            senderUid: myUid,
            senderEmail: myEmail,
            text,
            createdAt: serverTimestamp(),
            // كل رسالة بتتبعت بحالة "unread" (صح رمادية)، وتتحول "read"
            // (صح زرقاء) لما الطرف التاني يفتح الشات فعليًا ويشوفها —
            // مفيش تفرقة أونلاين/أوفلاين خالص دلوقتي.
            status: 'unread'
        };

        // لو كنت رادّ على رسالة معيّنة، بنرفق مقتطف صغير منها مع
        // الرسالة الجديدة عشان يتعرض فوقها في الفقاعة
        if (activeReply) {
            payload.replyTo = {
                id: activeReply.id,
                text: activeReply.text.length > 120 ? activeReply.text.slice(0, 120) : activeReply.text
            };
        }

        const messagesRef = collection(db, 'chats', chatId, 'messages');
        addDoc(messagesRef, payload).then(() => {
            if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
        }).catch((err) => {
            console.error('فشل إرسال الرسالة:', err);
        });

        cancelReply();
    }

    sendBtn.addEventListener('click', sendMessage);

    initChat().catch((err) => {
        console.error('فشل تهيئة المحادثة. الكود:', err && err.code, '— الرسالة:', err && err.message, err);
    });

    window.addEventListener('unload', () => {
        if (unsubscribeMessages) unsubscribeMessages();
        setTypingState(false);
    });
})();
