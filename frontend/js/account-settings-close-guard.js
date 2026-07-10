(function () {
    'use strict';

    function handleSettingsAction(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        if (target.closest('#accountSettingsCloseBtn')) {
            event.preventDefault();
            event.stopImmediatePropagation();
            window.BibliotechSettings?.close?.();
            return;
        }

        if (target.closest('#accountSettingsEditProfileBtn')) {
            event.preventDefault();
            event.stopImmediatePropagation();
            window.BibliotechSettings?.close?.({ restoreFocus: false });
            setTimeout(() => window.BibliotechProfile?.openCustomize?.(), 200);
        }
    }

    document.addEventListener('click', handleSettingsAction, true);
})();
