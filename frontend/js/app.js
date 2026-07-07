const API_URL = window.BIBLIOTECH_API_URL || '/api';
const SESSION_KEY = 'bibliotech_current_user';
const POST_LOGIN_URL_KEY = 'bibliotech_post_login_url';

function getPostLoginUrl() {
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

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.form').forEach(f => f.classList.remove('active'));

    if (tab === 'login') {
        document.querySelector('.tab:first-child').classList.add('active');
        document.getElementById('loginForm').classList.add('active');
    } else {
        document.querySelector('.tab:last-child').classList.add('active');
        document.getElementById('registerForm').classList.add('active');
    }

    ['loginError', 'regError', 'regSuccess'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    });
}

async function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
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
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) {
            errorDiv.textContent = data.error || 'Ошибка входа';
            return;
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem(SESSION_KEY, JSON.stringify({ id: data.user.id, username: data.user.username, role: data.user.role }));

        window.location.href = getPostLoginUrl();
    } catch (err) {
        errorDiv.textContent = 'Ошибка соединения с сервером';
        console.error(err);
    }
}

async function register() {
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const errorDiv = document.getElementById('regError');
    const successDiv = document.getElementById('regSuccess');

    errorDiv.textContent = '';
    successDiv.textContent = '';

    if (!username || !password) {
        errorDiv.textContent = 'Заполните все поля';
        return;
    }

    if (password.length < 4) {
        errorDiv.textContent = 'Пароль должен быть минимум 4 символа';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) {
            errorDiv.textContent = data.error || 'Ошибка регистрации';
            return;
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem(SESSION_KEY, JSON.stringify({ id: data.user.id, username: data.user.username, role: data.user.role }));

        successDiv.textContent = 'Регистрация успешна!';
        setTimeout(() => window.location.href = getPostLoginUrl(), 700);
    } catch (err) {
        errorDiv.textContent = 'Ошибка соединения с сервером';
        console.error(err);
    }
}

function guestLogin() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.setItem(SESSION_KEY, JSON.stringify({ username: 'Гость', role: 'guest', guest: true }));
    window.location.href = getPostLoginUrl();
}

// Функции темы (оставляем без изменений)
function updateThemeIcon(theme) {
    const allowed = ['light', 'dark', 'forest', 'ocean', 'sunset', 'violet', 'coffee', 'mono'];
    const iconFiles = {
        light: 'appicon-light.png',
        dark: 'appicon-dark.png',
        forest: 'appicon-forest.png',
        ocean: 'appicon-ocean.png',
        sunset: 'appicon-sunset.png',
        violet: 'appicon-violet.png',
        coffee: 'appicon-coffee.png',
        mono: 'appicon-mono.png'
    };
    const normalized = allowed.includes(theme) ? theme : 'light';
    const iconPath = `img/${iconFiles[normalized] || iconFiles.light}`;
    const setLink = (rel, attr, href = iconPath) => {
        let link = document.querySelector(`link[rel="${rel}"]`);
        if (!link) {
            link = document.createElement('link');
            link.rel = rel;
            document.head.appendChild(link);
        }
        link.href = href;
        if (attr) Object.entries(attr).forEach(([k, v]) => link.setAttribute(k, v));
    };
    setLink('icon', { 'type': 'image/png' });
    setLink('apple-touch-icon');
    setLink('manifest', {}, `/manifest.webmanifest?theme=${encodeURIComponent(normalized)}`);
    document.querySelectorAll('.brand-logo img, .auth-brand img, .logo-orb img, .about-logo-showcase img').forEach(img => {
        img.src = iconPath;
        img.removeAttribute('srcset');
    });
}

function applyAuthTheme(theme) {
    const allowed = ['light', 'dark', 'forest', 'ocean', 'sunset', 'violet', 'coffee', 'mono'];
    const normalized = allowed.includes(theme) ? theme : 'light';
    const darkThemes = ['dark', 'forest', 'ocean', 'violet', 'mono'];
    const themeColors = {
        light: '#f5f2ec',
        dark: '#0d1512',
        forest: '#071b13',
        ocean: '#071724',
        sunset: '#fff3e3',
        violet: '#15091f',
        coffee: '#f3e9dc',
        mono: '#111111'
    };
    document.documentElement.classList.remove(...allowed.map(t => 'theme-' + t), 'dark-theme');
    document.body.classList.remove(...allowed.map(t => 'theme-' + t), 'dark-theme');
    document.documentElement.classList.add('theme-' + normalized);
    document.body.classList.add('theme-' + normalized);
    document.documentElement.dataset.theme = normalized;
    document.body.dataset.theme = normalized;
    updateThemeIcon(normalized);
    if (darkThemes.includes(normalized)) {
        document.documentElement.classList.add('dark-theme');
        document.body.classList.add('dark-theme');
    }
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
        metaTheme = document.createElement('meta');
        metaTheme.name = 'theme-color';
        document.head.appendChild(metaTheme);
    }
    metaTheme.content = themeColors[normalized] || themeColors.light;
}

function setupAuthTheme() {
    const btn = document.getElementById('authThemeToggle');
    applyAuthTheme(localStorage.getItem('theme') || 'light');
    if (!btn) return;
    btn.textContent = document.body.classList.contains('dark-theme') ? '☀️' : '🌙';
    btn.addEventListener('click', () => {
        const next = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        applyAuthTheme(next);
        btn.textContent = document.body.classList.contains('dark-theme') ? '☀️' : '🌙';
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupAuthTheme();

    const session = localStorage.getItem(SESSION_KEY);
    if (session && location.pathname.endsWith('index.html')) {
        window.location.href = 'home.html';
    }

    const loginPassword = document.getElementById('loginPassword');
    const regPassword = document.getElementById('regPassword');
    if (loginPassword) loginPassword.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    if (regPassword) regPassword.addEventListener('keydown', e => { if (e.key === 'Enter') register(); });
});
