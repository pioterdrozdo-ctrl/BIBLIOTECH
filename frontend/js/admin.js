const API_URL = window.BIBLIOTECH_API_URL || '/api';
const SESSION_KEY = 'bibliotech_current_user';
let activeUserDetailId = null;

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

function formatDeviceShort(user = {}) {
    return [user.last_login_os, user.last_login_browser, user.last_login_device]
        .filter(Boolean)
        .join(' · ') || '—';
}

function isUserFrozen(user = {}) {
    if (typeof user.frozen === 'boolean') return user.frozen;
    if (!user.banned_until) return false;
    const date = new Date(user.banned_until);
    return !Number.isNaN(date.getTime()) && date > new Date();
}

function formatUserStatus(user = {}) {
    if (!isUserFrozen(user)) return '<span class="admin-role-badge admin-status-active">Активен</span>';
    return `<span class="admin-role-badge admin-status-frozen">Заморожен до ${escapeHtml(formatAdminDateTime(user.banned_until))}</span>`;
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

function ensureUserDetailModal() {
    if (document.getElementById('userDetailModal')) return;

    const style = document.createElement('style');
    style.textContent = `
        .admin-users-table tr.user-row { cursor: pointer; transition: background .18s ease, transform .18s ease; }
        .admin-users-table tr.user-row:hover { background: rgba(72, 187, 120, .10); transform: translateY(-1px); }
        .admin-status-active { background: rgba(72, 187, 120, .16); color: #2f855a; }
        .admin-status-frozen { background: rgba(245, 101, 101, .16); color: #c53030; }
        .admin-detail-modal .modal-content { max-width: 980px; width: min(96vw, 980px); max-height: 90vh; overflow: auto; }
        .admin-detail-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1rem; }
        .admin-detail-close { border: 0; border-radius: 999px; width: 42px; height: 42px; cursor: pointer; font-size: 1.4rem; }
        .admin-detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: .8rem; margin: 1rem 0; }
        .admin-detail-card { border: 1px solid rgba(120,120,120,.18); border-radius: 18px; padding: .9rem; background: rgba(255,255,255,.06); }
        .admin-detail-card span { display: block; font-size: .78rem; opacity: .72; margin-bottom: .35rem; }
        .admin-detail-card b { word-break: break-word; }
        .admin-action-panel { margin: 1rem 0; padding: 1rem; border-radius: 18px; border: 1px solid rgba(245, 101, 101, .22); background: rgba(245, 101, 101, .06); }
        .admin-action-panel h3 { margin: 0 0 .35rem; }
        .admin-action-panel p { margin: 0 0 .8rem; opacity: .78; }
        .admin-freeze-grid { display: grid; grid-template-columns: minmax(80px, 110px) minmax(120px, 160px) 1fr; gap: .65rem; margin-bottom: .65rem; }
        .admin-freeze-grid input, .admin-freeze-grid select, .admin-ban-reason { width: 100%; border: 1px solid rgba(120,120,120,.22); border-radius: 12px; padding: .75rem .8rem; background: rgba(255,255,255,.08); color: inherit; }
        .admin-action-buttons { display: flex; flex-wrap: wrap; gap: .6rem; }
        .admin-action-buttons button { border: 0; border-radius: 12px; padding: .7rem .95rem; cursor: pointer; font-weight: 700; }
        .admin-freeze-btn { background: #ed8936; color: white; }
        .admin-unfreeze-btn { background: #48bb78; color: white; }
        .admin-delete-user-btn { background: #e53e3e; color: white; }
        .admin-action-buttons button:disabled { opacity: .5; cursor: not-allowed; }
        .admin-history-section { margin-top: 1.2rem; }
        .admin-history-section h3 { margin: 0 0 .6rem; }
        .admin-history-list { display: grid; gap: .55rem; }
        .admin-history-item { border: 1px solid rgba(120,120,120,.16); border-radius: 14px; padding: .75rem .85rem; background: rgba(255,255,255,.045); }
        .admin-history-item b { display: block; margin-bottom: .25rem; }
        .admin-history-item small { display: block; opacity: .72; line-height: 1.45; word-break: break-word; }
        .admin-ua-box { margin-top: .6rem; padding: .75rem; border-radius: 14px; background: rgba(0,0,0,.08); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .78rem; word-break: break-word; }
        .admin-detail-loading { padding: 1rem 0; opacity: .75; }
        @media (max-width: 760px) { .admin-freeze-grid { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);

    document.body.insertAdjacentHTML('beforeend', `
        <div id="userDetailModal" class="modal admin-detail-modal">
            <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="userDetailTitle">
                <div class="admin-detail-head">
                    <div>
                        <span class="eyebrow">Подробности пользователя</span>
                        <h2 id="userDetailTitle">Пользователь</h2>
                        <p id="userDetailSubtitle">Загрузка...</p>
                    </div>
                    <button class="admin-detail-close" id="closeUserDetailModalBtn" type="button" aria-label="Закрыть карточку пользователя">×</button>
                </div>
                <div id="userDetailBody" class="admin-detail-loading">Загрузка...</div>
            </div>
        </div>
    `);

    document.getElementById('closeUserDetailModalBtn')?.addEventListener('click', closeUserDetailModal);
    document.getElementById('userDetailModal')?.addEventListener('click', event => {
        if (event.target.id === 'userDetailModal') closeUserDetailModal();
    });
}

function openUserDetailModal() {
    ensureUserDetailModal();
    document.getElementById('userDetailModal')?.classList.add('active');
    document.body.classList.add('lock');
}

function closeUserDetailModal() {
    document.getElementById('userDetailModal')?.classList.remove('active');
    document.body.classList.remove('lock');
}

function renderEmptyHistory(text) {
    return `<div class="admin-history-item"><small>${escapeHtml(text)}</small></div>`;
}

function renderLoginHistory(logins = []) {
    if (!logins.length) return renderEmptyHistory('Истории входов пока нет. Она начнёт появляться после новых авторизаций.');
    return logins.map(login => `
        <div class="admin-history-item">
            <b>${escapeHtml(formatAdminDateTime(login.created_at))}</b>
            <small>IP: ${escapeHtml(login.ip_address || '—')}</small>
            <small>Устройство: ${escapeHtml([login.os, login.browser, login.device, login.platform].filter(Boolean).join(' · ') || '—')}</small>
            <small>User-Agent:</small>
            <div class="admin-ua-box">${escapeHtml(login.user_agent || '—')}</div>
        </div>
    `).join('');
}

function renderRentalsHistory(rentals = []) {
    if (!rentals.length) return renderEmptyHistory('Истории аренды пока нет.');
    return rentals.map(rental => `
        <div class="admin-history-item">
            <b>${escapeHtml(rental.book_title || 'Книга')}</b>
            <small>Взята: ${escapeHtml(formatAdminDateTime(rental.rented_at))}</small>
            <small>Возвращена: ${escapeHtml(formatAdminDateTime(rental.returned_at))}</small>
            <small>Статус: ${rental.status === 'active' ? 'на руках' : 'возвращена'}</small>
        </div>
    `).join('');
}

function renderCommentsHistory(comments = []) {
    if (!comments.length) return renderEmptyHistory('Комментариев пока нет.');
    return comments.map(comment => `
        <div class="admin-history-item">
            <b>${escapeHtml(comment.book_title || 'Книга')}</b>
            <small>${escapeHtml(formatAdminDateTime(comment.created_at))}</small>
            <small>${escapeHtml(comment.text || '')}</small>
        </div>
    `).join('');
}

function renderUserActions(user = {}) {
    const session = getSession();
    const isSelf = Number(session?.id) === Number(user.id);
    const disabled = isSelf ? 'disabled' : '';
    const note = isSelf
        ? 'Свой аккаунт нельзя заморозить или удалить, чтобы не потерять доступ к админке.'
        : 'Заморозка запрещает пользователю войти до указанного срока. Удаление аккаунта необратимо.';

    return `
        <div class="admin-action-panel">
            <h3>Управление доступом</h3>
            <p>${escapeHtml(note)}</p>
            <div class="admin-freeze-grid">
                <input id="freezeDurationValue" type="number" min="1" max="365" value="1" ${disabled}>
                <select id="freezeDurationUnit" ${disabled}>
                    <option value="minutes">минут</option>
                    <option value="hours" selected>часов</option>
                    <option value="days">дней</option>
                    <option value="weeks">недель</option>
                </select>
                <input class="admin-ban-reason" id="freezeReason" type="text" placeholder="Причина: нарушение правил" ${disabled}>
            </div>
            <div class="admin-action-buttons">
                <button class="admin-freeze-btn" id="freezeUserBtn" type="button" ${disabled}>Заморозить</button>
                <button class="admin-unfreeze-btn" id="unfreezeUserBtn" type="button" ${disabled}>Разморозить</button>
                <button class="admin-delete-user-btn" id="deleteUserBtn" type="button" ${disabled}>Удалить аккаунт</button>
            </div>
        </div>
    `;
}

function renderUserDetail(payload) {
    const user = payload.user || {};
    const title = document.getElementById('userDetailTitle');
    const subtitle = document.getElementById('userDetailSubtitle');
    const body = document.getElementById('userDetailBody');
    if (title) title.textContent = `${user.username || 'Пользователь'} · #${user.id || '—'}`;
    if (subtitle) subtitle.textContent = `${user.email || 'Почта не указана'} · роль: ${user.role || 'user'}`;
    if (!body) return;

    body.classList.remove('admin-detail-loading');
    body.innerHTML = `
        <div class="admin-detail-grid">
            <div class="admin-detail-card"><span>ID</span><b>${escapeHtml(user.id || '—')}</b></div>
            <div class="admin-detail-card"><span>Логин</span><b>${escapeHtml(user.username || '—')}</b></div>
            <div class="admin-detail-card"><span>Почта</span><b>${escapeHtml(user.email || '—')}</b></div>
            <div class="admin-detail-card"><span>Роль</span><b>${escapeHtml(user.role || '—')}</b></div>
            <div class="admin-detail-card"><span>Статус</span><b>${isUserFrozen(user) ? 'Заморожен' : 'Активен'}</b></div>
            <div class="admin-detail-card"><span>Заморожен до</span><b>${escapeHtml(formatAdminDateTime(user.banned_until))}</b></div>
            <div class="admin-detail-card"><span>Причина</span><b>${escapeHtml(user.ban_reason || '—')}</b></div>
            <div class="admin-detail-card"><span>Создан</span><b>${escapeHtml(formatAdminDateTime(user.created_at))}</b></div>
            <div class="admin-detail-card"><span>Последний вход</span><b>${escapeHtml(formatAdminDateTime(user.last_login_at))}</b></div>
            <div class="admin-detail-card"><span>Последний IP</span><b>${escapeHtml(user.last_login_ip || '—')}</b></div>
            <div class="admin-detail-card"><span>ОС</span><b>${escapeHtml(user.last_login_os || '—')}</b></div>
            <div class="admin-detail-card"><span>Браузер</span><b>${escapeHtml(user.last_login_browser || '—')}</b></div>
            <div class="admin-detail-card"><span>Устройство</span><b>${escapeHtml(user.last_login_device || '—')}</b></div>
            <div class="admin-detail-card"><span>Пароль</span><b>${user.password_set ? 'Скрыт: хэш' : 'Не задан'}</b></div>
        </div>
        ${renderUserActions(user)}
        <div class="admin-history-section">
            <h3>Последние входы</h3>
            <div class="admin-history-list">${renderLoginHistory(payload.logins || [])}</div>
        </div>
        <div class="admin-history-section">
            <h3>История аренды</h3>
            <div class="admin-history-list">${renderRentalsHistory(payload.rentals || [])}</div>
        </div>
        <div class="admin-history-section">
            <h3>Комментарии пользователя</h3>
            <div class="admin-history-list">${renderCommentsHistory(payload.comments || [])}</div>
        </div>
    `;
}

async function openUserDetail(userId) {
    const token = localStorage.getItem('token');
    activeUserDetailId = userId;
    ensureUserDetailModal();
    openUserDetailModal();
    const title = document.getElementById('userDetailTitle');
    const subtitle = document.getElementById('userDetailSubtitle');
    const body = document.getElementById('userDetailBody');
    if (title) title.textContent = 'Пользователь';
    if (subtitle) subtitle.textContent = 'Загрузка подробной информации...';
    if (body) {
        body.className = 'admin-detail-loading';
        body.innerHTML = 'Загрузка...';
    }

    try {
        const response = await fetch(`${API_URL}/auth/users/${encodeURIComponent(userId)}/detail`, {
            headers: { Authorization: token ? `Bearer ${token}` : '' }
        });
        if (!response.ok) throw new Error('Detail error');
        const payload = await response.json();
        renderUserDetail(payload);
    } catch (error) {
        if (subtitle) subtitle.textContent = 'Ошибка загрузки';
        if (body) body.innerHTML = 'Не удалось загрузить подробности пользователя.';
    }
}

async function freezeActiveUser() {
    if (!activeUserDetailId) return;
    const token = localStorage.getItem('token');
    const durationValue = Number(document.getElementById('freezeDurationValue')?.value || 1);
    const durationUnit = document.getElementById('freezeDurationUnit')?.value || 'hours';
    const reason = document.getElementById('freezeReason')?.value.trim() || 'Заморожен администратором';

    const response = await fetch(`${API_URL}/auth/users/${encodeURIComponent(activeUserDetailId)}/freeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ durationValue, durationUnit, reason })
    });
    if (!response.ok) {
        alert('Не удалось заморозить пользователя');
        return;
    }
    await loadUsers();
    await openUserDetail(activeUserDetailId);
}

async function unfreezeActiveUser() {
    if (!activeUserDetailId) return;
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/auth/users/${encodeURIComponent(activeUserDetailId)}/unfreeze`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' }
    });
    if (!response.ok) {
        alert('Не удалось разморозить пользователя');
        return;
    }
    await loadUsers();
    await openUserDetail(activeUserDetailId);
}

