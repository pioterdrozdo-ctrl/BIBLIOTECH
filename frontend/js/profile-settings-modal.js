(function () {
    'use strict';

    const SESSION_KEY = 'bibliotech_current_user';
    const VALID_SECTIONS = new Set(['account', 'security']);
    let lastTrigger = null;

    function getSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
        catch { return null; }
    }

    function getRole() {
        const session = getSession();
        if (!session || session.guest) return 'guest';
        return session.role === 'admin' ? 'admin' : 'user';
    }

    function getRoleLabel(role) {
        return ({ admin: 'Администратор', user: 'Читатель', guest: 'Гость' })[role] || 'Читатель';
    }

    function getHandle(session) {
        const rawName = session?.guest ? 'guest' : (session?.username || 'reader');
        return '@' + String(rawName).trim().replace(/\s+/g, '_').toLowerCase();
    }

    function ensureModal() {
        let modal = document.getElementById('accountSettingsModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'accountSettingsModal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="account-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="accountSettingsTitle">
                <header class="account-settings-header">
                    <div class="account-settings-title-wrap">
                        <p class="account-settings-kicker">BIBLIOTECH</p>
                        <h2 id="accountSettingsTitle">Настройки</h2>
                        <p>Управление аккаунтом и защитой входа.</p>
                    </div>
                    <button class="account-settings-close" id="accountSettingsCloseBtn" type="button" aria-label="Закрыть настройки">×</button>
                </header>
                <div class="account-settings-layout">
                    <nav class="account-settings-nav" role="tablist" aria-label="Разделы настроек">
                        <button class="account-settings-nav-button active" type="button" role="tab"
                                data-settings-section="account" aria-selected="true" aria-controls="accountSettingsSectionAccount">
                            <span class="account-settings-nav-icon" aria-hidden="true">👤</span>
                            <span class="account-settings-nav-label"><b>Аккаунт</b><small>Профиль и выход</small></span>
                        </button>
                        <button class="account-settings-nav-button" type="button" role="tab"
                                data-settings-section="security" aria-selected="false" aria-controls="accountSettingsSectionSecurity">
                            <span class="account-settings-nav-icon" aria-hidden="true">🛡️</span>
                            <span class="account-settings-nav-label"><b>Безопасность</b><small>2FA и вход</small></span>
                        </button>
                    </nav>
                    <main class="account-settings-content">
                        <section class="account-settings-section active" id="accountSettingsSectionAccount"
                                 data-settings-panel="account" role="tabpanel">
                            <div class="account-settings-section-head">
                                <h3>Аккаунт</h3>
                                <p>Здесь собраны только действия, которые относятся к вашему аккаунту. Внешний вид профиля редактируется в самом профиле.</p>
                            </div>
                            <div class="account-settings-user-card">
                                <div class="account-settings-avatar" id="accountSettingsAvatar">👤</div>
                                <div class="account-settings-user-copy">
                                    <b id="accountSettingsName">Пользователь</b>
                                    <span id="accountSettingsHandle">@reader</span>
                                </div>
                                <span class="account-settings-role" id="accountSettingsRole">Читатель</span>
                            </div>
                            <div class="account-settings-list">
                                <div class="account-settings-row">
                                    <div class="account-settings-row-copy">
                                        <b>Оформление профиля</b>
                                        <span>Фото и палитра остаются в режиме редактирования профиля, чтобы не создавать одинаковые настройки в двух местах.</span>
                                    </div>
                                    <button class="account-settings-action" id="accountSettingsEditProfileBtn" type="button">✎ Изменить профиль</button>
                                </div>
                            </div>
                            <div class="account-settings-logout-slot" id="accountSettingsLogoutSlot"></div>
                        </section>
                        <section class="account-settings-section" id="accountSettingsSectionSecurity"
                                 data-settings-panel="security" role="tabpanel" hidden>
                            <div class="account-settings-section-head">
                                <h3>Безопасность</h3>
                                <p>Защита входа, двухфакторная аутентификация и сохранение текущей сессии на этом устройстве.</p>
                            </div>
                            <div id="accountSettingsSecurityMount"></div>
                        </section>
                    </main>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        wireModal(modal);
        adoptExistingControls();
        refreshAccount();
        return modal;
    }

    function adoptExistingControls() {
        const modal = document.getElementById('accountSettingsModal');
        if (!modal) return;

        const logoutSlot = document.getElementById('accountSettingsLogoutSlot');
        const actions = document.querySelector('#profileModal .profile-actions') || document.querySelector('#accountSettingsModal .profile-actions');
        if (logoutSlot && actions && actions.parentElement !== logoutSlot) logoutSlot.appendChild(actions);

        const securityMount = document.getElementById('accountSettingsSecurityMount');
        const securityPanel = document.getElementById('profileSecurityPanel');
        if (securityMount && securityPanel && securityPanel.parentElement !== securityMount) securityMount.appendChild(securityPanel);
    }

    function refreshAccount() {
        const modal = ensureModal();
        const session = getSession();
        const role = getRole();
        const name = session?.guest ? 'Гость' : (session?.username || 'Пользователь');
        const profileAvatar = document.getElementById('profileAvatar');
        const targetAvatar = document.getElementById('accountSettingsAvatar');

        if (targetAvatar) {
            if (profileAvatar?.innerHTML) targetAvatar.innerHTML = profileAvatar.innerHTML;
            else targetAvatar.textContent = role === 'admin' ? '🛡️' : role === 'guest' ? '👀' : '👤';
        }
        const nameEl = document.getElementById('accountSettingsName');
        const handleEl = document.getElementById('accountSettingsHandle');
        const roleEl = document.getElementById('accountSettingsRole');
        if (nameEl) nameEl.textContent = name;
        if (handleEl) handleEl.textContent = getHandle(session);
        if (roleEl) {
            roleEl.textContent = getRoleLabel(role);
            roleEl.dataset.accountRole = role;
        }

        const securityButton = modal.querySelector('[data-settings-section="security"]');
        if (securityButton) {
            securityButton.hidden = role === 'guest';
            securityButton.setAttribute('aria-hidden', String(role === 'guest'));
        }
        adoptExistingControls();
    }

    function setSection(requested, options = {}) {
        const modal = ensureModal();
        const role = getRole();
        let section = VALID_SECTIONS.has(requested) ? requested : 'account';
        if (role === 'guest' && section === 'security') section = 'account';

        modal.dataset.settingsSection = section;
        modal.querySelectorAll('[data-settings-section]').forEach(button => {
            const active = button.dataset.settingsSection === section;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
        });
        modal.querySelectorAll('[data-settings-panel]').forEach(panel => {
            const active = panel.dataset.settingsPanel === section;
            panel.classList.toggle('active', active);
            panel.hidden = !active;
        });

        if (section === 'security') window.BibliotechSecurity?.load?.();
        if (options.focusTab) modal.querySelector(`[data-settings-section="${section}"]`)?.focus();
    }

    function open(section = 'account', trigger = null) {
        const modal = ensureModal();
        lastTrigger = trigger || document.activeElement;
        refreshAccount();
        adoptExistingControls();
        document.getElementById('profileModal')?.classList.remove('active');
        setSection(section);
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('account-settings-open');
        document.dispatchEvent(new CustomEvent('bibliotech:settings-open', { detail: { section } }));
        setTimeout(() => document.getElementById('accountSettingsCloseBtn')?.focus(), 0);
    }

    function close(options = {}) {
        const modal = document.getElementById('accountSettingsModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('account-settings-open');
        if (options.restoreFocus !== false && lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true });
    }

    function openProfileEditor() {
        close({ restoreFocus: false });
        const launch = () => {
            if (window.BibliotechProfile?.openCustomize) {
                window.BibliotechProfile.openCustomize();
                return;
            }
            document.getElementById('currentUserPill')?.click();
            setTimeout(() => document.getElementById('profileEditBtn')?.click(), 0);
        };
        if (typeof queueMicrotask === 'function') queueMicrotask(launch);
        else Promise.resolve().then(launch);
    }

    function wireModal(modal) {
        if (modal.dataset.settingsReady === 'true') return;
        modal.dataset.settingsReady = 'true';

        const closeButton = modal.querySelector('#accountSettingsCloseBtn');
        closeButton?.addEventListener('click', event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            close();
        }, true);

        const editProfileButton = modal.querySelector('#accountSettingsEditProfileBtn');
        editProfileButton?.addEventListener('click', event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            openProfileEditor();
        }, true);

        modal.addEventListener('click', event => {
            if (event.target === modal) {
                event.preventDefault();
                close();
                return;
            }
            const sectionButton = event.target.closest('[data-settings-section]');
            if (sectionButton && modal.contains(sectionButton)) {
                event.preventDefault();
                setSection(sectionButton.dataset.settingsSection);
            }
        });

        modal.addEventListener('keydown', event => {
            const activeTab = event.target.closest?.('[data-settings-section]');
            if (!activeTab || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            const tabs = Array.from(modal.querySelectorAll('[data-settings-section]:not([hidden])'));
            if (!tabs.length) return;
            const currentIndex = Math.max(0, tabs.indexOf(activeTab));
            let nextIndex = currentIndex;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = tabs.length - 1;
            event.preventDefault();
            setSection(tabs[nextIndex].dataset.settingsSection, { focusTab: true });
        });
    }

    function init() {
        ensureModal();
        document.addEventListener('click', event => {
            const trigger = event.target.closest('#profileSettingsBtn, [data-open-account-settings]');
            if (!trigger || trigger.closest('#accountSettingsModal')) return;
            event.preventDefault();
            event.stopPropagation();
            open(trigger.dataset.settingsSection || 'account', trigger);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && document.getElementById('accountSettingsModal')?.classList.contains('active')) {
                event.preventDefault();
                event.stopPropagation();
                close();
            }
        });
        document.addEventListener('bibliotech:profile-avatar-change', refreshAccount);
    }

    window.BibliotechSettings = {
        ensure: ensureModal,
        open,
        close,
        setSection,
        refresh: refreshAccount,
        adopt: adoptExistingControls
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
