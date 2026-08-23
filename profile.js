import { db, doc, getDoc, setDoc, serverTimestamp, ensureAuthenticated } from "./firebase-init.js";

(function () {
    const nameInput = document.getElementById('nameInput');
    const nameError = document.getElementById('nameError');
    const saveNameBtn = document.getElementById('saveNameBtn');
    const toast = document.getElementById('toast');

    // لازم يكون المستخدم عدّى مرحلة التأكيد الأول
    const verifiedEmail = localStorage.getItem('cz_verified_email');

    if (!verifiedEmail) {
        window.location.href = 'signup.html';
        return;
    }

    // بنطبّع الإيميل لحروف صغيرة دايمًا قبل استخدامه كمعرّف مستند في
    // Firestore. ده أهم حاجة: باقي الصفحات (conversation.js, main.js)
    // بتدور على المستخدم بالإيميل بعد toLowerCase() فقط، فلو المستند
    // اتحفظ هنا بحروف كابيتال، أي بحث بعد كده هيدور على مستند تاني
    // (مش موجود) وهيفشل التحقق من الملكية أو جلب الاسم الحقيقي.
    const verifiedEmailLower = verifiedEmail.toLowerCase();

    function showToast(message, isError) {
        toast.textContent = message;
        toast.className = 'toast show' + (isError ? ' error' : '');
        setTimeout(() => {
            toast.className = 'toast';
        }, 2600);
    }

    function showError(message) {
        nameError.textContent = message;
        nameInput.classList.add('error');
    }

    function clearError() {
        nameError.textContent = '';
        nameInput.classList.remove('error');
    }

    function setLoading(isLoading) {
        saveNameBtn.disabled = isLoading;
        saveNameBtn.classList.toggle('loading', isLoading);
    }

    nameInput.addEventListener('input', clearError);

    async function handleSave() {
        const name = nameInput.value.trim();

        if (!name) {
            showError('من فضلك اكتب اسمك');
            return;
        }
        if (name.length < 2) {
            showError('الاسم قصير جدًا');
            return;
        }

        clearError();
        setLoading(true);

        try {
            // لازم يكون فيه جلسة Firebase Auth حقيقية (anonymous) قبل أي
            // كتابة في Firestore، عشان الـ Rules تقدر تتحقق من request.auth.
            const user = await ensureAuthenticated();

            // بنستخدم الإيميل (بحروف صغيرة) كمعرّف فريد للمستخدم في
            // Firestore، وبنسجل الـ uid بتاع Firebase Auth معاه عشان
            // الـ Rules تقدر تربط المستند بصاحبه الحقيقي.
            const userDocRef = doc(db, 'users', verifiedEmailLower);

            // بنجيب المستند الحالي (لو موجود) عشان نعرف هل ده create
            // ولا update، ولو موجود ومملوك لـ uid مختلف عن جلستي الحالية
            // (يعني مفيش تطابق ملكية حقيقي) نوقف فورًا برسالة واضحة
            // بدل ما نسيب Firestore يرفض الطلب برسالة غامضة.
            const existingSnap = await getDoc(userDocRef);
            if (existingSnap.exists() && existingSnap.data().uid && existingSnap.data().uid !== user.uid) {
                console.error('محاولة تعديل مستند مستخدم بجلسة Auth غير مطابقة لصاحبه الأصلي.');
                showToast('في مشكلة في جلسة الدخول، سجّل الكود تاني من صفحة التأكيد', true);
                setLoading(false);
                return;
            }

            await setDoc(userDocRef, {
                name: name,
                email: verifiedEmailLower,
                uid: user.uid,
                createdAt: serverTimestamp()
            }, { merge: true });

            localStorage.setItem('cz_user_name', name);
            localStorage.setItem('cz_uid', user.uid);

            showToast('تم حفظ اسمك بنجاح');

            setTimeout(() => {
                window.location.href = 'MainActivity.html';
            }, 900);
        } catch (err) {
            console.error('فشل حفظ الاسم في Firestore:', err);
            showToast('حصل خطأ أثناء حفظ الاسم، حاول تاني', true);
            setLoading(false);
        }
    }

    saveNameBtn.addEventListener('click', handleSave);
    nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleSave();
    });

    nameInput.focus();

    // ===== تواصل مع المطور عبر واتساب =====
    // لما المستخدم يدوس على الزرار، بنفتحله واتساب فيه رسالة جاهزة
    // بالإيميل بتاعه عشان أقدر أساعده بسرعة من غير ما يكتب حاجة إضافية.
    const contactDevBtn = document.getElementById('contactDevBtn');
    const DEV_WHATSAPP_NUMBER = '201550425843'; // 01550425843 بصيغة دولية (مصر)

    if (contactDevBtn) {
        contactDevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const message = `${verifiedEmailLower}\n\nبعد إذنك، المشكلة هي:`;
            const waLink = `https://wa.me/${DEV_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
            window.open(waLink, '_blank');
        });
    }
})();
