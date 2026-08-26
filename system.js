// system.js — لوحة الأدمن لمراجعة طلبات تفعيل VIP

import {
    db, doc, updateDoc, deleteDoc, collection, query, orderBy, onSnapshot,
    serverTimestamp, auth, signInAdmin, onAuthStateChanged, signOut
} from './firebase-init.js';

(function () {
    const sysLoginScreen = document.getElementById('sysLoginScreen');
    const sysDashboardScreen = document.getElementById('sysDashboardScreen');
    const sysEmailInput = document.getElementById('sysEmailInput');
    const sysPasswordInput = document.getElementById('sysPasswordInput');
    const sysLoginBtn = document.getElementById('sysLoginBtn');
    const sysLoginError = document.getElementById('sysLoginError');
    const sysLogoutBtn = document.getElementById('sysLogoutBtn');

    const sysList = document.getElementById('sysList');
    const sysEmpty = document.getElementById('sysEmpty');
    const sysPendingCount = document.getElementById('sysPendingCount');
    const sysTabs = document.querySelectorAll('.sys-tab');

    const sysReceiptOverlay = document.getElementById('sysReceiptOverlay');
    const sysReceiptImg = document.getElementById('sysReceiptImg');
    const sysReceiptClose = document.getElementById('sysReceiptClose');

    const sysRejectOverlay = document.getElementById('sysRejectOverlay');
    const sysRejectCancelBtn = document.getElementById('sysRejectCancelBtn');
    const sysRejectConfirmBtn = document.getElementById('sysRejectConfirmBtn');

    let activeTab = 'pending';
    let allRequests = [];
    let unsubRequests = null;
    let pendingRejectId = null;

    // ===== تسجيل الدخول =====
    function showLoginError(msg) {
        sysLoginError.textContent = msg;
        sysLoginError.classList.remove('hidden');
    }

    if (sysLoginBtn) {
        sysLoginBtn.addEventListener('click', async () => {
            const email = (sysEmailInput.value || '').trim();
            const password = sysPasswordInput.value || '';
            if (!email || !password) {
                showLoginError('اكتب الإيميل والباسورد');
                return;
            }
            sysLoginError.classList.add('hidden');
            sysLoginBtn.disabled = true;
            sysLoginBtn.textContent = 'جاري الدخول...';
            try {
                await signInAdmin(email, password);
                // onAuthStateChanged هيتكفل بعرض الداشبورد
            } catch (e) {
                console.error('فشل تسجيل دخول الأدمن:', e);
                showLoginError('الإيميل أو الباسورد غلط');
                sysLoginBtn.disabled = false;
                sysLoginBtn.textContent = 'دخول';
            }
        });
    }

    if (sysLogoutBtn) {
        sysLogoutBtn.addEventListener('click', async () => {
            if (unsubRequests) { unsubRequests(); unsubRequests = null; }
            await signOut(auth);
        });
    }

    onAuthStateChanged(auth, (user) => {
        sysLoginBtn.disabled = false;
        sysLoginBtn.textContent = 'دخول';
        // بنتجاهل أي جلسة anonymous جاية من صفحات تانية للموقع —
        // لوحة الأدمن محتاجة جلسة إيميل/باسورد حقيقية بس
        if (user && !user.isAnonymous) {
            sysLoginScreen.classList.add('hidden');
            sysDashboardScreen.classList.remove('hidden');
            startListeningToRequests();
        } else {
            sysDashboardScreen.classList.add('hidden');
            sysLoginScreen.classList.remove('hidden');
        }
    });

    // ===== تبويبات pending / approved / rejected =====
    sysTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            sysTabs.forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.dataset.tab;
            renderList();
        });
    });

    // ===== الاستماع اللايف لكل الطلبات =====
    function startListeningToRequests() {
        if (unsubRequests) unsubRequests();
        const q = query(collection(db, 'vipRequests'), orderBy('createdAt', 'desc'));
        unsubRequests = onSnapshot(q, (snap) => {
            allRequests = [];
            snap.forEach((docSnap) => {
                allRequests.push({ id: docSnap.id, ...docSnap.data() });
            });
            renderList();
        }, (err) => {
            console.error('فشل تحميل طلبات VIP:', err);
        });
    }

    function formatDate(ts) {
        if (!ts || !ts.toDate) return '';
        const d = ts.toDate();
        return d.toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    function renderList() {
        const filtered = allRequests.filter((r) => (r.status || 'pending') === activeTab);
        const pendingCount = allRequests.filter((r) => (r.status || 'pending') === 'pending').length;
        sysPendingCount.textContent = String(pendingCount);

        sysList.innerHTML = '';
        if (filtered.length === 0) {
            sysList.appendChild(sysEmpty);
            sysEmpty.classList.remove('hidden');
            return;
        }
        sysEmpty.classList.add('hidden');

        filtered.forEach((req) => {
            const card = document.createElement('div');
            card.className = 'sys-card';

            const thumb = document.createElement('img');
            thumb.className = 'sys-card-thumb';
            thumb.src = req.receiptImage || '';
            thumb.alt = 'إيصال';
            thumb.addEventListener('click', () => openReceipt(req.receiptImage));

            const body = document.createElement('div');
            body.className = 'sys-card-body';

            const name = document.createElement('div');
            name.className = 'sys-card-name';
            name.textContent = req.name || 'بدون اسم';

            const email = document.createElement('div');
            email.className = 'sys-card-email';
            email.textContent = req.email || '';

            const date = document.createElement('div');
            date.className = 'sys-card-date';
            date.textContent = formatDate(req.createdAt);

            body.appendChild(name);
            body.appendChild(email);
            body.appendChild(date);

            if (req.status === 'pending' || !req.status) {
                const actions = document.createElement('div');
                actions.className = 'sys-card-actions';

                const approveBtn = document.createElement('button');
                approveBtn.className = 'sys-btn sys-btn-primary';
                approveBtn.textContent = 'قبول وتفعيل';
                approveBtn.addEventListener('click', () => approveRequest(req));

                const rejectBtn = document.createElement('button');
                rejectBtn.className = 'sys-btn sys-btn-danger';
                rejectBtn.textContent = 'رفض';
                rejectBtn.addEventListener('click', () => openRejectConfirm(req.id));

                actions.appendChild(approveBtn);
                actions.appendChild(rejectBtn);
                body.appendChild(actions);
            } else {
                const badge = document.createElement('span');
                badge.className = 'sys-status-badge ' + (req.status === 'approved' ? 'approved' : 'rejected');
                badge.textContent = req.status === 'approved' ? 'تم القبول' : 'تم الرفض';
                body.appendChild(badge);
            }

            card.appendChild(thumb);
            card.appendChild(body);
            sysList.appendChild(card);
        });
    }

    // ===== معاينة الإيصال بحجم كامل =====
    function openReceipt(url) {
        if (!url) return;
        sysReceiptImg.src = url;
        sysReceiptOverlay.classList.add('open');
    }
    function closeReceipt() {
        sysReceiptOverlay.classList.remove('open');
        sysReceiptImg.src = '';
    }
    if (sysReceiptClose) sysReceiptClose.addEventListener('click', closeReceipt);
    if (sysReceiptOverlay) {
        sysReceiptOverlay.addEventListener('click', (e) => {
            if (e.target === sysReceiptOverlay) closeReceipt();
        });
    }

    // ===== قبول الطلب: تفعيل VIP على مستند اليوزر =====
    async function approveRequest(req) {
        try {
            await updateDoc(doc(db, 'users', req.email), {
                vip: true,
                vipSince: serverTimestamp()
            });
            await updateDoc(doc(db, 'vipRequests', req.id), {
                status: 'approved',
                reviewedAt: serverTimestamp()
            });
        } catch (e) {
            console.error('فشل قبول طلب VIP:', e);
            alert('حصل خطأ أثناء تفعيل الاشتراك، جرب تاني');
        }
    }

    // ===== رفض الطلب: حذف نهائي من Firestore (الصورة متخزنة جوه
    // نفس المستند كـ Base64، فحذف المستند بيمسحها هي كمان تلقائيًا) =====
    function openRejectConfirm(reqId) {
        pendingRejectId = reqId;
        sysRejectOverlay.classList.add('open');
    }
    function closeRejectConfirm() {
        pendingRejectId = null;
        sysRejectOverlay.classList.remove('open');
    }
    if (sysRejectCancelBtn) sysRejectCancelBtn.addEventListener('click', closeRejectConfirm);
    if (sysRejectOverlay) {
        sysRejectOverlay.addEventListener('click', (e) => {
            if (e.target === sysRejectOverlay) closeRejectConfirm();
        });
    }
    if (sysRejectConfirmBtn) {
        sysRejectConfirmBtn.addEventListener('click', async () => {
            if (!pendingRejectId) return;
            sysRejectConfirmBtn.disabled = true;
            try {
                await deleteDoc(doc(db, 'vipRequests', pendingRejectId));
            } catch (e) {
                console.error('فشل رفض/حذف طلب VIP:', e);
                alert('حصل خطأ أثناء حذف الطلب، جرب تاني');
            }
            sysRejectConfirmBtn.disabled = false;
            closeRejectConfirm();
        });
    }
})();
