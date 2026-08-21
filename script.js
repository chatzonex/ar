document.addEventListener('DOMContentLoaded', function() {
    const splash = document.getElementById('splash');
    const loadBar = document.getElementById('loadBar');

    requestAnimationFrame(() => {
        loadBar.style.transition = 'width 1.8s cubic-bezier(.4, 0, .2, 1)';
        loadBar.style.width = '100%';
    });

    setTimeout(() => {
        splash.classList.add('fade-out');
    }, 2100);

    setTimeout(() => {
        const isLoggedIn = !!localStorage.getItem('cz_verified_email');
        window.location.href = isLoggedIn ? 'MainActivity.html' : 'signup.html';
    }, 2550);
});
