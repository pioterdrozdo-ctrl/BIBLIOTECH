(function () {
    function injectClearButtonStyles() {
        if (document.getElementById('authClearInputStyles')) return;
        const style = document.createElement('style');
        style.id = 'authClearInputStyles';
        style.textContent = `
            .auth-input-wrap {
                position: relative;
                width: 100%;
                margin-bottom: 12px;
            }

            .auth-input-wrap input {
                margin-bottom: 0 !important;
                padding-right: 46px !important;
            }

            .auth-container .input-clear-btn {
                position: absolute !important;
                top: 50% !important;
                right: 10px !important;
                transform: translateY(-50%) !important;
                width: 28px !important;
                min-width: 28px !important;
                height: 28px !important;
                min-height: 28px !important;
                padding: 0 !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                border: 1px solid color-mix(in srgb, var(--border) 80%, transparent) !important;
                border-radius: 50% !important;
                background: color-mix(in srgb, var(--surface-strong) 82%, transparent) !important;
                color: var(--muted) !important;
                box-shadow: none !important;
                cursor: pointer !important;
                font-size: 18px !important;
                font-weight: 800 !important;
                line-height: 1 !important;
                opacity: 0 !important;
                pointer-events: none !important;
                transition: opacity .15s ease, color .15s ease, border-color .15s ease !important;
            }

            .auth-container .input-clear-btn.visible {
                opacity: 1 !important;
                pointer-events: auto !important;
            }

            .auth-container .input-clear-btn:hover {
                color: var(--text) !important;
                border-color: var(--accent) !important;
                transform: translateY(-50%) !important;
            }

            .auth-container .input-clear-btn::after {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    function updateClearButton(input, button) {
        button.classList.toggle('visible', Boolean(input.value));
    }

    function makeInputClearable(input) {
        if (!input || input.dataset.clearableReady === 'true') return;
        input.dataset.clearableReady = 'true';

        const wrapper = document.createElement('div');
        wrapper.className = 'auth-input-wrap';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const button = document.createElement('button');
        button.className = 'input-clear-btn';
        button.type = 'button';
        button.setAttribute('aria-label', 'Очистить поле');
        button.textContent = '×';
        wrapper.appendChild(button);

        input.addEventListener('input', () => updateClearButton(input, button));
        input.addEventListener('change', () => updateClearButton(input, button));
        button.addEventListener('click', () => {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
        });

        updateClearButton(input, button);
    }

    function setupAuthClearButtons() {
        injectClearButtonStyles();
        document.querySelectorAll('.auth-container input').forEach(makeInputClearable);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupAuthClearButtons);
    } else {
        setupAuthClearButtons();
    }
})();