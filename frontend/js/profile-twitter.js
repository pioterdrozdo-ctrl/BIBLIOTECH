(function () {
    function injectStyles() {
        if (document.getElementById('profileTwitterStyles')) return;
        const style = document.createElement('style');
        style.id = 'profileTwitterStyles';
        style.textContent = `
            #profileModal .profile-modal-content {
                width: min(760px, 100%);
                max-height: min(92vh, 860px);
                overflow-y: auto;
                overflow-x: hidden;
                border: 1px solid var(--border);
                background: var(--surface);
            }

            #profileModal .profile-modal-top {
                position: relative;
                display: block;
                min-height: 258px;
                padding: 0 22px 22px;
                border-bottom: 1px solid var(--border);
                background: var(--surface);
            }

            #profileModal .profile-modal-top::before {
                content: '';
                display: block;
                height: 124px;
                margin: 0 -22px;
                background:
                    radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--gold) 34%, transparent), transparent 34%),
                    radial-gradient(circle at 78% 32%, color-mix(in srgb, var(--accent-strong) 36%, transparent), transparent 30%),
                    linear-gradient(135deg, color-mix(in srgb, var(--accent) 74%, #111), color-mix(in srgb, var(--bg-soft) 72%, #000));
                border-radius: var(--radius) var(--radius) 0 0;
            }

            #profileModal .profile-close-btn {
                top: 14px;
                right: 14px;
                z-index: 6;
                width: 38px;
                height: 38px;
                border-radius: 50%;
                background: color-mix(in srgb, var(--surface) 92%, transparent);
            }

            #profileModal .profile-avatar-shell {
                position: absolute;
                left: 24px;
                top: 78px;
                z-index: 4;
            }

            #profileModal .profile-avatar {
                width: 116px;
                height: 116px;
                flex: 0 0 116px;
                border: 5px solid var(--surface);
                border-radius: 50%;
                background: var(--surface-muted);
                font-size: 48px;
                box-shadow: var(--shadow-soft);
            }

            #profileModal .profile-live-dot {
                right: 9px;
                bottom: 9px;
                width: 18px;
                height: 18px;
                border-color: var(--surface);
            }

            #profileModal .profile-identity {
                min-width: 0;
                padding-top: 78px;
                padding-right: 110px;
            }

            #profileModal .profile-kicker {
                margin: 0 0 4px;
                color: var(--muted);
                font-size: 13px;
                font-weight: 850;
            }

            #profileModal .profile-name-row h2 {
                font-size: clamp(25px, 4vw, 34px);
                line-height: 1.05;
            }

            #profileModal .profile-mode-badge {
                background: var(--accent-soft);
                color: var(--accent);
            }

            #profileModal .profile-role-note {
                margin-top: 6px;
            }

            .profile-twitter-actions {
                position: absolute;
                right: 66px;
                top: 14px;
                z-index: 5;
                display: flex;
                gap: 8px;
            }

            .profile-twitter-action {
                width: 38px;
                height: 38px;
                display: grid;
                place-items: center;
                border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
                border-radius: 50%;
                background: color-mix(in srgb, var(--surface) 92%, transparent);
                color: var(--text);
                cursor: pointer;
                box-shadow: var(--shadow-soft);
                font-size: 18px;
                transition: transform .16s ease, background .16s ease, color .16s ease;
            }

            .profile-twitter-action:hover,
            .profile-twitter-action.active {
                transform: translateY(-1px);
                background: var(--accent);
                color: var(--on-accent);
            }

            #profileModal .profile-access-panel,
            #profileModal .profile-grid,
            #profileModal .avatar-settings,
            #profileModal .theme-settings,
            #profileModal #profileSecurityPanel {
                display: none !important;
            }

            #profileModal .profile-rentals-panel {
                margin: 16px 22px 0;
                border-radius: var(--radius);
            }

            #profileModal .profile-rentals-head h3 {
                font-size: 20px;
            }

            #profileModal .profile-actions {
                margin: 16px 22px 0;
                padding: 0 0 22px;
            }

            .profile-extra-modal {
                z-index: 10030;
                padding: clamp(12px, 2.5vw, 24px);
            }

            .profile-extra-content {
                width: min(720px, 100%);
                max-height: min(88vh, 820px);
                overflow-y: auto;
                overflow-x: hidden;
                border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
                border-radius: clamp(18px, 2.4vw, 26px);
                background: var(--surface);
                box-shadow: var(--shadow);
            }

            .profile-extra-content::-webkit-scrollbar { width: 0; height: 0; display: none; }
            .profile-extra-content { scrollbar-width: none; -ms-overflow-style: none; }

            .profile-extra-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 14px;
                padding: clamp(18px, 3vw, 26px) clamp(16px, 3vw, 26px) 12px;
                border-bottom: 1px solid var(--border);
                background:
                    radial-gradient(circle at 12% 12%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 34%),
                    var(--surface);
            }

            .profile-extra-title {
                display: flex;
                gap: 12px;
                align-items: flex-start;
                min-width: 0;
            }

            .profile-extra-icon {
                width: 44px;
                height: 44px;
                flex: 0 0 auto;
                display: grid;
                place-items: center;
                border-radius: 16px;
                background: var(--accent-soft);
                color: var(--accent);
                font-size: 23px;
            }

            .profile-extra-header h2 {
                margin: 0;
                font-size: clamp(24px, 4vw, 34px);
                line-height: 1.05;
            }

            .profile-extra-header p {
                margin: 5px 0 0;
                color: var(--muted);
                line-height: 1.45;
            }

            .profile-extra-close {
                width: 42px;
                height: 42px;
                flex: 0 0 auto;
                display: grid;
                place-items: center;
                border: 1px solid var(--border);
                border-radius: 50%;
                background: var(--surface-muted);
                color: var(--text);
                cursor: pointer;
                font-size: 24px;
            }

            .profile-extra-body {
                display: grid;
                gap: 14px;
                padding: clamp(16px, 3vw, 26px);
            }

            .profile-extra-body .avatar-settings,
            .profile-extra-body .theme-settings,
            .profile-extra-body #profileSecurityPanel {
                display: block !important;
                margin: 0 !important;
                box-shadow: var(--shadow-soft);
            }

            .profile-extra-body .theme-settings,
            .profile-extra-body #profileSecurityPanel {
                margin-top: 0 !important;
            }

            .profile-extra-empty {
                padding: 16px;
                border: 1px dashed var(--border);
                border-radius: var(--radius);
                background: var(--surface-muted);
                color: var(--muted);
                text-align: center;
            }

            @media (max-width: 560px) {
                #profileModal .profile-modal-content {
                    width: 100%;
                    max-height: 100dvh;
                    border-radius: 0;
                }

                #profileModal .profile-modal-top {
                    min-height: 240px;
                    padding-left: 16px;
                    padding-right: 16px;
                }

                #profileModal .profile-modal-top::before {
                    height: 114px;
                    margin-left: -16px;
                    margin-right: -16px;
                    border-radius: 0;
                }

                #profileModal .profile-avatar-shell {
                    left: 18px;
                    top: 76px;
                }

                #profileModal .profile-avatar {
                    width: 96px;
                    height: 96px;
                    flex-basis: 96px;
                    font-size: 40px;
                }

                #profileModal .profile-identity {
                    padding-top: 64px;
                    padding-right: 0;
                }

                .profile-twitter-actions {
                    right: 60px;
                    top: 12px;
                }

                .profile-twitter-action,
                #profileModal .profile-close-btn {
                    width: 36px;
                    height: 36px;
                }

                #profileModal .profile-rentals-panel,
                #profileModal .profile-actions {
                    margin-left: 14px;
                    margin-right: 14px;
                }

                .profile-extra-modal {
                    padding: 0;
                }

                .profile-extra-content {
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

    function ensureExtraModal(id, icon, title, subtitle) {
        let modal = document.getElementById(id);
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal profile-extra-modal';
        modal.innerHTML = `
            <div class="modal-content profile-extra-content">
                <div class="profile-extra-header">
                    <div class="profile-extra-title">
                        <span class="profile-extra-icon">${icon}</span>
                        <div>
                            <h2>${title}</h2>
                            <p>${subtitle}</p>
                        </div>
                    </div>
                    <button class="profile-extra-close" type="button" aria-label="Закрыть">×</button>
                </div>
                <div class="profile-extra-body" id="${id}Body"></div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', event => {
            if (event.target === modal || event.target.closest('.profile-extra-close')) closeExtraModal(id);
        });
        return modal;
    }

    function setHeaderButtonState(type, active) {
        const id = type === 'customize' ? 'profileCustomizeBtn' : 'profileSettingsBtn';
        document.getElementById(id)?.classList.toggle('active', Boolean(active));
    }

    function closeExtraModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove('active');
        if (id === 'profileCustomizeModal') setHeaderButtonState('customize', false);
        if (id === 'profileSettingsModal') setHeaderButtonState('settings', false);
    }

    function openCustomizeModal() {
        const modal = ensureExtraModal('profileCustomizeModal', '🎨', 'Кастомизация', 'Аватар профиля и оформление сайта.');
        const body = document.getElementById('profileCustomizeModalBody');
        const avatar = document.querySelector('.avatar-settings');
        const theme = document.querySelector('.theme-settings');
        body.innerHTML = '';
        if (avatar) body.appendChild(avatar);
        if (theme) body.appendChild(theme);
        if (!avatar && !theme) body.innerHTML = '<div class="profile-extra-empty">Кастомизация ещё загружается. Откройте окно ещё раз через секунду.</div>';
        modal.classList.add('active');
        setHeaderButtonState('customize', true);
    }

    function openSettingsModal() {
        const modal = ensureExtraModal('profileSettingsModal', '⚙️', 'Настройки', 'Безопасность аккаунта, 2FA и параметры входа.');
        const body = document.getElementById('profileSettingsModalBody');
        const security = document.getElementById('profileSecurityPanel');
        body.innerHTML = '';
        if (security) body.appendChild(security);
        else body.innerHTML = '<div class="profile-extra-empty">Настройки ещё загружаются. Откройте окно ещё раз через секунду.</div>';
        modal.classList.add('active');
        setHeaderButtonState('settings', true);
    }

    function ensureHeaderActions() {
        const top = document.querySelector('#profileModal .profile-modal-top');
        if (!top || document.getElementById('profileTwitterActions')) return;
        const actions = document.createElement('div');
        actions.className = 'profile-twitter-actions';
        actions.id = 'profileTwitterActions';
        actions.innerHTML = `
            <button class="profile-twitter-action" id="profileSettingsBtn" type="button" title="Настройки" aria-label="Настройки">⚙️</button>
            <button class="profile-twitter-action" id="profileCustomizeBtn" type="button" title="Кастомизация" aria-label="Кастомизация">🎨</button>
        `;
        top.appendChild(actions);

        actions.addEventListener('click', event => {
            const settings = event.target.closest('#profileSettingsBtn');
            const customize = event.target.closest('#profileCustomizeBtn');
            if (!settings && !customize) return;
            event.preventDefault();
            event.stopPropagation();
            if (settings) openSettingsModal();
            if (customize) openCustomizeModal();
        });
    }

    function init() {
        injectStyles();
        ensureExtraModal('profileCustomizeModal', '🎨', 'Кастомизация', 'Аватар профиля и оформление сайта.');
        ensureExtraModal('profileSettingsModal', '⚙️', 'Настройки', 'Безопасность аккаунта, 2FA и параметры входа.');
        ensureHeaderActions();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
