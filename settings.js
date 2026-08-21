(function () {
    // ===== التنقل بين شاشة "أنت" وشاشة "الإعدادات" =====
    const screens = document.querySelectorAll('.screen');
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const settingsBackBtn = document.getElementById('settingsBackBtn');

    function goToScreen(targetId) {
        screens.forEach(screen => {
            screen.classList.toggle('hidden', screen.id !== targetId);
        });
    }

    if (openSettingsBtn) {
        openSettingsBtn.addEventListener('click', () => goToScreen('screen-settings'));
    }
    if (settingsBackBtn) {
        settingsBackBtn.addEventListener('click', () => goToScreen('screen-profile'));
    }

    // ===== فتح/قفل الـ Sheets =====
    function openSheet(id) {
        const overlay = document.getElementById(id);
        if (overlay) overlay.classList.add('open');
    }
    function closeSheet(id) {
        const overlay = document.getElementById(id);
        if (overlay) overlay.classList.remove('open');
    }

    const sheetTriggers = {
        openLiquidGlass: 'sheet-liquidglass',
        openThemes: 'sheet-themes',
        openLanguage: 'sheet-language',
        openVersion: 'sheet-version',
        openAbout: 'sheet-about'
    };

    Object.keys(sheetTriggers).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.addEventListener('click', () => openSheet(sheetTriggers[btnId]));
    });

    document.querySelectorAll('[data-close-sheet]').forEach(el => {
        el.addEventListener('click', () => closeSheet(el.dataset.closeSheet));
    });

    document.querySelectorAll('.sheet-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSheet(overlay.id);
        });
    });

    // ===== Liquid Glass Toggles =====
    const LG_OPTIONS = ['bottombar', 'icons'];
    const lgState = {};
    LG_OPTIONS.forEach(opt => {
        lgState[opt] = localStorage.getItem('cz_lg_' + opt) === 'on';
    });

    function applyLgState() {
        document.body.classList.toggle('lg-bottombar-on', !!lgState.bottombar);
        document.body.classList.toggle('lg-icons-on', !!lgState.icons);
    }

    LG_OPTIONS.forEach(opt => {
        const input = document.getElementById('lgSwitch-' + opt);
        if (!input) return;
        input.checked = !!lgState[opt];
        input.addEventListener('change', () => {
            lgState[opt] = input.checked;
            localStorage.setItem('cz_lg_' + opt, input.checked ? 'on' : 'off');
            applyLgState();
            if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
        });
    });

    applyLgState();

    // ===== Themes =====
    function hexToRgb(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const num = parseInt(hex, 16);
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }
    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    }
    function shadeColor(hex, percent) {
        const { r, g, b } = hexToRgb(hex);
        const amt = Math.round(2.55 * percent);
        return rgbToHex(r + amt, g + amt, b + amt);
    }

    let currentTheme = localStorage.getItem('cz_theme') || 'dark';
    let customColor = localStorage.getItem('cz_theme_color') || '#25D9A0';

    function updateColorSwatch(hex) {
        const swatch = document.getElementById('themeColorSwatch');
        const hexLabel = document.getElementById('themeColorHex');
        const picker = document.getElementById('themeColorPicker');
        if (swatch) {
            swatch.classList.add('has-color');
            swatch.style.setProperty('--picked-color', hex);
        }
        if (hexLabel) hexLabel.textContent = hex.toUpperCase();
        if (picker) picker.value = hex;
    }

    function applyTheme(theme) {
        currentTheme = theme;
        localStorage.setItem('cz_theme', theme);
        document.body.classList.remove('theme-white', 'theme-custom');
        if (theme === 'white') document.body.classList.add('theme-white');
        if (theme === 'custom') document.body.classList.add('theme-custom');

        document.getElementById('theme-opt-dark').classList.toggle('selected', theme === 'dark');
        document.getElementById('theme-opt-white').classList.toggle('selected', theme === 'white');
        document.getElementById('themeColorRow').classList.toggle('selected', theme === 'custom');
    }

    function applyCustomColor(hex) {
        customColor = hex;
        localStorage.setItem('cz_theme_color', hex);
        const dark = shadeColor(hex, -25);
        const { r, g, b } = hexToRgb(hex);
        document.documentElement.style.setProperty('--accent', hex);
        document.documentElement.style.setProperty('--accent-dim', `rgba(${r},${g},${b},0.35)`);
        updateColorSwatch(hex);
        applyTheme('custom');
        if (navigator.vibrate) { try { navigator.vibrate([6, 30, 6]); } catch (e) {} }
    }

    document.getElementById('theme-opt-dark').addEventListener('click', () => applyTheme('dark'));
    document.getElementById('theme-opt-white').addEventListener('click', () => applyTheme('white'));

    const colorPicker = document.getElementById('themeColorPicker');
    document.getElementById('themeColorRow').addEventListener('click', () => colorPicker.click());
    colorPicker.addEventListener('input', (e) => applyCustomColor(e.target.value));

    // تطبيق الثيم المحفوظ عند التحميل
    updateColorSwatch(customColor);
    if (currentTheme === 'custom') {
        document.documentElement.style.setProperty('--accent', customColor);
        const { r, g, b } = hexToRgb(customColor);
        document.documentElement.style.setProperty('--accent-dim', `rgba(${r},${g},${b},0.35)`);
    }
    applyTheme(currentTheme);

    // ===== Language (عربي / إنجليزي) =====
    const AR_TEXT = {
        settings: 'الإعدادات',
        lg_title: 'الزجاج السائل',
        lg_sub: 'فعّل تأثير Liquid Glass في الأبب',
        lg_body: 'فعّل أو ألغِ كل تأثير Liquid Glass على حدة. كل شيء متوقف افتراضياً.',
        lg_warning: 'مُوصى به فقط للأجهزة القوية. قد يحدث بطء بسيط على الأجهزة الأضعف.',
        lg_bottombar_title: 'تفعيل الزجاج السائل',
        lg_bottombar_sub: 'شريط تنقل زجاجي شفاف',
        lg_icons_title: 'الزجاج السائل من الأيقونات',
        lg_icons_sub: 'طبّق خامة الزجاج على الأزرار الدائرية',
        themes_title: 'ثيمات التطبيق',
        themes_sub: 'خصّص مظهر ألوان التطبيق',
        themes_body: 'اختر ثيم ألوان للتطبيق، وسيتم حفظ اختيارك تلقائياً.',
        theme_dark: 'داكن',
        theme_white: 'أبيض',
        theme_pick: 'اختر لون الثيم',
        lang_title: 'لغة التطبيق',
        lang_sub: 'التبديل بين العربية والإنجليزية',
        lang_body: 'اختر لغتك المفضلة، وسيتم تحديث الأبب فوراً.',
        version_title: 'إصدار التطبيق',
        version_sub: 'معرفة الإصدار الحالي',
        version_body: 'أنت تستخدم أحدث إصدار من ChatZone. يتم تحديث الأبب بانتظام لضمان أفضل تجربة.',
        version_badge: 'الإصدار الحالي: 1.0',
        about_title: 'من نحن',
        about_sub: 'تعرّف على فريق ChatZone',
        about_body: 'أهلاً بيك في ChatZone، تطبيق دردشة بسيط وسريع، بيهدف يديك تجربة تواصل مريحة وآمنة مع أي حد بس بإيميله. نتمنى نكون دايماً عند حسن ظنك 💚'
    };

    const EN_TEXT = {
        settings: 'Settings',
        lg_title: 'Liquid Glass',
        lg_sub: 'Enable the Liquid Glass effect across the app',
        lg_body: 'Turn each Liquid Glass effect on or off individually. Everything is off by default.',
        lg_warning: 'Recommended for powerful devices only. Slight lag may occur on weaker devices.',
        lg_bottombar_title: 'Enable Liquid Glass',
        lg_bottombar_sub: 'A translucent glass navigation bar',
        lg_icons_title: 'Liquid Glass from icons',
        lg_icons_sub: 'Apply glass material to circular buttons',
        themes_title: 'App Themes',
        themes_sub: 'Customize your color scheme',
        themes_body: 'Choose a color theme for the app. Your choice is saved automatically.',
        theme_dark: 'Dark',
        theme_white: 'White',
        theme_pick: 'Choose your theme color',
        lang_title: 'App Language',
        lang_sub: 'Switch between Arabic and English',
        lang_body: 'Choose your preferred language. The app will update instantly.',
        version_title: 'App Version',
        version_sub: 'Check the current version',
        version_body: 'You are using the latest version of ChatZone. The app is updated regularly to ensure the best experience.',
        version_badge: 'Current version: 1.0',
        about_title: 'About Us',
        about_sub: 'Meet the ChatZone team',
        about_body: 'Welcome to ChatZone, a simple and fast chat app that aims to give you a comfortable and secure way to connect with anyone using just their email. We hope to always be worthy of your trust 💚'
    };

    let currentLang = localStorage.getItem('cz_lang') || 'ar';

    function applyLang(lang) {
        currentLang = lang;
        localStorage.setItem('cz_lang', lang);
        const isAr = lang === 'ar';
        document.documentElement.lang = lang;
        document.documentElement.dir = isAr ? 'rtl' : 'ltr';

        const dict = isAr ? AR_TEXT : EN_TEXT;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key] !== undefined) el.textContent = dict[key];
        });

        document.getElementById('lang-opt-ar').classList.toggle('selected', lang === 'ar');
        document.getElementById('lang-opt-en').classList.toggle('selected', lang === 'en');
    }

    document.getElementById('lang-opt-ar').addEventListener('click', () => applyLang('ar'));
    document.getElementById('lang-opt-en').addEventListener('click', () => applyLang('en'));

    applyLang(currentLang);
})();
