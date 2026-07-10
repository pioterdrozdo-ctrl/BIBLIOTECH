(function () {
    'use strict';

    const SESSION_KEY = 'bibliotech_current_user';
    const WELCOME_PREFIX = 'bibliotech_product_welcome_v1_';

    function userKeyFromSession(session) {
        return String(session?.username || (session?.guest ? 'guest' : 'anonymous')).trim().toLowerCase();
    }

    function getUserKey() {
        try {
            const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
            return userKeyFromSession(session);
        } catch {
            return 'anonymous';
        }
    }

    function markWelcomeSeen(userKey = getUserKey()) {
        try { localStorage.setItem(WELCOME_PREFIX + userKey, '1'); }
        catch {}
    }

    function suppressWelcomeForNewSession() {
        const prototype = window.Storage?.prototype;
        if (!prototype || prototype.__bibliotechEntryPromoSuppressed) return;

        const originalSetItem = prototype.setItem;
        Object.defineProperty(prototype, '__bibliotechEntryPromoSuppressed', {
            value: true,
            configurable: false,
            enumerable: false,
            writable: false
        });

        prototype.setItem = function (key, value) {
            const result = originalSetItem.call(this, key, value);
            if (this !== window.localStorage || key !== SESSION_KEY) return result;

            try {
                const session = JSON.parse(value || 'null');
                originalSetItem.call(this, WELCOME_PREFIX + userKeyFromSession(session), '1');
            } catch {}
            return result;
        };
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
                width: min(480px, 100%) !important;
                min-height: 0 !important;
                display: block !important;
            }

            .auth-product-shell > .auth-container {
                margin-inline: auto !important;
            }

            body.product-welcome-open {
                overflow: auto !important;
            }
        `;
        document.head.appendChild(style);
    }

    function removeAuthPromo() {
        const container = document.querySelector('.auth-container');
        document.querySelectorAll('.auth-product-story').forEach(element => element.remove());
        if (!container) return;

        const shell = container.closest('.auth-product-shell');
        if (!shell || !shell.parentNode) return;
        shell.parentNode.insertBefore(container, shell);
        shell.remove();
    }

    function removeWelcomePromo() {
        markWelcomeSeen();
        document.getElementById('productWelcomeModal')?.remove();
        document.body?.classList.remove('product-welcome-open');

        if (window.BibliotechProductPolish?.showWelcome) {
            window.BibliotechProductPolish.showWelcome = function disabledWelcomePromo() {};
        }
    }

    function apply() {
        injectStyles();
        removeAuthPromo();
        removeWelcomePromo();
    }

    function init() {
        suppressWelcomeForNewSession();
        apply();
        if (!document.body || !('MutationObserver' in window)) return;

        const observer = new MutationObserver(apply);
        observer.observe(document.body, {
            childList: true,
            attributes: true,
            attributeFilter: ['class']
        });

        [100, 400, 900, 1600, 3000].forEach(delay => window.setTimeout(apply, delay));
        window.setTimeout(() => {
            apply();
            observer.disconnect();
        }, 5000);
    }

    suppressWelcomeForNewSession();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
