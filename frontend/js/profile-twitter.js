(function () {
    'use strict';

    const SESSION_KEY = 'bibliotech_current_user';

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
        window.BibliotechProfileCustomize?.apply?.();
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
                    data-open-profile-customize aria-label="Открыть оформление профиля">
                <span class="profile-twitter-action-icon" aria-hidden="true">✎</span>
                <span class="profile-twitter-action-label">Оформление</span>
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
        setText(document.getElementById('profileLogoutBtn'), 'Выйти из аккаунта');
    }

    function organizeDynamicPanels() {
        const rentals = document.getElementById('profileRentalsPanel');
        if (rentals) rentals.dataset.profileSection = 'overview';
        window.BibliotechSettings?.adopt?.();
        window.BibliotechProfileCustomize?.ensure?.();
    }

    function setView() {
        const modal = getModal();
        if (!modal) return;
        modal.dataset.profileView = 'overview';
        modal.classList.remove('profile-customize-open', 'profile-settings-open');
        document.querySelectorAll('#profileModal .profile-view-tab').forEach(button => {
            button.classList.toggle('active', button.dataset.profileViewTarget === 'overview');
            button.setAttribute('aria-selected', String(button.dataset.profileViewTarget === 'overview'));
            button.tabIndex = button.dataset.profileViewTarget === 'overview' ? 0 : -1;
        });
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
        setView();
        modal.classList.add('active');
    }

    function openCustomize(trigger = null) {
        ensureModernStructure();
        getModal()?.classList.remove('active');
        const launch = () => window.BibliotechProfileCustomize?.open?.(trigger);
        if (window.BibliotechProfileCustomize?.open) launch();
        else setTimeout(launch, 0);
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
            const target = event.target.closest('.profile-view-tab[data-profile-view-target="overview"]');
            if (!target || !modal.contains(target)) return;
            event.preventDefault();
            setView();
        });

        if ('MutationObserver' in window) {
            let wasActive = modal.classList.contains('active');
            new MutationObserver(() => {
                const isActive = modal.classList.contains('active');
                if (isActive === wasActive) return;
                wasActive = isActive;

                if (isActive) {
                    setTimeout(() => {
                        ensureModernStructure();
                        setView();
                    }, 0);
                } else {
                    setView();
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
        setView();

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
