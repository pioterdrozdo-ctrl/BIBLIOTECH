(function () {
    'use strict';

    const SESSION_KEY = 'bibliotech_current_user';
    const VALID_VIEWS = new Set(['overview', 'customize', 'settings']);

    function getModal() {
        return document.getElementById('profileModal');
    }

    function getContent() {
        return document.querySelector('#profileModal .profile-modal-content');
    }

    function getSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
        catch { return null; }
    }

    function getRole() {
        const session = getSession();
        if (!session || session.guest) return 'guest';
        return session.role === 'admin' ? 'admin' : 'user';
    }

    function removeLegacyAndRedundantBlocks() {
        document.getElementById('profileTwitterStyles')?.remove();
        document.getElementById('profileCustomizeModal')?.remove();
        document.getElementById('profileSettingsModal')?.remove();

        // These blocks duplicated information already visible in the header or on the statistics page.
        document.querySelector('#profileModal .profile-access-panel')?.remove();
        document.querySelector('#profileModal .profile-grid')?.remove();
        document.getElementById('profileTwitterActions')?.remove();
        document.getElementById('profileViewTabs')?.remove();
    }

    function normalizeIdentity() {
        const identity = document.querySelector('#profileModal .profile-identity');
        const nameRow = document.querySelector('#profileModal .profile-name-row');
        const kicker = document.querySelector('#profileModal .profile-kicker');
        const badge = document.getElementById('profileModeBadge');
        const note = document.getElementById('profileRoleNote');
        if (!identity || !nameRow || !kicker) return;

        const session = getSession();
        const role = getRole();
        const rawName = session?.guest ? 'guest' : (session?.username || 'reader');
        const handle = '@' + String(rawName).trim().replace(/\s+/g, '_').toLowerCase();

        kicker.classList.add('profile-handle');
        kicker.textContent = handle;
        nameRow.insertAdjacentElement('afterend', kicker);

        const roleCopy = {
            admin: {
                badge: 'Администратор',
                note: 'Ведёт каталог BIBLIOTECH и отвечает за его содержание.'
            },
            user: {
                badge: 'Читатель',
                note: 'Читает, арендует книги и участвует в обсуждениях.'
            },
            guest: {
                badge: 'Гость',
                note: 'Просматривает каталог без сохранения личной истории.'
            }
        }[role];

        if (badge) {
            badge.textContent = roleCopy.badge;
            badge.dataset.profileRole = role;
            badge.classList.toggle('guest', role === 'guest');
            badge.classList.toggle('user', role === 'user');
            badge.classList.toggle('admin', role === 'admin');
        }
        if (note) note.textContent = roleCopy.note;

        getModal()?.setAttribute('data-profile-role', role);
    }

    function ensureHeaderAction() {
        const top = document.querySelector('#profileModal .profile-modal-top');
        if (!top) return;

        const actions = document.createElement('div');
        actions.className = 'profile-twitter-actions';
        actions.id = 'profileTwitterActions';
        actions.innerHTML = `
            <button class="profile-twitter-action" id="profileEditBtn" type="button"
                    data-profile-view-target="customize" aria-label="Изменить профиль" aria-expanded="false">
                <span class="profile-twitter-action-icon" aria-hidden="true">✎</span>
                <span class="profile-twitter-action-label">Изменить профиль</span>
            </button>
        `;
        top.appendChild(actions);
    }

    function ensureViewTabs() {
        const content = getContent();
        const top = document.querySelector('#profileModal .profile-modal-top');
        if (!content || !top) return;

        const role = getRole();
        const tabs = document.createElement('div');
        tabs.className = 'profile-view-tabs';
        tabs.id = 'profileViewTabs';
        tabs.dataset.tabCount = role === 'guest' ? '1' : '2';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Разделы профиля');
        tabs.innerHTML = `
            <button class="profile-view-tab" type="button" role="tab"
                    data-profile-view-target="overview" aria-selected="true">Моя библиотека</button>
            ${role === 'guest' ? '' : `
            <button class="profile-view-tab" type="button" role="tab"
                    data-profile-view-target="settings" aria-selected="false">Безопасность</button>`}
        `;
        top.insertAdjacentElement('afterend', tabs);
    }

    function refineSectionCopy() {
        const avatarTitle = document.querySelector('#profileModal .avatar-settings h3');
        const avatarDescription = document.querySelector('#profileModal .avatar-settings p');
        const themeTitle = document.querySelector('#profileModal .theme-settings h3');
        const themeDescription = document.querySelector('#profileModal .theme-settings p');
        const logout = document.getElementById('profileLogoutBtn');

        if (avatarTitle) avatarTitle.textContent = 'Фото профиля';
        if (avatarDescription) avatarDescription.textContent = 'Загрузите изображение или выберите один из готовых символов.';
        if (themeTitle) themeTitle.textContent = 'Цвет интерфейса';
        if (themeDescription) themeDescription.textContent = 'Выберите палитру. Кнопка солнца и луны меняет только её яркость.';
        if (logout) logout.textContent = 'Выйти из аккаунта';
    }

    function organizeDynamicPanels() {
        const content = getContent();
        const security = document.getElementById('profileSecurityPanel');
        const actions = document.querySelector('#profileModal .profile-actions');
        const rentals = document.getElementById('profileRentalsPanel');
        if (!content) return;

        if (rentals) rentals.dataset.profileSection = 'overview';
        if (security) security.dataset.profileSection = 'settings';
        if (actions) {
            actions.dataset.profileSection = 'settings';
            if (security && actions.previousElementSibling !== security) security.insertAdjacentElement('afterend', actions);
        }
    }

    function syncControls(view) {
        document.querySelectorAll('#profileModal [data-profile-view-target]').forEach(button => {
            const selected = button.dataset.profileViewTarget === view;
            button.classList.toggle('active', selected);

            if (button.classList.contains('profile-view-tab')) {
                button.setAttribute('aria-selected', String(selected));
                button.tabIndex = selected ? 0 : -1;
            } else {
                button.setAttribute('aria-expanded', String(selected));
                const label = button.querySelector('.profile-twitter-action-label');
                const icon = button.querySelector('.profile-twitter-action-icon');
                const editing = view === 'customize';
                if (label) label.textContent = editing ? 'Готово' : 'Изменить профиль';
                if (icon) icon.textContent = editing ? '✓' : '✎';
                button.setAttribute('aria-label', editing ? 'Завершить редактирование' : 'Изменить профиль');
            }
        });
    }

    function setView(nextView, options = {}) {
        const modal = getModal();
        if (!modal) return;

        const role = getRole();
        let view = VALID_VIEWS.has(nextView) ? nextView : 'overview';
        if (role === 'guest' && view === 'settings') view = 'overview';

        modal.dataset.profileView = view;
        modal.classList.toggle('profile-customize-open', view === 'customize');
        modal.classList.toggle('profile-settings-open', view === 'settings');
        syncControls(view);

        if (options.focusTab) {
            document.querySelector(`#profileModal .profile-view-tab[data-profile-view-target="${view}"]`)?.focus();
        }

        if (options.scroll !== false) {
            const content = getContent();
            const tabs = document.getElementById('profileViewTabs');
            if (content && tabs) {
                content.scrollTo({
                    top: Math.max(0, tabs.offsetTop - 2),
                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
                });
            }
        }
    }

    function refreshStructure() {
        normalizeIdentity();
        refineSectionCopy();
        organizeDynamicPanels();
    }

    function wireControls() {
        const modal = getModal();
        if (!modal || modal.dataset.twitterProfileReady === 'true') return;
        modal.dataset.twitterProfileReady = 'true';

        modal.addEventListener('click', event => {
            const target = event.target.closest('[data-profile-view-target]');
            if (!target || !modal.contains(target)) return;
            event.preventDefault();
            event.stopPropagation();

            const requested = target.dataset.profileViewTarget;
            const current = modal.dataset.profileView || 'overview';
            const next = requested === current && requested === 'customize' ? 'overview' : requested;
            setView(next);
        });

        const tabs = document.getElementById('profileViewTabs');
        tabs?.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const buttons = Array.from(tabs.querySelectorAll('.profile-view-tab'));
            if (!buttons.length) return;
            const currentIndex = Math.max(0, buttons.indexOf(document.activeElement));
            let nextIndex = currentIndex;

            if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % buttons.length;
            if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = buttons.length - 1;

            event.preventDefault();
            setView(buttons[nextIndex].dataset.profileViewTarget, { focusTab: true });
        });

        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !modal.classList.contains('active')) return;
            if ((modal.dataset.profileView || 'overview') === 'overview') return;
            event.preventDefault();
            event.stopPropagation();
            setView('overview');
        });

        if ('MutationObserver' in window) {
            new MutationObserver(mutations => {
                const classChanged = mutations.some(mutation => mutation.type === 'attributes');
                const childrenChanged = mutations.some(mutation => mutation.type === 'childList');
                if (childrenChanged) refreshStructure();
                if (classChanged && modal.classList.contains('active')) {
                    setTimeout(refreshStructure, 0);
                }
                if (classChanged && !modal.classList.contains('active')) {
                    setView('overview', { scroll: false });
                }
            }).observe(modal, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
        }
    }

    function init() {
        const modal = getModal();
        if (!modal) return;

        removeLegacyAndRedundantBlocks();
        ensureHeaderAction();
        ensureViewTabs();
        refreshStructure();
        wireControls();
        setView('overview', { scroll: false });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
