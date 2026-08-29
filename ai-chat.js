// =====================================================
// ChatZone Ai — منطق صفحة شات الذكاء الاصطناعي
// بيتكلم مع Cloudflare Worker (اللي بيخبي مفتاح Groq API)
// بدل ما يتكلم مع Firestore زي شات الأشخاص العادي
// =====================================================

// ⚠️ غيّر الرابط ده لو غيّرت اسم الـ Worker بتاعك على Cloudflare
const AI_WORKER_URL = "https://chatzone-ai.m7ashr213.workers.dev/";

// اسم الموديل المستخدم (لازم يتطابق مع اللي مكتوب في كود الـ Worker)
const AI_MODEL = "openai/gpt-oss-120b";

// شخصية المساعد — أول تعليمة بتتبعت مع كل محادثة (مش بتتعرض للمستخدم)
const SYSTEM_PROMPT =
    "إنت ChatZone Ai، مساعد ذكاء اصطناعي جوه تطبيق دردشة اسمه ChatZone. " +
    "ردودك تكون بالعربي المصري البسيط، ودودة ومختصرة ومفيدة، ومنظمة لما يكون المحتوى يحتاج نقط أو خطوات.";

(function () {
    // ===== احترام الثيم واللغة والـ Liquid Glass المحفوظين، زي باقي الشاشات =====
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

    if (localStorage.getItem('cz_lg_chat') === 'on') {
        document.body.classList.add('lg-chat-on');
    }

    // ===== عناصر الصفحة =====
    const convMessages = document.getElementById('convMessages');
    const aiWelcome = document.getElementById('aiWelcome');
    const aiTextarea = document.getElementById('aiTextarea');
    const aiSendBtn = document.getElementById('aiSendBtn');
    const convInputBar = document.getElementById('convInputBar');
    const convBackBtn = document.getElementById('convBackBtn');
    const convMenuBtn = document.getElementById('convMenuBtn');
    const convSidebarMenu = document.getElementById('convSidebarMenu');
    const convSidebarOverlay = document.getElementById('convSidebarOverlay');
    const aiClearChatBtn = document.getElementById('aiClearChatBtn');
    const aiStatusText = document.getElementById('aiStatusText');
    const aiChatShell = document.querySelector('.ai-chat-shell');

    // ===== تخزين محلي لتاريخ المحادثة (بيتفتح تاني لو رجعت للصفحة) =====
    const STORAGE_KEY = 'cz_ai_chat_history';

    function loadHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveHistory(history) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        } catch (e) { /* تجاهل لو الملف كبير أوي */ }
    }

    let history = loadHistory(); // [{role: 'user'|'assistant', content: '...'}]

    // ===== رجوع =====
    if (convBackBtn) {
        convBackBtn.addEventListener('click', () => {
            window.location.href = 'MainActivity.html';
        });
    }

    // ===== قائمة التلت نقط =====
    if (convMenuBtn && convSidebarMenu && convSidebarOverlay) {
        convMenuBtn.addEventListener('click', () => {
            convSidebarMenu.classList.add('show');
            convSidebarOverlay.classList.add('show');
        });
        convSidebarOverlay.addEventListener('click', () => {
            convSidebarMenu.classList.remove('show');
            convSidebarOverlay.classList.remove('show');
        });
    }

    if (aiClearChatBtn) {
        aiClearChatBtn.addEventListener('click', () => {
            history = [];
            saveHistory(history);
            convMessages.querySelectorAll('.msg-row').forEach(el => el.remove());
            showWelcome();
            convSidebarMenu.classList.remove('show');
            convSidebarOverlay.classList.remove('show');
        });
    }

    // ===== إظهار/إخفاء شاشة الترحيب باللوجو =====
    function showWelcome() {
        aiWelcome.classList.remove('ai-welcome-hidden');
    }

    function hideWelcome() {
        aiWelcome.classList.add('ai-welcome-hidden');
    }

    // ===== رسم فقاعة رسالة (مستخدم أو AI) =====
    function formatTime(date) {
        let h = date.getHours();
        const m = date.getMinutes().toString().padStart(2, '0');
        const ampm = h < 12 ? 'ص' : 'م';
        h = h % 12 || 12;
        return `${h}:${m} ${ampm}`;
    }

    function appendMessage(role, text) {
        const row = document.createElement('div');
        row.className = `msg-row ${role === 'user' ? 'from-me' : 'from-them'}`;

        const bubble = document.createElement('div');
        bubble.className = `bubble ${role === 'user' ? 'bubble-right' : 'bubble-left bubble-ai'}`;

        const textEl = document.createElement('div');
        textEl.className = 'bubble-text';
        textEl.textContent = text;

        const metaEl = document.createElement('div');
        metaEl.className = 'bubble-meta';
        const timeEl = document.createElement('span');
        timeEl.className = 'bubble-time';
        timeEl.textContent = formatTime(new Date());
        metaEl.appendChild(timeEl);

        bubble.appendChild(textEl);
        bubble.appendChild(metaEl);
        row.appendChild(bubble);
        convMessages.appendChild(row);

        convMessages.scrollTop = convMessages.scrollHeight;
        return row;
    }

    // ===== مؤشر "بيكتب..." وقت انتظار رد الـ AI =====
    function showTypingIndicator() {
        const row = document.createElement('div');
        row.className = 'msg-row from-them';
        row.id = 'aiTypingRow';

        const bubble = document.createElement('div');
        bubble.className = 'bubble bubble-left bubble-ai';
        bubble.innerHTML = `<div class="ai-typing-bubble"><span></span><span></span><span></span></div>`;

        row.appendChild(bubble);
        convMessages.appendChild(row);
        convMessages.scrollTop = convMessages.scrollHeight;
    }

    function removeTypingIndicator() {
        const row = document.getElementById('aiTypingRow');
        if (row) row.remove();
    }

    function showErrorBubble(message) {
        const el = document.createElement('div');
        el.className = 'ai-error-badge';
        el.textContent = message;
        convMessages.appendChild(el);
        convMessages.scrollTop = convMessages.scrollHeight;
    }

    // ===== إعادة رسم كل الرسايل المحفوظة عند فتح الصفحة =====
    function renderHistoryOnLoad() {
        if (history.length === 0) {
            showWelcome();
            return;
        }
        hideWelcome();
        history.forEach(msg => appendMessage(msg.role === 'user' ? 'user' : 'ai', msg.content));
    }

    // ===== إرسال الرسالة للـ Worker =====
    async function sendToAI(userText) {
        history.push({ role: 'user', content: userText });
        saveHistory(history);

        showTypingIndicator();
        if (aiStatusText) aiStatusText.textContent = 'بيكتب الآن...';

        try {
            const payload = {
                model: AI_MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...history
                ]
            };

            const res = await fetch(AI_WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            removeTypingIndicator();

            if (!res.ok || data.error) {
                showErrorBubble('حصلت مشكلة في الاتصال بالذكاء الاصطناعي، حاول تاني.');
                if (aiStatusText) aiStatusText.textContent = 'متصل الآن';
                return;
            }

            const reply = data.reply || 'معرفتش أرد دلوقتي، حاول تسأل بطريقة تانية.';
            appendMessage('ai', reply);
            history.push({ role: 'assistant', content: reply });
            saveHistory(history);
        } catch (err) {
            removeTypingIndicator();
            showErrorBubble('في مشكلة في الاتصال بالإنترنت، جرب تاني.');
        } finally {
            if (aiStatusText) aiStatusText.textContent = 'متصل الآن';
        }
    }

    // ===== التعامل مع إرسال رسالة من المستخدم =====
    function handleSend() {
        const text = aiTextarea.value.trim();
        if (!text) return;

        hideWelcome();
        appendMessage('user', text);
        aiTextarea.value = '';
        aiTextarea.style.height = 'auto';
        convInputBar.classList.remove('has-text');

        sendToAI(text);
    }

    if (aiSendBtn) aiSendBtn.addEventListener('click', handleSend);

    if (aiTextarea) {
        aiTextarea.addEventListener('input', () => {
            aiTextarea.style.height = 'auto';
            aiTextarea.style.height = Math.min(aiTextarea.scrollHeight, 120) + 'px';
            convInputBar.classList.toggle('has-text', aiTextarea.value.trim().length > 0);

            if (aiChatShell) {
                aiChatShell.classList.toggle('ai-typing-active', aiTextarea.value.trim().length > 0);
            }
        });

        aiTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });
    }

    // ===== تشغيل أولي =====
    renderHistoryOnLoad();
})();
