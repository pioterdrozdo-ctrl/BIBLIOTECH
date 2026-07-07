const API_URL = window.BIBLIOTECH_API_URL || '/api';
const SESSION_KEY = 'bibliotech_current_user';

function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
    catch { return null; }
}

function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
    }[char]));
}

function formatAdminDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function logout() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

async function loadUsers() {
    const tbody = document.getElementById('adminUsersTableBody');
    const summary = document.getElementById('adminUsersSummary');
    const token = localStorage.getItem('token');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">Загрузка...</td></tr>';

    try {
        const response = await fetch(`${API_URL}/auth/users`, {
            headers: { Authorization: token ? `Bearer ${token}` : '' }
        });
        if (!response.ok) throw new Error('Forbidden');
        const payload = await response.json();
        const users = Array.isArray(payload) ? payload : (payload.users || []);
        if (summary) summary.textContent = `${users.length} аккаунтов`;
        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${escapeHtml(user.id)}</td>
                <td><b>${escapeHtml(user.username)}</b></td>
                <td>${escapeHtml(user.email || '—')}</td>
                <td><span class="admin-role-badge ${user.role === 'admin' ? 'admin' : ''}">${escapeHtml(user.role)}</span></td>
                <td><span class="password-safe">Скрыт: хэш</span></td>
                <td>${escapeHtml(formatAdminDate(user.created_at))}</td>
            </tr>
        `).join('') || '<tr><td colspan="6">Пользователей пока нет</td></tr>';
    } catch (error) {
        if (summary) summary.textContent = 'Нет доступа';
        tbody.innerHTML = '<tr><td colspan="6">Эта вкладка доступна только админу.</td></tr>';
    }
}

function initAdminPage() {
    const session = getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }
    if (session.role !== 'admin') {
        window.location.href = 'home.html';
        return;
    }

    const pill = document.getElementById('currentUserPill');
    if (pill) pill.textContent = `🛡️ Админ: ${session.username || 'admin'}`;
    document.getElementById('logoutBtn')?.addEventListener('click', event => {
        event.preventDefault();
        logout();
    });
    const menu = document.getElementById('navMenu');
    const menuBtn = document.getElementById('menuIcon');
    menuBtn?.addEventListener('click', () => {
        menu?.classList.toggle('active');
        menuBtn.classList.toggle('active');
        document.body.classList.toggle('lock');
    });
    document.getElementById('refreshUsersBtn')?.addEventListener('click', loadUsers);
    loadUsers();
}

document.addEventListener('DOMContentLoaded', initAdminPage);
