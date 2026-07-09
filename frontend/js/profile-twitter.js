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
            #profileModal .profile-grid {
                display: none !important;
            }

            #profileModal .avatar-settings,
            #profileModal .theme-settings,
            #profileModal #profileSecurityPanel {
                display: none !important;
                margin: 16px 22px 0;
                animation: profileTwitterSectionIn .16s ease both;
            }

            #profileModal.profile-customize-open .avatar-settings,
            #profileModal.profile-customize-open .theme-settings,
            #profileModal.profile-settings-open #profileSecurityPanel {
                display: block !important;
            }

            #profileModal.profile-customize-open #profileCustomizeBtn,
            #profileModal.profile-settings-open #profileSettingsBtn {
                background: var(--accent);
                color: var(--on-accent);
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

            @keyframes profileTwitterSectionIn {
                from { opacity: 0; transform: translateY(5px); }
                to { opacity: 1; transform: translateY(0); }
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
                #profileModal .avatar-settings,
                #profileModal .theme-settings,
                #profileModal #profileSecurityPanel,
                #profileModal .profile-actions {
                    margin-left: 14px;
                    margin-right: 14px;
                }
            }
        `;
        document.head.appendChild(style);
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
            const modal = document.getElementById('profileModal');
            if (!modal) return;
            const settings = event.target.closest('#profileSettingsBtn');
            const customize = event.target.closest('#profileCustomizeBtn');
            if (!settings && !customize) return;
            event.preventDefault();

            if (settings) {
                const willOpen = !modal.classList.contains('profile-settings-open');
                modal.classList.toggle('profile-settings-open', willOpen);
                if (willOpen) modal.classList.remove('profile-customize-open');
            }

            if (customize) {
                const willOpen = !modal.classList.contains('profile-customize-open');
                modal.classList.toggle('profile-customize-open', willOpen);
                if (willOpen) modal.classList.remove('profile-settings-open');
            }
        });
    }

    function init() {
        injectStyles();
        ensureHeaderActions();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
