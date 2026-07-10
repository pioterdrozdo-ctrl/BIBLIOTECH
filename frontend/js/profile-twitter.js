(function () {
    'use strict';

    const SESSION_KEY = 'bibliotech_current_user';
    const VALID_VIEWS = new Set(['overview', 'customize']);

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

    function setText(element, value) {
        if (element && element.textContent !== value) element.textContent = value;
    }

    function removeDuplicateNodes(selector) {
        const nodes = Array.from(document.querySelectorAll(selector));
        nodes.slice(1).forEach(node => node.remove());
    }

    function removeLegacyAndRedundantBlocks() {
        document.getElementById('profileTwitterStyles')?.remove();
        document.getElementById('profileCustomizeModal')?.remove();
        document.getElementById('profileSettingsModal')?.remove();

        document.querySelector('#profileModal .profile-access-panel')?.remove();
        document.querySelector('#profileModal .profile-grid')?.remove();
        removeDuplicateNodes('#profileTwitterActions');
        removeDuplicateNodes('#profileViewTabs');
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
        setText(kicker, handle);
        if (nameRow.nextElementSibling !== kicker) nameRow.insertAdjacentElement('afterend', kicker);

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
            setText(badge, roleCopy.badge);
            badge.dataset.profileRole = role;
            badge.classList.toggle('guest', role === 'guest');
            badge.classList.toggle('user', role === 'user');
            badge.classList.toggle('admin', role === 'admin');
        }
        setText(note, roleCopy.note);
        getModal()?.setAttribute('data-profile-role', role);
    }

    function ensureHeaderActions() {
        const top = document.querySelector('#profileModal .profile-modal-top');
        if (!top) return;

        let actions = document.getElementById('profileTwitterActions');
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'profile-twitter-actions';
            actions.id = 'profileTwitterActions';
            top.appendChild(actions);
        }

        actions.innerHTML = `
            <button class="profile-twitter-action profile-edit-trigger" id="profileEditBtn" type="button"
                    data-profile-view-target="customize" aria-label="Изменить профиль" aria-expanded="false">
                <span class="profile-twitter-action-icon" aria-hidden="true">✎</span>
                <span class="profile-twitter-action-label">Изменить</span>
            </button>
            <button class="profile-twitter-action profile-settings-trigger" id="profileSettingsBtn" type="button"
                    data-open-account-settings data-settings-section="account" aria-label="Открыть настройки">
                <span class="profile-twitter-action-icon" aria-hidden="true">⚙</span>
                <span class="profile-twitter-action-label">Настройки</span>
            </button>
        `;
    }

    function ensureViewTabs() {
        const content = getContent();
        const top = document.querySelector('#profileModal .profile-modal-top');
        if (!content || !top) return;

        let tabs = document.getElementById('profileViewTabs');
        if (!tabs) {
            tabs = document.createElement('div');
            tabs.className = 'profile-view-tabs';
            tabs.id = 'profileViewTabs';
            top.insertAdjacentElement('afterend', tabs);
        }
        tabs.dataset.tabCount = '1';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Раздел профиля');
        tabs.innerHTML = `
            <button class="profile-view-tab active" type="button" role="tab"
                    data-profile-view-target="overview" aria-selected="true">Моя библиотека</button>
        `;
    }

    function refineSectionCopy() {
        setText(document.querySelector('#profileModal .avatar-settings h3'), 'Фото профиля');
        setText(document.querySelector('#profileModal .avatar-settings p'), 'Загрузите изображение или выберите один из готовых символов.');
        setText(document.querySelector('#profileModal .theme-settings h3'), 'Цвет интерфейса');
        setText(document.querySelector('#profileModal .theme-settings p'), 'Выберите палитру. Кнопка солнца и луны меняет только её яркость.');
        setText(document.getElementById('profileLogoutBtn'), 'Выйти из аккаунта');
    }

    function organizeDynamicPanels() {
        const rentals = document.getElementById('profileRentalsPanel');
        if (rentals) rentals.dataset.profileSection = 'overview';
        window.BibliotechSettings?.adopt?.();
    }

    function syncControls(view) {
        document.querySelectorAll('#profileModal [data-profile-view-target]').forEach(button => {
            const selected = button.dataset.profileViewTarget === view;
            button.classList.toggle('active', selected);

            if (button.classList.contains('profile-view-tab')) {
                button.setAttribute('aria-selected', String(selected));
                button.tabIndex = selected ? 0 : -1;
                return;
            }

            button.setAttribute('aria-expanded', String(selected));
            const label = button.querySelector('.profile-twitter-action-label');
            const icon = button.querySelector('.profile-twitter-action-icon');
            const editing = view === 'customize';
            setText(label, editing ? 'Готово' : 'Изменить');
            setText(icon, editing ? '✓' : '✎');
            button.setAttribute('aria-label', editing ? 'Завершить редактирование' : 'Изменить профиль');
        });
    }

    function setView(nextView, options = {}) {
        const modal = getModal();
        if (!modal) return;

        const view = VALID_VIEWS.has(nextView) ? nextView : 'overview';
        modal.dataset.profileView = view;
        modal.classList.toggle('profile-customize-open', view === 'customize');
        modal.classList.remove('profile-settings-open');
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

    function ensureModernStructure() {
        removeLegacyAndRedundantBlocks();
        ensureHeaderActions();
        ensureViewTabs();
        refreshStructure();
        const modal = getModal();
        if (modal) modal.dataset.profileIteration = 'evolved';
    }

    function openOverview() {
        const modal = getModal();
        if (!modal) return;
        ensureModernStructure();
        setView('overview', { scroll: false });
        modal.classList.add('active');
    }

    function openCustomize() {
        const modal = getModal();
        if (!modal) return;
        ensureModernStructure();
        modal.classList.add('active');
        setView('customize', { scroll: false });
    }

    function repairAfterLegacyOpen() {
        const repair = () => openOverview();
        if (typeof queueMicrotask === 'function') queueMicrotask(repair);
        else Promise.resolve().then(repair);
    }

    function wireProfileEntry() {
        const pill = document.getElementById('currentUserPill');
        if (!pill || pill.dataset.evolvedProfileEntryReady === 'true') return;
        pill.dataset.evolvedProfileEntryReady = 'true';
        pill.addEventListener('click', repairAfterLegacyOpen);
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

        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !modal.classList.contains('active')) return;
            if ((modal.dataset.profileView || 'overview') === 'overview') return;
            event.preventDefault();
            event.stopPropagation();
            setView('overview');
        });

        if ('MutationObserver' in window) {
            new MutationObserver(() => {
                if (modal.classList.contains('active')) {
                    setTimeout(() => {
                        ensureModernStructure();
                        const current = VALID_VIEWS.has(modal.dataset.profileView) ? modal.dataset.profileView : 'overview';
                        setView(current, { scroll: false });
                    }, 0);
                } else {
                    setView('overview', { scroll: false });
                }
            }).observe(modal, { attributes: true, attributeFilter: ['class'] });
        }
    }

    function init() {
        const modal = getModal();
        if (!modal) return;

        ensureModernStructure();
        wireControls();
        wireProfileEntry();
        setView('overview', { scroll: false });

        setTimeout(ensureModernStructure, 120);
        setTimeout(ensureModernStructure, 420);

        window.BibliotechProfile = {
            ensure: ensureModernStructure,
            open: openOverview,
            openOverview,
            openCustomize,
            setView
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
