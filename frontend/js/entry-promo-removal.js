(function () {
    'use strict';

    const SESSION_KEY = 'bibliotech_current_user';
    const WELCOME_PREFIX = 'bibliotech_product_welcome_v1_';

    function getUserKey() {
        try {
            const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
            return String(session?.username || (session?.guest ? 'guest' : 'anonymous')).trim().toLowerCase();
        } catch {
            return 'anonymous';
        }
    }

    function injectStyles() {
        if (document.getElementById('entryPromoRemovalStyles')) return;
        const style = document.createElement('style');
        style.id = 'entryPromoRemovalStyles';
        style.textContent = `
            .auth-product-story,
            #productWelcomeModal {
                display: none !important;
            }

            .auth-product-shell {
                width: min(480px, calc(100% - 32px)) !important;
                min-height: 0 !important;
                display: block !important;
                margin: 0 auto !important;
            }

            .auth-product-shell > .auth-container,
            body.auth-page > .auth-container {
                margin-inline: auto !important;
            }

            body.product-welcome-open {
                overflow: auto !important;
            }
        `;
        document.head.appendChild(style);
    }

    function removeAuthPromo() {
        document.querySelectorAll('.auth-product-story').forEach(element => element.remove());

        const container = document.querySelector('.auth-container');
        const shell = container?.closest('.auth-product-shell');
        if (!container || !shell || !shell.parentNode) return;

        shell.parentNode.insertBefore(container, shell);
        shell.remove();
    }

    function removeWelcomePromo() {
        try { localStorage.setItem(WELCOME_PREFIX + getUserKey(), '1'); } catch {}
        document.getElementById('productWelcomeModal')?.remove();
        document.body?.classList.remove('product-welcome-open');

        if (window.BibliotechProductPolish) {
            window.BibliotechProductPolish.showWelcome = function disabledWelcomePromo() {};
        }
    }

    function apply() {
        injectStyles();
        removeAuthPromo();
        removeWelcomePromo();
    }

    function init() {
        apply();

        if (!document.body || !('MutationObserver' in window)) return;
        const observer = new MutationObserver(apply);
        observer.observe(document.body, { childList: true, subtree: true });

        [100, 300, 700, 1200, 2200].forEach(delay => window.setTimeout(apply, delay));
        window.setTimeout(() => {
            apply();
            observer.disconnect();
        }, 3500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
