(function () {
    const API_URL = window.BIBLIOTECH_API_URL || '/api';
    const SESSION_KEY = 'bibliotech_current_user';
    const POST_LOGIN_URL_KEY = 'bibliotech_post_login_url';

    function getRedirectUrl() {
        const fallback = 'home.html';
        const saved = localStorage.getItem(POST_LOGIN_URL_KEY);
        localStorage.removeItem(POST_LOGIN_URL_KEY);
        if (!saved) return fallback;
        try {
            const url = new URL(saved, window.location.href);
            if (url.origin !== window.location.origin) return fallback;
            return `${url.pathname}${url.search}${url.hash}` || fallback;
        } catch {
            return fallback;
        }
    }

    function ensureTwoFactorField() {
        const password = document.getElementById('loginPassword');
        if (!password || document.getElementById('loginTwoFactorCode')) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'loginTwoFactorCode';
        input.inputMode = 'numeric';
        input.autocomplete = 'one-time-code';
        input.placeholder = 'Код 2FA из приложения';
        input.hidden = true;
        password.insertAdjacentElement('afterend', input);
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && typeof window.login === 'function') window.login();
        });
    }

    function showTwoFactorField() {
        ensureTwoFactorField();
        const input = document.getElementById('loginTwoFactorCode');
        if (!input) return;
        input.hidden = false;
        input.focus();
    }

    window.login = async function loginWithTwoFactor() {
        ensureTwoFactorField();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const twoFactorInput = document.getElementById('loginTwoFactorCode');
        const twoFactorCode = twoFactorInput && !twoFactorInput.hidden ? twoFactorInput.value.trim() : '';
        const errorDiv = document.getElementById('loginError');
        errorDiv.textContent = '';

        if (!username || !password) {
            errorDiv.textContent = 'Заполните все поля';
            return;
        }

        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, twoFactorCode })
            });
            const data = await response.json();

            if (data.twoFactorRequired) {
                showTwoFactorField();
                errorDiv.textContent = twoFactorCode ? 'Неверный код 2FA' : 'Введите код из приложения-аутентификатора';
                return;
            }

            if (!response.ok) {
                errorDiv.textContent = data.message || data.error || 'Ошибка входа';
                return;
            }

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem(SESSION_KEY, JSON.stringify({
                id: data.user.id,
                username: data.user.username,
                email: data.user.email,
                role: data.user.role
            }));
            window.location.href = getRedirectUrl();
        } catch (error) {
            errorDiv.textContent = 'Ошибка соединения с сервером';
            console.error(error);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureTwoFactorField);
    } else {
        ensureTwoFactorField();
    }
})();
