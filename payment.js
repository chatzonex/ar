// payment.js — صفحة الدفع وطلب تفعيل VIP (وضع الطيران + وضع الشبح)

import {
    db, doc, getDoc, addDoc, collection, serverTimestamp,
    ensureAuthenticated
} from './firebase-init.js';

(function () {
    const VODAFONE_CASH_NUMBER = '01019569018';

    const savedEmail = (localStorage.getItem('cz_verified_email') || '').toLowerCase().trim();
    if (!savedEmail) {
        window.location.replace('index.html');
        return;
    }

    const payBackBtn = document.getElementById('payBackBtn');
    const payCopyBtn = document.getElementById('payCopyBtn');
    const payNumberText = document.getElementById('payNumberText');
    const paySubmitBtn = document.getElementById('paySubmitBtn');
    const paySubmitLabel = document.getElementById('paySubmitLabel');
    const payError = document.getElementById('payError');
    const paySuccessOverlay = document.getElementById('paySuccessOverlay');
    const paySuccessCloseBtn = document.getElementById('paySuccessCloseBtn');

    if (payBackBtn) {
        payBackBtn.addEventListener('click', () => {
            window.location.href = 'MainActivity.html';
        });
    }

    // نسخ رقم فودافون كاش
    if (payCopyBtn) {
        payCopyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(VODAFONE_CASH_NUMBER);
            } catch (e) {
                // فولباك لو الكليبورد API مش متاح
                const ta = document.createElement('textarea');
                ta.value = VODAFONE_CASH_NUMBER;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch (e2) {}
                document.body.removeChild(ta);
            }
            payCopyBtn.textContent = 'اتنسخ';
            payCopyBtn.classList.add('copied');
            setTimeout(() => {
                payCopyBtn.textContent = 'نسخ';
                payCopyBtn.classList.remove('copied');
            }, 1600);
        });
    }

    function showError(msg) {
        if (!payError) return;
        payError.textContent = msg;
        payError.classList.remove('hidden');
    }

    function clearError() {
        if (!payError) return;
        payError.classList.add('hidden');
        payError.textContent = '';
    }

    function openSuccessSheet() {
        if (paySuccessOverlay) paySuccessOverlay.classList.add('open');
    }

    if (paySuccessCloseBtn) {
        paySuccessCloseBtn.addEventListener('click', () => {
            window.location.href = 'MainActivity.html';
        });
    }

    if (paySubmitBtn) {
        paySubmitBtn.addEventListener('click', async () => {
            clearError();
            paySubmitBtn.disabled = true;
            paySubmitLabel.textContent = 'جاري الإرسال...';

            try {
                const user = await ensureAuthenticated();
                const myUid = user.uid;

                // نتأكد إن الإيميل ده فعلاً صاحبه هو نفسه صاحب الجلسة الحالية
                const userSnap = await getDoc(doc(db, 'users', savedEmail));
                if (!userSnap.exists() || userSnap.data().uid !== myUid) {
                    showError('تعذّر التحقق من حسابك، جرب تسجل دخول تاني');
                    paySubmitBtn.disabled = false;
                    paySubmitLabel.textContent = 'ابعت الطلب';
                    return;
                }
                const userData = userSnap.data();

                // إنشاء الطلب في Firestore — الأدمن هيشوفه في system.html.
                await addDoc(collection(db, 'vipRequests'), {
                    uid: myUid,
                    email: savedEmail,
                    name: userData.name || '',
                    amount: 30,
                    status: 'pending',
                    createdAt: serverTimestamp()
                });

                openSuccessSheet();
            } catch (e) {
                console.error('فشل إرسال طلب VIP:', e);
                showError('حصل خطأ أثناء إرسال الطلب، جرب تاني');
                paySubmitBtn.disabled = false;
                paySubmitLabel.textContent = 'ابعت الطلب';
            }
        });
    }
})();
