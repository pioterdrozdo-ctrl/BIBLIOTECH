(function () {
    const PROFILE_SECTIONS = {
        customize: {
            title: 'Кастомизация',
            icon: '🎨',
            description: 'Аватар и оформление сайта'
        },
        settings: {
            title: 'Настройки',
            icon: '⚙️',
            description: 'Безопасность и параметры аккаунта'
        }
    };

    function injectStyles() {
        if (document.getElementById('profileCompactStyles')) return;
        const style = document.createElement('style');
        style.id = 'profileCompactStyles';
        style.textContent = `
            .profile-quick-actions {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
                margin: 14px 0 4px;
            }

            .profile-quick-action {
                min-height: 56px;
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
                border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
                background: var(--surface-muted);
            }

            .profile-quick-action.active {
                border-color: color-mix(in srgb, var(--accent) 68%, var(--border));
                background: linear-gradient(135deg, color-mix(in srgb, var(--accent-soft) 82%, transparent), var(--surface));
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

            .profile-compact-group {
                display: none !important;
            }

            .profile-compact-group.active {
                display: block !important;
                animation: profileCompactIn .18s ease both;
            }

            .profile-compact-group.profile-security-panel,
            .profile-compact-group.avatar-settings,
            .profile-compact-group.theme-settings {
                margin-top: 12px !important;
            }

            .profile-compact-heading {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin: 12px 0 0;
                padding: 10px 12px;
                border: 1px solid var(--border);
                border-radius: var(--radius);
                background: var(--surface-muted);
                color: var(--muted);
                font-size: 13px;
                font-weight: 900;
            }

            .profile-compact-heading.hidden {
                display: none;
            }

            .profile-compact-close {
                border: 0;
                background: transparent;
                color: var(--muted);
                cursor: pointer;
                font-size: 18px;
                line-height: 1;
            }

            @keyframes profileCompactIn {
                from { opacity: 0; transform: translateY(-4px); }
                to { opacity: 1; transform: translateY(0); }
            }

            @media (max-width: 560px) {
                .profile-quick-actions {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 8px;
                }

                .profile-quick-action {
                    min-height: 50px;
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

                .profile-quick-text b {
                    font-size: 13px;
                }

                .profile-quick-text small {
                    display: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function getModalContent() {
        return document.querySelector('#profileModal .profile-modal-content');
    }

    function ensureToolbar() {
        const modalContent = getModalContent();
        if (!modalContent) return null;

        let toolbar = document.getElementById('profileQuickActions');
        if (toolbar) return toolbar;

        toolbar = document.createElement('div');
        toolbar.className = 'profile-quick-actions';
        toolbar.id = 'profileQuickActions';
        toolbar.innerHTML = Object.entries(PROFILE_SECTIONS).map(([key, item]) => `
            <button class="profile-quick-action" type="button" data-profile-panel="${key}" title="${item.title}">
                <span class="profile-quick-icon">${item.icon}</span>
                <span class="profile-quick-text"><b>${item.title}</b><small>${item.description}</small></span>
            </button>
        `).join('');

        const stats = modalContent.querySelector('.profile-grid');
        if (stats) stats.insertAdjacentElement('afterend', toolbar);
        else modalContent.insertBefore(toolbar, modalContent.firstChild);

        toolbar.addEventListener('click', event => {
            const btn = event.target.closest('[data-profile-panel]');
            if (!btn) return;
            const panel = btn.dataset.profilePanel;
            const alreadyActive = btn.classList.contains('active');
            closeAllPanels();
            if (!alreadyActive) openPanel(panel);
        });

        return toolbar;
    }

    function ensureHeading(panel) {
        const modalContent = getModalContent();
        if (!modalContent) return null;
        let heading = document.getElementById('profileCompactHeading');
        if (!heading) {
            heading = document.createElement('div');
            heading.id = 'profileCompactHeading';
            heading.className = 'profile-compact-heading hidden';
            heading.innerHTML = '<span id="profileCompactHeadingText"></span><button class="profile-compact-close" type="button" aria-label="Скрыть блок">×</button>';
            const toolbar = ensureToolbar();
            if (toolbar) toolbar.insertAdjacentElement('afterend', heading);
            heading.querySelector('.profile-compact-close')?.addEventListener('click', closeAllPanels);
        }
        const text = heading.querySelector('#profileCompactHeadingText');
        if (text && PROFILE_SECTIONS[panel]) {
            text.textContent = `${PROFILE_SECTIONS[panel].icon} ${PROFILE_SECTIONS[panel].title}`;
        }
        return heading;
    }

    function markGroups() {
        document.querySelectorAll('#profileModal .avatar-settings, #profileModal .theme-settings').forEach(el => {
            el.classList.add('profile-compact-group');
            el.dataset.profileGroup = 'customize';
        });

        const security = document.getElementById('profileSecurityPanel');
        if (security) {
            security.classList.add('profile-compact-group');
            security.dataset.profileGroup = 'settings';
        }
    }

    function closeAllPanels() {
        document.querySelectorAll('#profileQuickActions .profile-quick-action').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('#profileModal .profile-compact-group').forEach(el => el.classList.remove('active'));
        document.getElementById('profileCompactHeading')?.classList.add('hidden');
    }

    function openPanel(panel) {
        markGroups();
        document.querySelectorAll(`#profileModal [data-profile-group="${panel}"]`).forEach(el => el.classList.add('active'));
        document.querySelector(`#profileQuickActions [data-profile-panel="${panel}"]`)?.classList.add('active');
        const heading = ensureHeading(panel);
        heading?.classList.remove('hidden');
    }

    function compactProfile() {
        injectStyles();
        ensureToolbar();
        markGroups();
        const hasOpenPanel = Boolean(document.querySelector('#profileModal .profile-compact-group.active'));
        if (!hasOpenPanel) closeAllPanels();
    }

    function init() {
        compactProfile();
        const modal = document.getElementById('profileModal');
        if (modal && 'MutationObserver' in window) {
            const observer = new MutationObserver(() => compactProfile());
            observer.observe(modal, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
