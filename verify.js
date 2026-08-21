(function() {
    emailjs.init({ publicKey: 'idu5gyORWMQOOai2X' });

    const EMAILJS_SERVICE_ID = 'service_czab8wl';
    const EMAILJS_TEMPLATE_ID = 'template_mafrpgp';
    const RESEND_COOLDOWN_SECONDS = 30;

    const otpBoxes = Array.from(document.querySelectorAll('.otp-box'));
    const verifyStatus = document.getElementById('verifyStatus');
    const targetEmailEl = document.getElementById('targetEmail');
    const resendLink = document.getElementById('resendLink');
    const resendTimer = document.getElementById('resendTimer');
    const toast = document.getElementById('toast');

    const pendingEmail = localStorage.getItem('cz_pending_email');

    if (!pendingEmail) {
        window.location.href = 'signup.html';
        return;
    }

    targetEmailEl.textContent = pendingEmail;

    function showToast(message, isError) {
        toast.textContent = message;
        toast.className = 'toast show' + (isError ? ' error' : '');
        setTimeout(() => {
            toast.className = 'toast';
        }, 2600);
    }

    function generateCode() {
        return String(Math.floor(100000 + Math.random() * 900000));
    }

    function getStoredCode() {
        return {
            code: localStorage.getItem('cz_pending_code'),
            expiresAt: Number(localStorage.getItem('cz_pending_expires') || 0)
        };
    }

    function clearBoxesError() {
        otpBoxes.forEach(box => box.classList.remove('error'));
    }

    function markVerified() {
        otpBoxes.forEach(box => {
            box.disabled = true;
            box.classList.add('verified');
        });
        verifyStatus.innerHTML = '<span class="dot"></span> تم التأكيد بنجاح';
    }

    function shakeBoxes() {
        otpBoxes.forEach(box => box.classList.add('error'));
        setTimeout(() => {
            otpBoxes.forEach(box => box.value = '');
            clearBoxesError();
            otpBoxes[0].focus();
        }, 400);
    }

    function checkCode() {
        const entered = otpBoxes.map(box => box.value).join('');
        if (entered.length < 6) return;

        const { code, expiresAt } = getStoredCode();

        if (!code || Date.now() > expiresAt) {
            showToast('الكود انتهت صلاحيته، ابعت كود جديد', true);
            shakeBoxes();
            return;
        }

        if (entered === code) {
            markVerified();
            localStorage.setItem('cz_verified_email', pendingEmail);
            localStorage.removeItem('cz_pending_code');
            localStorage.removeItem('cz_pending_expires');
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 900);
        } else {
            showToast('الكود غلط، حاول تاني', true);
            shakeBoxes();
        }
    }

    otpBoxes.forEach((box, index) => {
        box.addEventListener('input', () => {
            box.value = box.value.replace(/[^0-9]/g, '').slice(0, 1);
            clearBoxesError();
            if (box.value && index < otpBoxes.length - 1) {
                otpBoxes[index + 1].focus();
            }
            checkCode();
        });

        box.addEventListener('keydown', e => {
            if (e.key === 'Backspace' && !box.value && index > 0) {
                otpBoxes[index - 1].focus();
            }
        });

        box.addEventListener('paste', e => {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
            if (!pasted) return;
            pasted.slice(0, 6).split('').forEach((digit, i) => {
                if (otpBoxes[i]) otpBoxes[i].value = digit;
            });
            const nextEmpty = otpBoxes.findIndex(b => !b.value);
            (nextEmpty === -1 ? otpBoxes[otpBoxes.length - 1] : otpBoxes[nextEmpty]).focus();
            checkCode();
        });
    });

    otpBoxes[0].focus();

    let cooldownInterval = null;

    function startCooldown() {
        let remaining = RESEND_COOLDOWN_SECONDS;
        resendLink.classList.add('disabled');
        resendTimer.textContent = `(${remaining}s)`;

        cooldownInterval = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                clearInterval(cooldownInterval);
                resendLink.classList.remove('disabled');
                resendTimer.textContent = '';
            } else {
                resendTimer.textContent = `(${remaining}s)`;
            }
        }, 1000);
    }

    async function handleResend() {
        if (resendLink.classList.contains('disabled')) return;

        const code = generateCode();
        const expiresAt = Date.now() + 10 * 60 * 1000;

        resendLink.classList.add('disabled');
        try {
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                to_email: pendingEmail,
                code: code
            });
            localStorage.setItem('cz_pending_code', code);
            localStorage.setItem('cz_pending_expires', String(expiresAt));
            showToast('اتبعت كود جديد على إيميلك');
            startCooldown();
        } catch (err) {
            console.error('Resend failed:', err);
            showToast('حصل خطأ أثناء إرسال الكود، حاول تاني', true);
            resendLink.classList.remove('disabled');
        }
    }

    resendLink.addEventListener('click', handleResend);
    startCooldown();
})();
