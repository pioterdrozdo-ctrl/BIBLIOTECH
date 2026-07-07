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

function formatAdminDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatLocation(location = {}) {
    return [location.note, location.shelfCode || location.shelf_code, location.placeCode || location.place_code ? `место ${location.placeCode || location.place_code}` : '']
        .filter(Boolean)
        .join(' · ') || 'Без названия';
}

function logout() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

async function loadLocations() {
    const grid = document.getElementById('adminLocationsGrid');
    const summary = document.getElementById('adminLocationsSummary');
    if (!grid) return;
    grid.innerHTML = '<div class="admin-location-empty">Загрузка...</div>';

    try {
        const response = await fetch(`${API_URL}/storage-locations`);
        if (!response.ok) throw new Error('Locations error');
        const payload = await response.json();
        const locations = payload.locations || [];
        if (summary) summary.textContent = `${locations.length} мест хранения`;
        grid.innerHTML = locations.map(location => `
            <div class="admin-location-chip">
                <b>${escapeHtml(location.shelfCode || location.shelf_code)}</b>
                <span>${escapeHtml(location.placeCode || location.place_code)}</span>
                <small>${escapeHtml(location.note || 'Без заметки')}</small>
            </div>
        `).join('') || '<div class="admin-location-empty">Мест пока нет</div>';
    } catch (error) {
        if (summary) summary.textContent = 'Не удалось загрузить';
        grid.innerHTML = '<div class="admin-location-empty">Места хранения недоступны.</div>';
    }
}

async function addLocation(event) {
    event.preventDefault();
    const token = localStorage.getItem('token');
    const shelfCode = document.getElementById('storageShelfInput')?.value.trim();
    const placeCode = document.getElementById('storagePlaceInput')?.value.trim();
    const note = document.getElementById('storageNoteInput')?.value.trim();
    if (!shelfCode || !placeCode) return;

    const response = await fetch(`${API_URL}/storage-locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ shelfCode, placeCode, note })
    });
    if (response.ok) {
        event.target.reset();
        loadLocations();
    }
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

async function loadRentals() {
    const tbody = document.getElementById('adminRentalsTableBody');
    const summary = document.getElementById('adminRentalsSummary');
    const token = localStorage.getItem('token');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">Загрузка...</td></tr>';

    try {
        const response = await fetch(`${API_URL}/rentals`, {
            headers: { Authorization: token ? `Bearer ${token}` : '' }
        });
        if (!response.ok) throw new Error('Rentals error');
        const payload = await response.json();
        const rentals = payload.rentals || [];
        const active = rentals.filter(rental => rental.status === 'active').length;
        if (summary) summary.textContent = `${active} активных · ${rentals.length} всего`;
        tbody.innerHTML = rentals.map(rental => `
            <tr>
                <td>${escapeHtml(rental.id)}</td>
                <td><b>${escapeHtml(rental.book_title)}</b></td>
                <td>${escapeHtml(rental.username)}</td>
                <td>${escapeHtml(formatAdminDateTime(rental.rented_at))}</td>
                <td><span class="admin-role-badge ${rental.status === 'active' ? 'admin' : ''}">${rental.status === 'active' ? 'На руках' : 'Возвращена'}</span></td>
                <td>${rental.status === 'active' ? `<button class="admin-return-btn" data-book="${escapeHtml(rental.book_id)}" data-rental="${escapeHtml(rental.id)}">Принять</button>` : '—'}</td>
            </tr>
        `).join('') || '<tr><td colspan="6">Аренд пока нет</td></tr>';
    } catch (error) {
        if (summary) summary.textContent = 'Не удалось загрузить';
        tbody.innerHTML = '<tr><td colspan="6">Журнал аренды недоступен.</td></tr>';
    }
}

async function returnRental(bookId, rentalId) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/books/${bookId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ rentalId })
    });
    if (response.ok) loadRentals();
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
    document.getElementById('refreshRentalsBtn')?.addEventListener('click', loadRentals);
    document.getElementById('storageLocationForm')?.addEventListener('submit', addLocation);
    document.getElementById('adminRentalsTableBody')?.addEventListener('click', event => {
        const button = event.target.closest('.admin-return-btn');
        if (button) returnRental(button.dataset.book, button.dataset.rental);
    });
    loadUsers();
    loadLocations();
    loadRentals();
}

document.addEventListener('DOMContentLoaded', initAdminPage);
