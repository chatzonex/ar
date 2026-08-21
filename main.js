(function () {
    const navButtons = document.querySelectorAll('.nav-btn');
    const screens = document.querySelectorAll('.screen');

    function switchTab(targetId) {
        screens.forEach(screen => {
            screen.classList.toggle('hidden', screen.id !== targetId);
        });
        navButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === targetId);
        });
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.target));
    });

    // ===== تحميل بيانات البروفايل =====
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileAvatar = document.getElementById('profileAvatar');

    const savedName = localStorage.getItem('cz_user_name');
    const savedEmail = localStorage.getItem('cz_verified_email');

    if (savedName) {
        profileName.textContent = savedName;
        profileAvatar.textContent = savedName.trim().charAt(0).toUpperCase();
    }

    if (savedEmail) {
        profileEmail.textContent = savedEmail;
    }

    // ===== زرار التلت نقط (لسه هنضيف وظيفته) =====
    const menuBtn = document.getElementById('menuBtn');
    menuBtn.addEventListener('click', () => {
        console.log('فتح قائمة الخيارات — لسه مش متبني');
    });

    // ===== مودال محادثة جديدة =====
    const addChatBtn = document.getElementById('addChatBtn');
    const newChatOverlay = document.getElementById('newChatOverlay');
    const newChatEmail = document.getElementById('newChatEmail');
    const newChatError = document.getElementById('newChatError');
    const cancelNewChat = document.getElementById('cancelNewChat');
    const startNewChat = document.getElementById('startNewChat');

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

    function handleStartChat() {
        const email = newChatEmail.value.trim();

        if (!email) {
            showNewChatError('من فضلك اكتب الإيميل');
            return;
        }
        if (!isValidEmail(email)) {
            showNewChatError('الإيميل ده مش صحيح');
            return;
        }
        if (savedEmail && email.toLowerCase() === savedEmail.toLowerCase()) {
            showNewChatError('متقدرش تبدأ محادثة مع نفسك');
            return;
        }

        clearNewChatError();
        // بنحفظ الإيميل اللي هيتفتح معاه المحادثة عشان صفحة conversation تقرأه
        localStorage.setItem('cz_active_chat_email', email);
        window.location.href = 'conversation.html';
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
})();
