(function () {
    'use strict';

    function closeSettings(event) {
        const target = event.target instanceof Element ? event.target : null;
        const closeButton = target?.closest('#accountSettingsCloseBtn');
        if (!closeButton) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        window.BibliotechSettings?.close?.();
    }

    document.addEventListener('click', closeSettings, true);
})();