async function deleteActiveUser() {
    if (!activeUserDetailId) return;
    const ok = confirm('Удалить этот аккаунт? Действие нельзя отменить. Книги и комментарии не пропадут, но пользователь будет отвязан.');
    if (!ok) return;

    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/auth/users/${encodeURIComponent(activeUserDetailId)}`, {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' }
    });
    if (!response.ok) {
        alert('Не удалось удалить пользователя');
        return;
    }
    activeUserDetailId = null;
    closeUserDetailModal();
    await loadUsers();
    await loadRentals();
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
    tbody.innerHTML = '<tr><td colspan="8">Загрузка...</td></tr>';

    try {
        const response = await fetch(`${API_URL}/auth/users`, {
            headers: { Authorization: token ? `Bearer ${token}` : '' }
        });
        if (!response.ok) throw new Error('Forbidden');
        const payload = await response.json();
        const users = Array.isArray(payload) ? payload : (payload.users || []);
        const frozenCount = users.filter(isUserFrozen).length;
        if (summary) summary.textContent = `${users.length} аккаунтов · ${frozenCount} заморожено · нажмите на строку для управления`;
        tbody.innerHTML = users.map(user => `
            <tr class="user-row" data-user-id="${escapeHtml(user.id)}" tabindex="0" aria-label="Открыть карточку пользователя ${escapeHtml(user.username)}" aria-keyshortcuts="Enter Space" title="Открыть подробности пользователя">
                <td>${escapeHtml(user.id)}</td>
                <td><b>${escapeHtml(user.username)}</b><br><small>${Number(user.login_count || 0)} входов</small></td>
                <td>${escapeHtml(user.email || '—')}</td>
                <td><span class="admin-role-badge ${user.role === 'admin' ? 'admin' : ''}">${escapeHtml(user.role)}</span></td>
                <td>${formatUserStatus(user)}</td>
                <td>${escapeHtml(formatAdminDateTime(user.last_login_at))}</td>
                <td><b>${escapeHtml(user.last_login_ip || '—')}</b><br><small>${escapeHtml(formatDeviceShort(user))}</small></td>
                <td>${escapeHtml(formatAdminDate(user.created_at))}</td>
            </tr>
        `).join('') || '<tr><td colspan="8">Пользователей пока нет</td></tr>';
    } catch (error) {
        if (summary) summary.textContent = 'Нет доступа';
        tbody.innerHTML = '<tr><td colspan="8">Эта вкладка доступна только админу.</td></tr>';
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

    ensureUserDetailModal();
    const pill = document.getElementById('currentUserPill');
    if (pill) pill.textContent = `🛡️ Админ: ${session.username || 'admin'}`;
    document.getElementById('logoutBtn')?.addEventListener('click', event => {
        event.preventDefault();
        logout();
    });
    const menu = document.getElementById('navMenu');
    const menuBtn = document.getElementById('menuIcon');
    const setMobileMenuOpen = (open) => {
        if (!menu || !menuBtn) return;
        menu.classList.toggle('active', open);
        menuBtn.classList.toggle('active', open);
        menuBtn.setAttribute('aria-expanded', String(open));
        menuBtn.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
        document.body.classList.toggle('lock', open);
    };
    menuBtn?.addEventListener('click', () => setMobileMenuOpen(!menu?.classList.contains('active')));
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !menu?.classList.contains('active')) return;
        setMobileMenuOpen(false);
        menuBtn?.focus();
    });
    document.getElementById('refreshUsersBtn')?.addEventListener('click', loadUsers);
    document.getElementById('refreshRentalsBtn')?.addEventListener('click', loadRentals);
    document.getElementById('storageLocationForm')?.addEventListener('submit', addLocation);
    document.getElementById('adminUsersTableBody')?.addEventListener('click', event => {
        const row = event.target.closest('.user-row');
        if (row?.dataset.userId) openUserDetail(row.dataset.userId);
    });
    document.getElementById('adminUsersTableBody')?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const row = event.target.closest('.user-row');
        if (!row || event.target !== row || !row.dataset.userId) return;
        event.preventDefault();
        openUserDetail(row.dataset.userId);
    });
    document.getElementById('userDetailModal')?.addEventListener('click', event => {
        if (event.target.closest('#freezeUserBtn')) freezeActiveUser();
        if (event.target.closest('#unfreezeUserBtn')) unfreezeActiveUser();
        if (event.target.closest('#deleteUserBtn')) deleteActiveUser();
    });
    document.getElementById('adminRentalsTableBody')?.addEventListener('click', event => {
        const button = event.target.closest('.admin-return-btn');
        if (button) returnRental(button.dataset.book, button.dataset.rental);
    });
    loadUsers();
    loadLocations();
    loadRentals();
}

document.addEventListener('DOMContentLoaded', initAdminPage);
