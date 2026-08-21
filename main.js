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

    // ===== أزرار لسه هنضيف وظيفتها =====
    const menuBtn = document.getElementById('menuBtn');
    const addChatBtn = document.getElementById('addChatBtn');

    menuBtn.addEventListener('click', () => {
        console.log('فتح قائمة الخيارات — لسه مش متبني');
    });

    addChatBtn.addEventListener('click', () => {
        console.log('بدء محادثة جديدة — لسه مش متبني');
    });
})();
