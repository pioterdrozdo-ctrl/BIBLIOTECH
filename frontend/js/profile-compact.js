(function () {
    const PROFILE_SETTINGS_TABS = {
        customize: { icon: '🎨', title: 'Кастомизация', subtitle: 'Аватар и оформление' },
        security: { icon: '⚙️', title: 'Настройки', subtitle: 'Безопасность аккаунта' }
    };

    function injectStyles() {
        if (document.getElementById('profileCompactStyles')) return;
        const style = document.createElement('style');
        style.id = 'profileCompactStyles';
        style.textContent = `
            #adminPanel {
                display: none !important;
            }

            #profileModal .profile-access-panel,
            #profileModal .profile-grid,
            #profileCompactHeading {
                display: none !important;
            }

            #profileModal .profile-mode-badge {
                background: var(--accent-soft) !important;
                color: var(--accent) !important;
            }

            #profileModal .profile-role-note {
                color: var(--muted);
            }

            .profile-quick-actions {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
                margin: 14px 0 4px;
            }

            .profile-quick-action {
                min-height: 54px;
                display: grid;
                grid-template-columns: 38px minmax(0, 1fr);
                gap: 10px;
                align-items: center;
                padding: 10px 12px;
                border: 1px solid var(--border);
                border-radius: var(--radius);
                background: var(--surface);
                color: var(--text);
                cursor: pointer;
                text-align: left;
                box-shadow: var(--shadow-soft);
                transition: transform .16s ease, border-color .16s ease, background .16s ease;
            }

            .profile-quick-action:hover {
                transform: translateY(-1px);
                border-color: color-mix(in srgb, var(--accent) 52%, var(--border));
                background: var(--surface-muted);
            }

            .profile-quick-icon {
                width: 38px;
                height: 38px;
                display: grid;
                place-items: center;
                border-radius: 14px;
                background: var(--accent-soft);
                color: var(--accent);
                font-size: 20px;
            }

            .profile-quick-text b {
                display: block;
                font-size: 14px;
                line-height: 1.15;
            }

            .profile-quick-text small {
                display: block;
                margin-top: 3px;
                color: var(--muted);
                font-size: 12px;
                line-height: 1.25;
            }

            .profile-settings-modal {
                z-index: 10020;
                padding: clamp(10px, 2vw, 20px);
            }

            .profile-settings-content {
                width: min(780px, 100%);
                max-height: min(90vh, 820px);
                overflow-y: auto;
                overflow-x: hidden;
                scrollbar-width: none;
                -ms-overflow-style: none;
                border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
                border-radius: clamp(18px, 2.4vw, 26px);
                background: var(--surface);
                box-shadow: var(--shadow);
            }

            .profile-settings-content::-webkit-scrollbar {
                width: 0;
                height: 0;
                display: none;
            }

            .profile-settings-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 14px;
                padding: clamp(18px, 3vw, 26px) clamp(16px, 3vw, 26px) 12px;
            }

            .profile-settings-header span {
                display: inline-flex;
                width: 42px;
                height: 42px;
                align-items: center;
                justify-content: center;
                border-radius: 16px;
                background: var(--accent-soft);
                color: var(--accent);
                font-size: 22px;
            }

            .profile-settings-header h2 {
                margin: 0;
                color: var(--text);
                font-size: clamp(23px, 4vw, 34px);
                letter-spacing: -0.03em;
            }

            .profile-settings-header p {
                margin: 4px 0 0;
                color: var(--muted);
                line-height: 1.45;
            }

            .profile-settings-close {
                flex: 0 0 auto;
                width: 42px;
                height: 42px;
                border: 1px solid var(--border);
                border-radius: 50%;
                background: var(--surface-muted);
                color: var(--text);
                cursor: pointer;
                font-size: 24px;
                line-height: 1;
            }

            .profile-settings-tabs {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px;
                margin: 0 clamp(16px, 3vw, 26px) 14px;
                padding: 5px;
                border: 1px solid var(--border);
                border-radius: var(--radius);
                background: var(--surface-muted);
            }

            .profile-settings-tab {
                min-height: 44px;
                display: grid;
                grid-template-columns: 26px minmax(0, 1fr);
                gap: 8px;
                align-items: center;
                border: 0;
                border-radius: calc(var(--radius) - 2px);
                background: transparent;
                color: var(--muted);
                cursor: pointer;
                text-align: left;
                font-weight: 900;
                padding: 8px 10px;
            }

            .profile-settings-tab.active {
                background: linear-gradient(135deg, var(--accent), var(--accent-strong));
                color: var(--on-accent);
            }

            .profile-settings-tab small {
                display: block;
                margin-top: 1px;
                font-size: 11px;
                font-weight: 700;
                opacity: .8;
            }

            .profile-settings-body {
                padding: 0 clamp(16px, 3vw, 26px) clamp(18px, 3vw, 26px);
            }

            .profile-settings-pane {
                display: none;
            }

            .profile-settings-pane.active {
                display: grid;
                gap: 12px;
                animation: profileSettingsIn .16s ease both;
            }

            #profileSettingsModal .avatar-settings,
            #profileSettingsModal .theme-settings,
            #profileSettingsModal .profile-security-panel {
                display: block !important;
                margin-top: 0 !important;
                box-shadow: var(--shadow-soft);
            }

            #profileSettingsModal .theme-settings {
                margin-top: 12px !important;
            }

            #profileSettingsModal .profile-security-panel {
                margin-top: 0 !important;
            }

            @keyframes profileSettingsIn {
                from { opacity: 0; transform: translateY(4px); }
                to { opacity: 1; transform: translateY(0); }
            }

            @media (max-width: 560px) {
                .profile-quick-actions {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 8px;
                }

                .profile-quick-action {
                    min-height: 48px;
                    grid-template-columns: 34px minmax(0, 1fr);
                    padding: 8px;
                    border-radius: 14px;
                }

                .profile-quick-icon {
                    width: 34px;
                    height: 34px;
                    border-radius: 12px;
                    font-size: 18px;
                }

                .profile-quick-text small,
                .profile-settings-tab small {
                    display: none;
                }

                .profile-settings-modal {
                    padding: 0;
                }

                .profile-settings-content {
                    width: 100%;
                    max-height: 100dvh;
                    border-radius: 0;
                    border-left: 0;
                    border-right: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function getProfileContent() {
        return document.querySelector('#profileModal .profile-modal-content');
    }

    function ensureSettingsModal() {
        let modal = document.getElementById('profileSettingsModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'profileSettingsModal';
        modal.className = 'modal profile-settings-modal';
        modal.innerHTML = `
            <div class="modal-content profile-settings-content">
                <div class="profile-settings-header">
                    <div style="display:flex;gap:12px;align-items:flex-start;min-width:0">
                        <span>⚙️</span>
                        <div>
                            <h2>Настройки профиля</h2>
                            <p>Безопасность, двухфакторная аутентификация, аватар и оформление.</p>
                        </div>
                    </div>
                    <button class="profile-settings-close" id="closeProfileSettingsBtn" type="button">×</button>
                </div>
                <div class="profile-settings-tabs">
                    <button class="profile-settings-tab active" type="button" data-settings-tab="customize"><span>🎨</span><b>Кастомизация<small>аватар и темы</small></b></button>
                    <button class="profile-settings-tab" type="button" data-settings-tab="security"><span>⚙️</span><b>Настройки<small>безопасность</small></b></button>
                </div>
                <div class="profile-settings-body">
                    <section class="profile-settings-pane active" id="profileSettingsCustomizePane"></section>
                    <section class="profile-settings-pane" id="profileSettingsSecurityPane"></section>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#closeProfileSettingsBtn')?.addEventListener('click', () => closeSettingsModal());
        modal.addEventListener('click', event => {
            if (event.target === modal) closeSettingsModal();
            const tab = event.target.closest('[data-settings-tab]');
            if (tab) openSettingsModal(tab.dataset.settingsTab);
        });

        return modal;
    }

    function openSettingsModal(tab = 'customize') {
        const modal = ensureSettingsModal();
        moveSettingsBlocks();
        modal.classList.add('active');
        modal.querySelectorAll('[data-settings-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.settingsTab === tab));
        modal.querySelectorAll('.profile-settings-pane').forEach(pane => pane.classList.remove('active'));
        const pane = tab === 'security' ? document.getElementById('profileSettingsSecurityPane') : document.getElementById('profileSettingsCustomizePane');
        pane?.classList.add('active');
    }

    function closeSettingsModal() {
        document.getElementById('profileSettingsModal')?.classList.remove('active');
    }

    function ensureProfileActions() {
        const profileContent = getProfileContent();
        if (!profileContent) return;

        let actions = document.getElementById('profileQuickActions');
        if (!actions) {
            actions = document.createElement('div');
            actions.id = 'profileQuickActions';
            actions.className = 'profile-quick-actions';
            actions.innerHTML = `
                <button class="profile-quick-action" type="button" data-open-profile-settings="customize">
                    <span class="profile-quick-icon">🎨</span>
                    <span class="profile-quick-text"><b>Кастомизация</b><small>аватар и оформление</small></span>
                </button>
                <button class="profile-quick-action" type="button" data-open-profile-settings="security">
                    <span class="profile-quick-icon">⚙️</span>
                    <span class="profile-quick-text"><b>Настройки</b><small>безопасность и вход</small></span>
                </button>
            `;
            const top = profileContent.querySelector('.profile-modal-top');
            if (top) top.insertAdjacentElement('afterend', actions);
            else profileContent.insertBefore(actions, profileContent.firstChild);
        }

        actions.onclick = event => {
            const btn = event.target.closest('[data-open-profile-settings]');
            if (!btn) return;
            openSettingsModal(btn.dataset.openProfileSettings || 'customize');
        };
    }

    function moveSettingsBlocks() {
        const customizePane = document.getElementById('profileSettingsCustomizePane') || ensureSettingsModal().querySelector('#profileSettingsCustomizePane');
        const securityPane = document.getElementById('profileSettingsSecurityPane') || ensureSettingsModal().querySelector('#profileSettingsSecurityPane');

        document.querySelectorAll('.avatar-settings, .theme-settings').forEach(el => {
            if (!customizePane.contains(el)) customizePane.appendChild(el);
            el.classList.remove('profile-compact-group', 'active');
            delete el.dataset.profileGroup;
        });

        const security = document.getElementById('profileSecurityPanel');
        if (security && !securityPane.contains(security)) {
            securityPane.appendChild(security);
            security.classList.remove('profile-compact-group', 'active');
            delete security.dataset.profileGroup;
        }
    }

    function cleanProfileLogic() {
        const modal = document.getElementById('profileModal');
        if (!modal) return;
        modal.querySelector('.profile-access-panel')?.setAttribute('hidden', '');
        modal.querySelector('.profile-grid')?.setAttribute('hidden', '');
        document.getElementById('profileRoleNote') && (document.getElementById('profileRoleNote').textContent = 'Личный профиль и ваши арендованные книги');
        const badge = document.getElementById('profileModeBadge');
        if (badge) badge.textContent = 'Профиль пользователя';
    }

    function init() {
        injectStyles();
        ensureSettingsModal();
        ensureProfileActions();
        moveSettingsBlocks();
        cleanProfileLogic();

        const modal = document.getElementById('profileModal');
        if (modal && 'MutationObserver' in window) {
            const observer = new MutationObserver(() => {
                ensureProfileActions();
                moveSettingsBlocks();
                cleanProfileLogic();
            });
            observer.observe(modal, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
