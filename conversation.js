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

    // الـ Liquid Glass بتاع البار السفلي: نفس مفتاح "cz_lg_bottombar" اللي
    // بيتفعّل من الإعدادات → الصفحة الرئيسية. لو مفعّل، بار الكتابة يبقى عايم.
    if (localStorage.getItem('cz_lg_bottombar') === 'on') {
        document.body.classList.add('lg-bottombar-on');
    }

    const I18N = {
        ar: {
            type_message: 'اكتب رسالة...',
            back: 'رجوع',
            online: 'أونلاين',
            offline: 'غير متصل',
            unknown_contact: 'مستخدم'
        },
        en: {
            type_message: 'Type a message...',
            back: 'Back',
            online: 'Online',
            offline: 'Offline',
            unknown_contact: 'User'
        }
    };
    const T = I18N[isAr ? 'ar' : 'en'];

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (T[key]) el.setAttribute('placeholder', T[key]);
    });

    // =====================================================
    // 2) هوية الشخص اللي بنكلمه (من localStorage مؤقتاً لحد
    //    ما يتوصل بباك إند حقيقي)
    // =====================================================
    const activeChatEmail = localStorage.getItem('cz_active_chat_email') || '';
    const convNameEl = document.getElementById('convName');
    const convStatusEl = document.getElementById('convStatus');

    function displayNameFromEmail(email) {
        if (!email) return T.unknown_contact;
        const namePart = email.split('@')[0];
        return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }

    convNameEl.textContent = displayNameFromEmail(activeChatEmail);

    // حالة الاتصال بتاعة الطرف التاني (تجريبية/تجميلية دلوقتي، هتتوصل
    // بحالة حقيقية بعدين). محدش بيعرض حالته لو هو مفعّل "إخفاء الأونلاين".
    const otherIsOnline = true; // placeholder — يستبدل بحالة حقيقية من السيرفر
    if (otherIsOnline) {
        convStatusEl.textContent = T.online;
        convStatusEl.classList.add('is-online');
    } else {
        convStatusEl.textContent = T.offline;
        convStatusEl.classList.remove('is-online');
    }

    // =====================================================
    // 3) زرار الرجوع — أقصى يسار البار العلوي
    // =====================================================
    const backBtn = document.getElementById('convBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'MainActivity.html';
        });
    }

    // =====================================================
    // 4) عرض الرسائل: فقاعة يمين (رسايلي) وفقاعة شمال (الطرف
    //    التاني)، وعلامة الصح جوه الفقاعة نفسها لرسايلي بس
    // =====================================================
    const messagesEl = document.getElementById('convMessages');

    // حالة القراءة الممكنة لأي رسالة باعتها أنا:
    //   'unsent'   -> لسه بترسل / الطرف التاني مش فاتح نت وقت الإرسال (ساعة)
    //   'offline'  -> اتبعتت لكن الطرف التاني غير متصل (صح رمادية مفردة الشكل)
    //   'unread'   -> وصلت لكنه لسه ماشافهاش (صح بيضا مزدوجة)
    //   'read'     -> شافها (صح زرقا مزدوجة)
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

    /**
     * بيضيف رسالة على الشاشة.
     * @param {Object} msg
     * @param {'me'|'them'} msg.sender
     * @param {string} msg.text
     * @param {Date} [msg.time]
     * @param {'unsent'|'offline'|'unread'|'read'} [msg.status] - مطلوبة بس لو sender === 'me'
     */
    function appendMessage(msg) {
        const row = document.createElement('div');
        row.className = 'msg-row ' + (msg.sender === 'me' ? 'from-me' : 'from-them');

        const bubble = document.createElement('div');
        bubble.className = 'bubble ' + (msg.sender === 'me' ? 'bubble-right' : 'bubble-left');

        const textEl = document.createElement('p');
        textEl.className = 'bubble-text';
        textEl.textContent = msg.text;
        bubble.appendChild(textEl);

        const meta = document.createElement('div');
        meta.className = 'bubble-meta';

        const timeEl = document.createElement('span');
        timeEl.className = 'bubble-time';
        timeEl.textContent = formatTime(msg.time || new Date());
        meta.appendChild(timeEl);

        // علامة الصح جوه الفقاعة نفسها — بتظهر بس في رسايلي أنا
        if (msg.sender === 'me') {
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

    // =====================================================
    // 5) تحميل الرسائل المحفوظة (لكل محادثة على حدة، بحسب
    //    الإيميل) — تخزين محلي مؤقت لحد ما يتوصل بباك إند
    // =====================================================
    function conversationStorageKey(email) {
        return 'cz_conv_' + (email || 'unknown');
    }

    function loadConversation(email) {
        try {
            const raw = localStorage.getItem(conversationStorageKey(email));
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveConversation(email, msgs) {
        try {
            localStorage.setItem(conversationStorageKey(email), JSON.stringify(msgs));
        } catch (e) {}
    }

    let conversation = loadConversation(activeChatEmail);

    function renderAll() {
        messagesEl.innerHTML = '';
        if (!conversation.length) {
            const empty = document.createElement('div');
            empty.className = 'conv-empty';
            empty.textContent = isAr ? 'مفيش رسائل لسه، ابدأ المحادثة 👋' : 'No messages yet, say hi 👋';
            messagesEl.appendChild(empty);
            return;
        }
        conversation.forEach(m => appendMessage({ ...m, time: new Date(m.time) }));
        scrollToBottom(false);
    }

    renderAll();

    // =====================================================
    // 6) بار الكتابة: زرار الإرسال يظهر بس لما فيه نص
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

    function sendMessage() {
        const text = textarea.value.trim();
        if (!text) return;

        // أونلاين المستخدم الحالي (لو مقفول نت هيتبعت status: 'unsent')
        const iAmOnline = navigator.onLine;

        const newMsg = {
            sender: 'me',
            text,
            time: new Date().toISOString(),
            status: iAmOnline ? 'unread' : 'unsent'
        };

        conversation.push(newMsg);
        saveConversation(activeChatEmail, conversation);
        renderAll();

        textarea.value = '';
        autoResize();
        updateSendVisibility();

        if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
    }

    sendBtn.addEventListener('click', sendMessage);

    // لو النت رجع بعد ما كانت الرسالة unsent، نحدّثها لـ unread تلقائياً
    window.addEventListener('online', () => {
        let changed = false;
        conversation.forEach(m => {
            if (m.sender === 'me' && m.status === 'unsent') {
                m.status = 'unread';
                changed = true;
            }
        });
        if (changed) {
            saveConversation(activeChatEmail, conversation);
            renderAll();
        }
    });

    updateSendVisibility();
})();
