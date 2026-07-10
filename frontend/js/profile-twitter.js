(function () {
    const VALID_VIEWS = new Set(['overview', 'customize', 'settings']);

    function getModal() {
        return document.getElementById('profileModal');
    }

    function getContent() {
        return document.querySelector('#profileModal .profile-modal-content');
    }

    function removeLegacyExtraModals() {
        document.getElementById('profileTwitterStyles')?.remove();
        document.getElementById('profileCustomizeModal')?.remove();
        document.getElementById('profileSettingsModal')?.remove();
    }

    function ensureHeaderActions() {
        const top = document.querySelector('#profileModal .profile-modal-top');
        if (!top) return;

        let actions = document.getElementById('profileTwitterActions');
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'profile-twitter-actions';
            actions.id = 'profileTwitterActions';
            actions.innerHTML = `
                <button class="profile-twitter-action" id="profileCustomizeBtn" type="button"
                        data-profile-view-target="customize" aria-label="Оформление профиля" aria-expanded="false">
                    <span class="profile-twitter-action-icon" aria-hidden="true">✏️</span>
                    <span class="profile-twitter-action-label">Изменить</span>
                </button>
                <button class="profile-twitter-action" id="profileSettingsBtn" type="button"
                        data-profile-view-target="settings" aria-label="Настройки безопасности" aria-expanded="false">
                    <span class="profile-twitter-action-icon" aria-hidden="true">⚙️</span>
                    <span class="profile-twitter-action-label">Настройки</span>
                </button>
            `;
            top.appendChild(actions);
        }
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
            tabs.setAttribute('role', 'tablist');
            tabs.setAttribute('aria-label', 'Разделы профиля');
            tabs.innerHTML = `
                <button class="profile-view-tab" type="button" role="tab"
                        data-profile-view-target="overview" aria-selected="true">📚 Мои книги</button>
                <button class="profile-view-tab" type="button" role="tab"
                        data-profile-view-target="customize" aria-selected="false">🎨 Оформление</button>
                <button class="profile-view-tab" type="button" role="tab"
                        data-profile-view-target="settings" aria-selected="false">🔐 Безопасность</button>
            `;
            top.insertAdjacentElement('afterend', tabs);
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
            }
        });
    }

    function setView(nextView, options = {}) {
        const modal = getModal();
        if (!modal) return;

        const view = VALID_VIEWS.has(nextView) ? nextView : 'overview';
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
                const top = Math.max(0, tabs.offsetTop - 2);
                content.scrollTo({
                    top,
                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
                });
            }
        }
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
            const next = requested === current && requested !== 'overview' ? 'overview' : requested;
            setView(next);
        });

        const tabs = document.getElementById('profileViewTabs');
        tabs?.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const buttons = Array.from(tabs.querySelectorAll('.profile-view-tab'));
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
            new MutationObserver(() => {
                if (!modal.classList.contains('active')) setView('overview', { scroll: false });
            }).observe(modal, { attributes: true, attributeFilter: ['class'] });
        }
    }

    function init() {
        const modal = getModal();
        if (!modal) return;

        removeLegacyExtraModals();
        ensureHeaderActions();
        ensureViewTabs();
        wireControls();
        setView('overview', { scroll: false });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
