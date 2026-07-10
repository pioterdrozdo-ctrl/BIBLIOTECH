(() => {
    const root = document.documentElement;
    let lastInput = 'programmatic';
    let switchingTab = false;

    const prefersReducedMotion = () =>
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    function setInputMode(mode) {
        lastInput = mode;
        root.classList.toggle('auth-using-keyboard', mode === 'keyboard');
    }

    document.addEventListener('pointerdown', () => setInputMode('pointer'), true);
    document.addEventListener('keydown', () => setInputMode('keyboard'), true);
    document.addEventListener('click', event => {
        setInputMode(event.detail === 0 ? 'keyboard' : 'pointer');
    }, true);

    function syncTabs(tab) {
        const tabs = document.querySelector('.tabs');
        const loginTab = document.getElementById('loginTab');
        const registerTab = document.getElementById('registerTab');
        if (!tabs || !loginTab || !registerTab) return;

        const selected = tab === 'login' || tab === 'register' ? tab : 'none';
        tabs.dataset.activeTab = selected;

        loginTab.setAttribute('aria-selected', String(selected === 'login'));
        registerTab.setAttribute('aria-selected', String(selected === 'register'));
        loginTab.tabIndex = selected === 'register' ? -1 : 0;
        registerTab.tabIndex = selected === 'register' ? 0 : -1;
    }

    function animateElement(element, distance = 6) {
        if (!element || prefersReducedMotion() || lastInput === 'keyboard' || !element.animate) return;

        element.getAnimations().forEach(animation => animation.cancel());
        element.animate(
            [
                { opacity: 0, transform: `translateY(${distance}px)` },
                { opacity: 1, transform: 'translateY(0)' }
            ],
            {
                duration: 180,
                easing: 'cubic-bezier(0.23, 1, 0.32, 1)'
            }
        );
    }

    function wrapAuthFunctions() {
        const originalSwitchTab = window.switchTab;
        if (typeof originalSwitchTab === 'function') {
            window.switchTab = function wrappedSwitchTab(tab) {
                switchingTab = true;
                try {
                    const result = originalSwitchTab.apply(this, arguments);
                    syncTabs(tab);
                    requestAnimationFrame(() => animateElement(document.querySelector('.form.active')));
                    return result;
                } finally {
                    switchingTab = false;
                }
            };
        }

        const originalShowResetStep = window.showResetStep;
        if (typeof originalShowResetStep === 'function') {
            window.showResetStep = function wrappedShowResetStep() {
                const result = originalShowResetStep.apply(this, arguments);
                if (!switchingTab && document.getElementById('resetForm')?.classList.contains('active')) {
                    requestAnimationFrame(() => {
                        animateElement(document.querySelector('#resetForm .reset-step.active:not([hidden])'), 4);
                    });
                }
                return result;
            };
        }
    }

    function setupTabKeyboardNavigation() {
        const tabs = document.querySelector('.tabs');
        if (!tabs) return;

        const tabButtons = [...tabs.querySelectorAll('[role="tab"]')];
        tabs.addEventListener('keydown', event => {
            const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
            if (!keys.includes(event.key)) return;

            event.preventDefault();
            const currentIndex = Math.max(0, tabButtons.indexOf(document.activeElement));
            let nextIndex = currentIndex;

            if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
            if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabButtons.length;
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = tabButtons.length - 1;

            tabButtons[nextIndex]?.focus();
            tabButtons[nextIndex]?.click();
        });
    }

    function setupStatusFeedback() {
        ['loginError', 'regError', 'regSuccess', 'resetInfo', 'resetError'].forEach(id => {
            const element = document.getElementById(id);
            if (!element) return;

            new MutationObserver(() => {
                if (element.textContent.trim()) animateElement(element, 3);
            }).observe(element, { childList: true, characterData: true, subtree: true });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        wrapAuthFunctions();
        setupTabKeyboardNavigation();
        setupStatusFeedback();

        const activeTab = document.getElementById('registerTab')?.classList.contains('active')
            ? 'register'
            : 'login';
        syncTabs(activeTab);
    });
})();
