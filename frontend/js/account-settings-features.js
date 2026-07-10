(function () {
    'use strict';

    const API_URL = window.BIBLIOTECH_API_URL || '/api';
    const SECTION_LOADERS = new Map();
    const VALID_SECTIONS = new Set(['account', 'security', 'devices', 'notifications', 'privacy', 'library', 'data']);
    let accountSnapshot = null;
    let libraryItems = [];
    let activeLibraryTab = 'favorites';
    let lastBookId = null;
    let enhanced = false;

    function token() {
        return localStorage.getItem('token') || '';
    }

    function headers(json = true) {
        return {
            ...(json ? { 'Content-Type': 'application/json' } : {}),
            Authorization: token() ? `Bearer ${token()}` : ''
        };
    }

    async function api(path, options = {}) {
        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: { ...headers(options.body !== undefined), ...(options.headers || {}) }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (payload.code === 'SESSION_EXPIRED') {
                localStorage.removeItem('token');
                localStorage.removeItem('bibliotech_current_user');
                window.location.href = 'index.html';
            }
            throw new Error(payload.error || payload.message || 'Ошибка запроса');
        }
        return payload;
    }

    function escapeHtml(value = '') {
        return String(value).replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[char]);
    }

    function formatDate(value, withTime = true) {
        if (!value) return 'Неизвестно';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Неизвестно';
        return new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit', month: 'short', year: 'numeric',
            ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
        }).format(date);
    }

    function notify(message, type = 'info') {
        if (typeof window.notify === 'function') window.notify(message, type);
        else console[type === 'error' ? 'error' : 'log'](message);
    }

    function sectionTemplate(id, title, description, content) {
        return `
            <section class="account-settings-section" id="accountSettingsSection${id}"
                     data-settings-panel="${id.toLowerCase()}" role="tabpanel" hidden>
                <div class="account-settings-section-head">
                    <h3>${title}</h3>
                    <p>${description}</p>
                </div>
                ${content}
            </section>`;
    }

    function navButton(section, icon, title, subtitle) {
        return `
            <button class="account-settings-nav-button" type="button" role="tab"
                    data-settings-section="${section}" aria-selected="false"
                    aria-controls="accountSettingsSection${section[0].toUpperCase()}${section.slice(1)}">
                <span class="account-settings-nav-icon" aria-hidden="true">${icon}</span>
                <span class="account-settings-nav-label"><b>${title}</b><small>${subtitle}</small></span>
            </button>`;
    }

    function buildExtraSections(modal) {
        const nav = modal.querySelector('.account-settings-nav');
        const content = modal.querySelector('.account-settings-content');
        if (!nav || !content || modal.dataset.completeSettingsReady === 'true') return;
        modal.dataset.completeSettingsReady = 'true';

        nav.insertAdjacentHTML('beforeend', [
            navButton('devices', '💻', 'Устройства', 'Входы и сеансы'),
            navButton('notifications', '🔔', 'Уведомления', 'Книги и входы'),
            navButton('privacy', '🔒', 'Приватность', 'Что видно другим'),
            navButton('library', '⭐', 'Моя библиотека', 'Избранное и история'),
            navButton('data', '🗂️', 'Данные', 'Экспорт и удаление')
        ].join(''));

        content.insertAdjacentHTML('beforeend', [
            sectionTemplate('Devices', 'Устройства и входы', 'История последних входов и безопасное завершение всех остальных сеансов.', `
                <div class="account-feature-toolbar">
                    <span class="account-feature-status" id="accountDevicesStatus">Загрузка…</span>
                    <button class="account-settings-action danger-soft" id="logoutOtherDevicesBtn" type="button">Выйти на других устройствах</button>
                </div>
                <div class="account-feature-list" id="accountDevicesList"></div>`),
            sectionTemplate('Notifications', 'Уведомления', 'Напоминания о возврате, доступности книг и новых входах в аккаунт.', `
                <div class="account-toggle-list" id="accountNotificationPreferences"></div>
                <div class="account-feature-toolbar notification-toolbar">
                    <b>Центр уведомлений</b>
                    <button class="account-settings-action" id="markAllNotificationsReadBtn" type="button">Прочитать все</button>
                </div>
                <div class="account-feature-list" id="accountNotificationsList"></div>`),
            sectionTemplate('Privacy', 'Приватность', 'Настройте публичность профиля, истории чтения и комментариев.', `
                <div class="account-toggle-list" id="accountPrivacyPreferences"></div>
                <div class="account-feature-note">Настройки применяются к публичному API профиля и будущим страницам читателей.</div>`),
            sectionTemplate('Library', 'Моя библиотека', 'Избранные книги, список «Хочу прочитать» и недавно просмотренные карточки.', `
                <div class="account-library-tabs" role="tablist">
                    <button class="active" data-library-tab="favorites" type="button">⭐ Избранное</button>
                    <button data-library-tab="wishlist" type="button">🔖 Хочу прочитать</button>
                    <button data-library-tab="history" type="button">🕘 История</button>
                </div>
                <div class="account-library-list" id="accountLibraryList"></div>`),
            sectionTemplate('Data', 'Ваши данные', 'Скачайте копию данных или безвозвратно удалите аккаунт.', `
                <div class="account-data-card">
                    <div><b>Экспорт данных</b><span>Профиль, аренды, комментарии, списки книг, уведомления и история входов.</span></div>
                    <button class="account-settings-action" id="exportAccountDataBtn" type="button">Скачать JSON</button>
                </div>
                <div class="account-data-card danger-zone">
                    <div><b>Удаление аккаунта</b><span>Действие необратимо. Комментарии останутся с подписью «Удалённый пользователь».</span></div>
                    <div class="account-danger-form">
                        <input id="deleteAccountPassword" type="password" autocomplete="current-password" placeholder="Текущий пароль">
                        <button class="account-settings-action danger" id="deleteAccountBtn" type="button">Удалить аккаунт</button>
                    </div>
                </div>`)
        ].join(''));

        const accountList = modal.querySelector('#accountSettingsSectionAccount .account-settings-list');
        accountList?.insertAdjacentHTML('beforeend', `
            <div class="account-password-card">
                <div class="account-settings-row-copy">
                    <b>Сменить пароль</b>
                    <span>После смены пароля все остальные устройства будут отключены.</span>
                </div>
                <form id="changeAccountPasswordForm" class="account-password-form">
                    <input id="currentAccountPassword" type="password" autocomplete="current-password" placeholder="Текущий пароль" required>
                    <input id="newAccountPassword" type="password" autocomplete="new-password" placeholder="Новый пароль: минимум 8 символов и цифра" required>
                    <input id="confirmAccountPassword" type="password" autocomplete="new-password" placeholder="Повторите новый пароль" required>
                    <div class="password-strength" id="accountPasswordStrength" aria-live="polite"></div>
                    <button class="account-settings-action" type="submit">Изменить пароль</button>
                </form>
            </div>`);
    }

    function updateSettingsBadge(unread = 0) {
        const button = document.getElementById('profileSettingsBtn');
        if (!button) return;
        button.dataset.notificationCount = unread > 0 ? String(Math.min(99, unread)) : '';
        button.classList.toggle('has-notifications', unread > 0);
        button.title = unread > 0 ? `Настройки · ${unread} непрочитанных` : 'Настройки';
    }

    async function loadAccountSnapshot(force = false) {
        if (accountSnapshot && !force) return accountSnapshot;
        accountSnapshot = await api('/account');
        return accountSnapshot;
    }

    function toggleRow(id, title, description, checked) {
        return `
            <label class="account-toggle-row" for="${id}">
                <span><b>${title}</b><small>${description}</small></span>
                <input id="${id}" type="checkbox" ${checked ? 'checked' : ''}>
                <i aria-hidden="true"></i>
            </label>`;
    }

    async function loadDevices() {
        const list = document.getElementById('accountDevicesList');
        const status = document.getElementById('accountDevicesStatus');
        if (!list) return;
        list.innerHTML = '<div class="account-loading">Загрузка устройств…</div>';
        try {
            const data = await api('/account/devices');
            status.textContent = `${data.devices.length} записей о входах`;
            list.innerHTML = data.devices.length ? data.devices.map(device => `
                <article class="account-device-card ${device.current ? 'current' : ''}">
                    <span class="account-device-icon">${device.platform === 'Mobile' ? '📱' : device.platform === 'Tablet' ? '▤' : '💻'}</span>
                    <div><b>${escapeHtml(device.browser || 'Браузер')} · ${escapeHtml(device.os || 'Неизвестная ОС')}</b>
                    <small>${escapeHtml(device.device || device.platform || 'Устройство')} · IP ${escapeHtml(device.ip_address || 'не определён')}</small>
                    <time>${formatDate(device.created_at)}</time></div>
                    ${device.current ? '<span class="current-device-badge">Вы здесь</span>' : ''}
                </article>`).join('') : '<div class="account-empty">История входов пока пуста.</div>';
        } catch (error) {
            list.innerHTML = `<div class="account-error">${escapeHtml(error.message)}</div>`;
        }
    }

    async function loadNotifications() {
        const prefsBox = document.getElementById('accountNotificationPreferences');
        const list = document.getElementById('accountNotificationsList');
        if (!prefsBox || !list) return;
        try {
            const [snapshot, data] = await Promise.all([loadAccountSnapshot(true), api('/account/notifications')]);
            const prefs = snapshot.notifications || {};
            prefsBox.innerHTML = [
                toggleRow('notifyDueToggle', 'Скорый возврат', 'Напомнить за три дня до срока.', prefs.due),
                toggleRow('notifyOverdueToggle', 'Просроченная аренда', 'Предупредить, если срок уже истёк.', prefs.overdue),
                toggleRow('notifyAvailableToggle', 'Книга снова доступна', 'Сообщить о книге из списка «Хочу прочитать».', prefs.available),
                toggleRow('notifyLoginToggle', 'Новые входы', 'Показывать уведомления о входах в аккаунт.', prefs.login)
            ].join('');
            list.innerHTML = data.notifications.length ? data.notifications.map(item => `
                <button class="account-notification-card ${item.read_at ? '' : 'unread'}" type="button" data-notification-id="${item.id}">
                    <span class="account-notification-icon">${({ due: '⏳', overdue: '⚠️', available: '📚', login: '🔐' })[item.type] || '🔔'}</span>
                    <span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.message)}</small><time>${formatDate(item.created_at)}</time></span>
                </button>`).join('') : '<div class="account-empty">Новых уведомлений нет.</div>';
            updateSettingsBadge(data.unread || 0);
        } catch (error) {
            list.innerHTML = `<div class="account-error">${escapeHtml(error.message)}</div>`;
        }
    }

    async function saveNotificationPreferences() {
        const prefs = {
            due: document.getElementById('notifyDueToggle')?.checked ?? true,
            overdue: document.getElementById('notifyOverdueToggle')?.checked ?? true,
            available: document.getElementById('notifyAvailableToggle')?.checked ?? true,
            login: document.getElementById('notifyLoginToggle')?.checked ?? false
        };
        try {
            const saved = await api('/account/notifications/preferences', { method: 'POST', body: JSON.stringify(prefs) });
            if (accountSnapshot) accountSnapshot.notifications = saved;
            notify('Настройки уведомлений сохранены', 'success');
            await loadNotifications();
        } catch (error) {
            notify(error.message, 'error');
        }
    }

    async function loadPrivacy() {
        const box = document.getElementById('accountPrivacyPreferences');
        if (!box) return;
        try {
            const snapshot = await loadAccountSnapshot(true);
            const prefs = snapshot.privacy || {};
            box.innerHTML = [
                toggleRow('privateProfileToggleReal', 'Закрытый профиль', 'Публичная страница профиля не будет доступна.', prefs.privateProfile),
                toggleRow('privateHistoryToggle', 'Скрывать историю чтения', 'Не показывать избранное, список желаний и просмотренные книги.', prefs.privateHistory),
                toggleRow('showCommentsToggle', 'Показывать комментарии', 'Разрешить отображение ваших комментариев в публичном профиле.', prefs.showComments)
            ].join('');
        } catch (error) {
            box.innerHTML = `<div class="account-error">${escapeHtml(error.message)}</div>`;
        }
    }

    async function savePrivacy() {
        const prefs = {
            privateProfile: Boolean(document.getElementById('privateProfileToggleReal')?.checked),
            privateHistory: Boolean(document.getElementById('privateHistoryToggle')?.checked),
            showComments: document.getElementById('showCommentsToggle')?.checked !== false
        };
        try {
            const saved = await api('/account/privacy', { method: 'POST', body: JSON.stringify(prefs) });
            if (accountSnapshot) accountSnapshot.privacy = saved;
            notify('Настройки приватности сохранены', 'success');
        } catch (error) {
            notify(error.message, 'error');
        }
    }

    async function loadLibrary(force = true) {
        const list = document.getElementById('accountLibraryList');
        if (!list) return;
        try {
            if (force || !libraryItems.length) libraryItems = (await api('/account/library')).items || [];
            renderLibrary();
            syncBookActions();
        } catch (error) {
            list.innerHTML = `<div class="account-error">${escapeHtml(error.message)}</div>`;
        }
    }

    function renderLibrary() {
        const list = document.getElementById('accountLibraryList');
        if (!list) return;
        const filtered = libraryItems.filter(item => {
            if (activeLibraryTab === 'favorites') return item.favorite;
            if (activeLibraryTab === 'wishlist') return item.wishlist;
            return Boolean(item.viewed_at);
        });
        list.innerHTML = filtered.length ? filtered.map(item => `
            <article class="account-library-card" data-book-id="${item.book_id || item.id}">
                <div class="account-library-cover">${item.cover_data_url || item.coverDataURL ? `<img src="${escapeHtml(item.cover_data_url || item.coverDataURL)}" alt="">` : '📖'}</div>
                <div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.author || 'Автор не указан')}</small>
                <span>${activeLibraryTab === 'history' ? `Просмотрено: ${formatDate(item.viewed_at)}` : Number(item.copies || 0) > 0 ? 'В наличии' : 'Нет свободных копий'}</span></div>
                <div class="account-library-actions">
                    <button type="button" data-library-action="favorite" title="Избранное">${item.favorite ? '★' : '☆'}</button>
                    <button type="button" data-library-action="wishlist" title="Хочу прочитать">${item.wishlist ? '🔖' : '＋'}</button>
                </div>
            </article>`).join('') : `<div class="account-empty">${activeLibraryTab === 'favorites' ? 'В избранном пока нет книг.' : activeLibraryTab === 'wishlist' ? 'Список «Хочу прочитать» пуст.' : 'История просмотров пока пуста.'}</div>`;
    }

    function currentLibraryItem(bookId) {
        return libraryItems.find(item => Number(item.book_id || item.id) === Number(bookId));
    }

    async function updateBookList(bookId, patch) {
        const current = currentLibraryItem(bookId) || { book_id: Number(bookId), favorite: false, wishlist: false };
        const values = {
            favorite: patch.favorite ?? Boolean(current.favorite),
            wishlist: patch.wishlist ?? Boolean(current.wishlist)
        };
        const data = await api(`/account/library/${bookId}`, { method: 'PUT', body: JSON.stringify(values) });
        const index = libraryItems.findIndex(item => Number(item.book_id || item.id) === Number(bookId));
        const merged = { ...current, ...(data.item || {}), ...values, book_id: Number(bookId) };
        if (index >= 0) libraryItems[index] = merged;
        else libraryItems.unshift(merged);
        renderLibrary();
        syncBookActions();
        return merged;
    }

    function ensureBookActions() {
        const modal = document.getElementById('viewModal');
        if (!modal || document.getElementById('personalBookActions')) return;
        const anchor = modal.querySelector('.book-placement-rental') || modal.querySelector('.view-meta');
        if (!anchor) return;
        const box = document.createElement('div');
        box.className = 'personal-book-actions';
        box.id = 'personalBookActions';
        box.innerHTML = `
            <button type="button" id="favoriteBookBtn"><span>☆</span> В избранное</button>
            <button type="button" id="wishlistBookBtn"><span>＋</span> Хочу прочитать</button>`;
        anchor.insertAdjacentElement('afterend', box);
    }

    function resolveOpenBookId() {
        const modal = document.getElementById('viewModal');
        const direct = Number(modal?.dataset.bookId || lastBookId || 0);
        if (direct) return direct;
        const title = document.getElementById('viewTitle')?.textContent?.trim();
        const author = document.getElementById('viewAuthorValue')?.textContent?.trim();
        const match = libraryItems.find(item => item.title === title && (!author || item.author === author));
        return Number(match?.book_id || match?.id || 0) || null;
    }

    function syncBookActions() {
        ensureBookActions();
        const bookId = resolveOpenBookId();
        const favorite = document.getElementById('favoriteBookBtn');
        const wishlist = document.getElementById('wishlistBookBtn');
        if (!favorite || !wishlist) return;
        const item = currentLibraryItem(bookId) || {};
        favorite.classList.toggle('active', Boolean(item.favorite));
        favorite.innerHTML = `<span>${item.favorite ? '★' : '☆'}</span> ${item.favorite ? 'В избранном' : 'В избранное'}`;
        wishlist.classList.toggle('active', Boolean(item.wishlist));
        wishlist.innerHTML = `<span>${item.wishlist ? '🔖' : '＋'}</span> ${item.wishlist ? 'Хочу прочитать' : 'Хочу прочитать'}`;
    }

    async function recordBookView() {
        const bookId = resolveOpenBookId();
        if (!bookId || !token()) return;
        try {
            await api(`/account/library/${bookId}/viewed`, { method: 'POST', body: '{}' });
            const current = currentLibraryItem(bookId);
            if (current) current.viewed_at = new Date().toISOString();
        } catch (error) {
            console.warn('[BIBLIOTECH] view history failed:', error.message);
        }
    }

    function setSection(section, options = {}) {
        const modal = document.getElementById('accountSettingsModal');
        if (!modal) return;
        const target = VALID_SECTIONS.has(section) ? section : 'account';
        modal.dataset.settingsSection = target;
        modal.querySelectorAll('[data-settings-section]').forEach(button => {
            const active = button.dataset.settingsSection === target;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
        });
        modal.querySelectorAll('[data-settings-panel]').forEach(panel => {
            const active = panel.dataset.settingsPanel === target;
            panel.classList.toggle('active', active);
            panel.hidden = !active;
        });
        if (target === 'security') window.BibliotechSecurity?.load?.();
        SECTION_LOADERS.get(target)?.();
        if (options.focusTab) modal.querySelector(`[data-settings-section="${target}"]`)?.focus();
    }

    function patchSettingsController(modal) {
        const settings = window.BibliotechSettings;
        if (!settings || settings.__completeFeaturesReady) return;
        settings.__completeFeaturesReady = true;
        const originalOpen = settings.open.bind(settings);
        settings.open = function (section = 'account', trigger = null) {
            originalOpen('account', trigger);
            setSection(section);
        };
        settings.setSection = setSection;

        modal.addEventListener('click', event => {
            const button = event.target.closest('[data-settings-section]');
            if (!button || !modal.contains(button)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            setSection(button.dataset.settingsSection);
        }, true);
    }

    function wireFeatureEvents(modal) {
        modal.addEventListener('change', event => {
            if (event.target.closest('#accountNotificationPreferences')) saveNotificationPreferences();
            if (event.target.closest('#accountPrivacyPreferences')) savePrivacy();
        });

        modal.addEventListener('click', async event => {
            const tab = event.target.closest('[data-library-tab]');
            if (tab) {
                activeLibraryTab = tab.dataset.libraryTab;
                modal.querySelectorAll('[data-library-tab]').forEach(button => button.classList.toggle('active', button === tab));
                renderLibrary();
                return;
            }
            const libraryAction = event.target.closest('[data-library-action]');
            if (libraryAction) {
                const card = libraryAction.closest('[data-book-id]');
                const bookId = Number(card?.dataset.bookId);
                const current = currentLibraryItem(bookId) || {};
                try {
                    await updateBookList(bookId, libraryAction.dataset.libraryAction === 'favorite'
                        ? { favorite: !current.favorite }
                        : { wishlist: !current.wishlist });
                } catch (error) { notify(error.message, 'error'); }
                return;
            }
            if (event.target.closest('#logoutOtherDevicesBtn')) {
                if (!confirm('Завершить все остальные сеансы? На этом устройстве вход сохранится.')) return;
                try {
                    const data = await api('/account/devices/logout-others', { method: 'POST', body: '{}' });
                    if (data.token) localStorage.setItem('token', data.token);
                    notify(data.message || 'Другие устройства отключены', 'success');
                    loadDevices();
                } catch (error) { notify(error.message, 'error'); }
                return;
            }
            if (event.target.closest('#markAllNotificationsReadBtn')) {
                await api('/account/notifications/read-all', { method: 'POST', body: '{}' }).catch(error => notify(error.message, 'error'));
                loadNotifications();
                return;
            }
            const notification = event.target.closest('[data-notification-id]');
            if (notification) {
                await api(`/account/notifications/${notification.dataset.notificationId}/read`, { method: 'POST', body: '{}' }).catch(() => null);
                notification.classList.remove('unread');
                loadNotifications();
                return;
            }
            if (event.target.closest('#exportAccountDataBtn')) {
                try {
                    const data = await api('/account/export');
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `bibliotech-data-${new Date().toISOString().slice(0, 10)}.json`;
                    link.click();
                    URL.revokeObjectURL(url);
                    notify('Копия данных подготовлена', 'success');
                } catch (error) { notify(error.message, 'error'); }
                return;
            }
            if (event.target.closest('#deleteAccountBtn')) {
                const password = document.getElementById('deleteAccountPassword')?.value || '';
                if (!password) return notify('Введите текущий пароль', 'error');
                if (!confirm('Удалить аккаунт без возможности восстановления?')) return;
                try {
                    await api('/account', { method: 'DELETE', body: JSON.stringify({ password }) });
                    localStorage.clear();
                    window.location.href = 'index.html';
                } catch (error) { notify(error.message, 'error'); }
            }
        });

        modal.querySelector('#changeAccountPasswordForm')?.addEventListener('submit', async event => {
            event.preventDefault();
            const currentPassword = document.getElementById('currentAccountPassword')?.value || '';
            const newPassword = document.getElementById('newAccountPassword')?.value || '';
            const confirmPassword = document.getElementById('confirmAccountPassword')?.value || '';
            if (newPassword !== confirmPassword) return notify('Новые пароли не совпадают', 'error');
            try {
                const data = await api('/account/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
                if (data.token) localStorage.setItem('token', data.token);
                event.currentTarget.reset();
                document.getElementById('accountPasswordStrength').textContent = '';
                notify(data.message || 'Пароль изменён', 'success');
            } catch (error) { notify(error.message, 'error'); }
        });

        modal.querySelector('#newAccountPassword')?.addEventListener('input', event => {
            const value = event.target.value;
            const score = [value.length >= 8, /\d/.test(value), /[A-ZА-Я]/.test(value), /[^\wа-яА-Я]/.test(value)].filter(Boolean).length;
            const output = document.getElementById('accountPasswordStrength');
            if (!output) return;
            output.dataset.score = String(score);
            output.textContent = value ? ['Слишком слабый', 'Слабый', 'Нормальный', 'Надёжный', 'Очень надёжный'][score] : '';
        });
    }

    function wireBookDetail() {
        document.addEventListener('click', async event => {
            const card = event.target.closest('.book-card[data-id]');
            if (card) lastBookId = Number(card.dataset.id);
            const favorite = event.target.closest('#favoriteBookBtn');
            const wishlist = event.target.closest('#wishlistBookBtn');
            if (!favorite && !wishlist) return;
            const bookId = resolveOpenBookId();
            if (!bookId) return notify('Не удалось определить книгу', 'error');
            const current = currentLibraryItem(bookId) || {};
            try {
                await updateBookList(bookId, favorite ? { favorite: !current.favorite } : { wishlist: !current.wishlist });
                notify(favorite ? 'Избранное обновлено' : 'Список «Хочу прочитать» обновлён', 'success');
            } catch (error) { notify(error.message, 'error'); }
        });

        const viewModal = document.getElementById('viewModal');
        if (viewModal && 'MutationObserver' in window) {
            let wasActive = viewModal.classList.contains('active');
            new MutationObserver(() => {
                const active = viewModal.classList.contains('active');
                if (active === wasActive) return;
                wasActive = active;
                if (active) {
                    setTimeout(async () => {
                        ensureBookActions();
                        if (!libraryItems.length) await loadLibrary(false).catch(() => null);
                        syncBookActions();
                        recordBookView();
                    }, 0);
                }
            }).observe(viewModal, { attributes: true, attributeFilter: ['class'] });
        }
    }

    function init() {
        if (enhanced) return;
        const settings = window.BibliotechSettings;
        const modal = settings?.ensure?.();
        if (!modal) return setTimeout(init, 80);
        enhanced = true;
        buildExtraSections(modal);
        patchSettingsController(modal);

        SECTION_LOADERS.set('account', () => loadAccountSnapshot(true).catch(() => null));
        SECTION_LOADERS.set('devices', loadDevices);
        SECTION_LOADERS.set('notifications', loadNotifications);
        SECTION_LOADERS.set('privacy', loadPrivacy);
        SECTION_LOADERS.set('library', () => loadLibrary(true));

        wireFeatureEvents(modal);
        wireBookDetail();
        loadNotifications().catch(() => null);
    }

    window.BibliotechAccountFeatures = {
        setSection,
        loadNotifications,
        loadLibrary,
        syncBookActions
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
