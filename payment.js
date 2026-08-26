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
    const payWhatsappLink = document.getElementById('payWhatsappLink');
    const payFileInput = document.getElementById('payFileInput');
    const payUploadBox = document.getElementById('payUploadBox');
    const payUploadEmpty = document.getElementById('payUploadEmpty');
    const payUploadPreview = document.getElementById('payUploadPreview');
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

    // رابط واتساب بنفس رقم فودافون كاش، برسالة جاهزة
    if (payWhatsappLink) {
        const waMsg = encodeURIComponent(
            `السلام عليكم، أنا معايا إيصال تحويل 30 جنيه فودافون كاش لتفعيل اشتراك VIP في ChatZone. الإيميل بتاعي: ${savedEmail}`
        );
        payWhatsappLink.href = `https://wa.me/2${VODAFONE_CASH_NUMBER}?text=${waMsg}`;
    }

    let selectedFile = null;
    let selectedImageBase64 = null;

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

    function updateSubmitState() {
        if (paySubmitBtn) paySubmitBtn.disabled = !selectedImageBase64;
    }

    // بنضغط الصورة ونحوّلها لـ Base64 قبل ما نخزنها، لأن مفيش Storage
    // في المشروع ده (خدمة مدفوعة اتشالت)، فبنخزن الإيصال كـ نص Base64
    // جوه مستند الطلب في Firestore نفسه (مجاني بالكامل). بنقلل أبعاد
    // الصورة ونحوّلها JPEG بجودة متوسطة عشان نفضل بعيد عن حد الـ 1
    // ميجا اللي Firestore بيسمح بيه لحجم المستند الواحد.
    function compressImageToBase64(file, maxDimension, quality) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            img.onload = () => {
                let { width, height } = img;
                if (width > height && width > maxDimension) {
                    height = Math.round(height * (maxDimension / width));
                    width = maxDimension;
                } else if (height >= width && height > maxDimension) {
                    width = Math.round(width * (maxDimension / height));
                    height = maxDimension;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                URL.revokeObjectURL(objectUrl);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('تعذّرت قراءة الصورة'));
            };
            img.src = objectUrl;
        });
    }

    if (payUploadBox && payFileInput) {
        payUploadBox.addEventListener('click', () => payFileInput.click());
        payFileInput.addEventListener('change', async () => {
            clearError();
            const file = payFileInput.files && payFileInput.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                showError('لازم ترفع صورة (سكرين شوت) بس');
                payFileInput.value = '';
                return;
            }
            if (file.size > 12 * 1024 * 1024) {
                showError('حجم الصورة كبير قوي، جرب صورة أصغر');
                payFileInput.value = '';
                return;
            }

            payUploadEmpty.textContent = '';
            const originalEmptyHTML = payUploadEmpty.innerHTML;
            payUploadEmpty.innerHTML = '<span>جاري تجهيز الصورة...</span>';

            try {
                selectedImageBase64 = await compressImageToBase64(file, 1280, 0.72);
                // لو لسه أكبر من المتوقع (صورة معقدة جدًا)، نضغطها أكتر
                if (selectedImageBase64.length > 900 * 1024) {
                    selectedImageBase64 = await compressImageToBase64(file, 900, 0.55);
                }
                selectedFile = file;
                payUploadPreview.src = selectedImageBase64;
                payUploadPreview.classList.remove('hidden');
                payUploadEmpty.classList.add('hidden');
            } catch (e) {
                console.error('فشل تجهيز الصورة:', e);
                showError('حصل خطأ في قراءة الصورة، جرب صورة تانية');
                payUploadEmpty.innerHTML = originalEmptyHTML;
                payFileInput.value = '';
                selectedImageBase64 = null;
            }
            updateSubmitState();
        });
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
            if (!selectedImageBase64) return;
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

                if (selectedImageBase64.length > 1000 * 1024) {
                    showError('الصورة لسه كبيرة قوي، جرب صورة تانية أصغر شوية');
                    paySubmitBtn.disabled = false;
                    paySubmitLabel.textContent = 'ابعت الطلب';
                    return;
                }

                // إنشاء الطلب في Firestore — الأدمن هيشوفه في system.html.
                // صورة الإيصال متخزنة كـ Base64 جوه المستند نفسه (بدل
                // Storage اللي محتاج خطة مدفوعة)، فمفيش حاجة تانية
                // لازم نرفعها أو نحذفها من أي مكان تاني.
                await addDoc(collection(db, 'vipRequests'), {
                    uid: myUid,
                    email: savedEmail,
                    name: userData.name || '',
                    receiptImage: selectedImageBase64,
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
