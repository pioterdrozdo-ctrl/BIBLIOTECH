(function () {
    function injectResetFixStyles() {
        if (document.getElementById('authResetFixStyles')) return;
        const style = document.createElement('style');
        style.id = 'authResetFixStyles';
        style.textContent = `
            .auth-mode-title {
                margin: 0 0 18px;
                padding: 13px 14px;
                border: 1px solid var(--border);
                border-radius: var(--radius);
                background: color-mix(in srgb, var(--surface-strong) 68%, transparent);
                color: var(--text);
                text-align: center;
                font-weight: 900;
                font-size: 17px;
            }

            .auth-reset-mode .tabs {
                display: none !important;
            }

            .auth-container .reset-step button,
            .auth-container #resetForm button {
                position: relative;
                z-index: 3;
                pointer-events: auto !important;
            }

            .auth-container .auth-input-wrap {
                z-index: 1;
            }

            .auth-container .auth-input-wrap + button,
            .auth-container .auth-input-wrap + .auth-link-btn {
                margin-top: 0;
            }
        `;
        document.head.appendChild(style);
    }

    function getAuthContainer() {
        return document.getElementById('authContainer') || document.querySelector('.auth-container');
    }

    function ensureResetTitle() {
        const container = getAuthContainer();
        const tabs = document.getElementById('authTabs') || document.querySelector('.tabs');
        if (!container || !tabs) return null;
        let title = document.getElementById('authModeTitle');
        if (!title) {
            title = document.createElement('div');
            title.id = 'authModeTitle';
            title.className = 'auth-mode-title';
            title.textContent = 'Восстановление';
            title.hidden = true;
            tabs.insertAdjacentElement('afterend', title);
        }
        return title;
    }

    function setResetMode(active) {
        const container = getAuthContainer();
        const title = ensureResetTitle();
        if (container) container.classList.toggle('auth-reset-mode', Boolean(active));
        if (title) title.hidden = !active;
    }

    function patchSwitchTab() {
        if (window.__bibliotechResetSwitchPatched) return;
        window.__bibliotechResetSwitchPatched = true;
        const originalSwitchTab = window.switchTab;
        window.switchTab = function patchedSwitchTab(tab) {
            if (typeof originalSwitchTab === 'function') {
                originalSwitchTab(tab);
            }
            setResetMode(tab === 'reset');
        };
    }

    function findResetSendButton() {
        return document.getElementById('resetSendCodeBtn')
            || Array.from(document.querySelectorAll('#resetEmailStep button, #resetForm button'))
                .find(button => /отправить код/i.test(button.textContent || ''));
    }

    function makeResetButtonClickable() {
        const button = findResetSendButton();
        if (!button || button.dataset.resetClickFixed === 'true') return;
        button.dataset.resetClickFixed = 'true';
        button.type = 'button';
        button.disabled = false;
        button.style.pointerEvents = 'auto';
        button.style.position = 'relative';
        button.style.zIndex = '3';
        button.addEventListener('click', function (event) {
            event.preventDefault();
            if (typeof window.requestPasswordReset === 'function') {
                window.requestPasswordReset();
            }
        });
    }

    function initResetFix() {
        injectResetFixStyles();
        ensureResetTitle();
        patchSwitchTab();
        makeResetButtonClickable();

        const resetForm = document.getElementById('resetForm');
        if (resetForm && resetForm.classList.contains('active')) setResetMode(true);

        if ('MutationObserver' in window) {
            const observer = new MutationObserver(() => {
                ensureResetTitle();
                makeResetButtonClickable();
                const resetActive = document.getElementById('resetForm')?.classList.contains('active');
                setResetMode(Boolean(resetActive));
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initResetFix);
    } else {
        initResetFix();
    }
})();
