import { db, doc, setDoc, serverTimestamp, ensureAuthenticated } from "./firebase-init.js";

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

            // بنستخدم الإيميل كمعرّف فريد للمستخدم في Firestore،
            // وبنسجل الـ uid بتاع Firebase Auth معاه عشان الـ Rules
            // تقدر تربط المستند بصاحبه الحقيقي.
            const userDocRef = doc(db, 'users', verifiedEmail);

            await setDoc(userDocRef, {
                name: name,
                email: verifiedEmail,
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
})();
