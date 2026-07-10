(function () {
    var PROFILE_OPEN_KEY = 'bibliotech_open_profile';
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) document.documentElement.classList.add('pwa-standalone');

    var path = window.location.pathname || '';
    var isHomePage = /(^|\/)home\.html$/.test(path);
    var isAdminPage = /(^|\/)admin\.html$/.test(path);
    var isAuthPage = /(^|\/)index\.html$/.test(path) || path === '/' || path === '';

    function assetPath(value) {
        try { return new URL(value, document.baseURI).pathname; }
        catch (e) { return String(value || '').split('?')[0]; }
    }

    function hasAsset(selector, attribute, value) {
        var target = assetPath(value);
        return Array.from(document.querySelectorAll(selector)).some(function (element) {
            return assetPath(element.getAttribute(attribute) || '') === target;
        });
    }

    function loadScript(src, key) {
        if (window[key] || hasAsset('script[src]', 'src', src)) {
            window[key] = true;
            return;
        }
        window[key] = true;
        var script = document.createElement('script');
        script.src = src;
        script.async = false;
        document.head.appendChild(script);
    }

    function loadStylesheet(href, key) {
        if (window[key] || hasAsset('link[rel="stylesheet"][href]', 'href', href)) {
            window[key] = true;
            return;
        }
        window[key] = true;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    function installThemeControllerBridge() {
        var controller = window.BibliotechTheme;
        if (!controller) return;

        var reapply = function () {
            var state = controller.getState();
            controller.apply(state.theme, state.mode, { persist: false, emit: false });
            controller.bindControls();
        };

        window.applyTheme = function (theme) {
            var state = controller.getState();
            return controller.apply(theme, state.mode, { persist: false });
        };
        window.setupTheme = reapply;
        window.applyAuthTheme = function (theme) {
            var state = controller.getState();
            return controller.apply(theme, state.mode, { persist: false });
        };
        window.setupAuthTheme = reapply;
    }

    installThemeControllerBridge();

    function wireAdminProfileLink() {
        var pill = document.getElementById('currentUserPill');
        if (!pill || pill.dataset.profileBridgeReady === 'true') return;
        pill.dataset.profileBridgeReady = 'true';
        pill.title = 'Открыть полноценный профиль';
        pill.addEventListener('click', function () {
            try { localStorage.setItem(PROFILE_OPEN_KEY, '1'); } catch (e) {}
            window.location.href = 'home.html#profile';
        });
    }

    function clearProfileHash() {
        if (window.location.hash !== '#profile' || !window.history?.replaceState) return;
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    function openPendingProfile() {
        var shouldOpen = false;
        try {
            shouldOpen = localStorage.getItem(PROFILE_OPEN_KEY) === '1' || window.location.hash === '#profile';
            localStorage.removeItem(PROFILE_OPEN_KEY);
        } catch (e) {
            shouldOpen = window.location.hash === '#profile';
        }
        if (!shouldOpen) return;

        var attempts = 0;
        var timer = setInterval(function () {
            attempts += 1;
            var pill = document.getElementById('currentUserPill');
            var modal = document.getElementById('profileModal');
            if (pill && modal) {
                pill.click();
                clearProfileHash();
                clearInterval(timer);
                return;
            }
            if (attempts > 20) {
                clearProfileHash();
                clearInterval(timer);
            }
        }, 120);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            installThemeControllerBridge();
            window.BibliotechTheme?.bindControls();
            if (isAdminPage) wireAdminProfileLink();
            if (isHomePage) openPendingProfile();
        });
    } else {
        installThemeControllerBridge();
        window.BibliotechTheme?.bindControls();
        if (isAdminPage) wireAdminProfileLink();
        if (isHomePage) openPendingProfile();
    }

    loadScript('js/product-polish.js?v=20260710-product-polish-2', '__bibliotechProductPolishLoading');

    if (isAuthPage) {
        loadScript('js/auth-reset-fix.js?v=20260710-login-click-fix-1', '__bibliotechAuthResetFixLoading');
        loadScript('js/auth-2fa.js?v=20260709-2fa-login-2', '__bibliotechAuth2faLoading');
    }

    if (isHomePage && !window.__bibliotechBookDetailPolishLoading) {
        window.__bibliotechBookDetailPolishLoading = true;
        loadStylesheet('css/book-detail-polish.css?v=20260709-book-detail-scroll-1', '__bibliotechBookDetailPolishCss');
        loadStylesheet('css/book-detail-hide-meta.css?v=20260710-hide-inner-badges-1', '__bibliotechBookDetailHideMetaCss');
        loadStylesheet('css/book-detail-desktop-compact.css?v=20260710-inner-card-refined-1', '__bibliotechBookDetailDesktopCompactCss');
        loadStylesheet('css/modal-close-gradient-fix.css?v=20260710-modal-close-gradient-1', '__bibliotechModalCloseGradientFixCss');
    }

    if (isHomePage) {
        loadScript('js/book-metadata.js?v=20260710-book-metadata-1', '__bibliotechBookMetadataLoading');
        loadScript('js/reservation-queue.js?v=20260710-reservation-queue-1', '__bibliotechReservationQueueLoading');
        loadScript('js/rentals-request-guard.js?v=20260710-rentals-guard-1', '__bibliotechRentalsRequestGuardLoading');
        loadScript('js/profile-rentals.js?v=20260709-profile-rentals-1', '__bibliotechProfileRentalsLoading');
        loadScript('js/profile-reservations.js?v=20260710-profile-reservations-1', '__bibliotechProfileReservationsLoading');
        loadScript('js/profile-twitter.js?v=20260710-profile-customize-modal-1', '__bibliotechProfileTwitterLoading');
        loadScript('js/profile-customization-modal.js?v=20260710-profile-customize-modal-1', '__bibliotechProfileCustomizationLoading');
        loadScript('js/profile-settings-modal.js?v=20260710-profile-settings-2', '__bibliotechProfileSettingsLoading');
        loadScript('js/account-settings-close-guard.js?v=20260710-account-settings-close-1', '__bibliotechAccountSettingsCloseGuardLoading');
        loadScript('js/profile-security.js?v=20260710-profile-security-modal-1', '__bibliotechProfileSecurityLoading');
        loadScript('js/account-settings-features.js?v=20260710-account-settings-1', '__bibliotechAccountSettingsFeaturesLoading');
        loadScript('js/modal-visual-fix.js?v=20260710-modal-visual-fix-2', '__bibliotechModalVisualFixLoading');
        loadScript('js/card-rent-safe.js?v=20260710-card-rent-refined-2', '__bibliotechCardRentSafeLoading');
        loadScript('js/comment-clear-fix.js?v=20260710-comment-clear-1', '__bibliotechCommentClearFixLoading');
    }

    loadStylesheet('css/ui-refresh.css?v=20260710-ui-refresh-1', '__bibliotechUiRefreshCss');
    loadStylesheet('css/ui-refresh-release-fix.css?v=20260710-ui-release-fix-2', '__bibliotechUiReleaseFixCss');
    loadStylesheet('css/product-polish.css?v=20260710-product-polish-1', '__bibliotechProductPolishCss');

    if (isHomePage) {
        loadStylesheet('css/profile-twitter-restored.css?v=20260710-profile-evolved-2', '__bibliotechProfileTwitterRestoredCss');
        loadStylesheet('css/profile-customization-modal.css?v=20260710-profile-customize-modal-1', '__bibliotechProfileCustomizationCss');
        loadStylesheet('css/profile-settings-modal.css?v=20260710-profile-settings-1', '__bibliotechProfileSettingsCss');
        loadStylesheet('css/account-settings-features.css?v=20260710-account-settings-1', '__bibliotechAccountSettingsFeaturesCss');
        loadStylesheet('css/home-minimal.css?v=20260710-home-minimal-1', '__bibliotechHomeMinimalCss');
        loadStylesheet('css/book-metadata.css?v=20260710-book-metadata-1', '__bibliotechBookMetadataCss');
        loadStylesheet('css/reservation-queue.css?v=20260710-reservation-queue-1', '__bibliotechReservationQueueCss');
    }

    loadStylesheet('css/theme-mode-preview.css?v=20260710-theme-mode-preview-1', '__bibliotechThemeModePreviewCss');
    loadStylesheet('css/liquid-theme-toggle.css?v=20260710-liquid-theme-2', '__bibliotechLiquidThemeToggleCss');
    loadStylesheet('css/commercial-polish.css?v=20260710-commercial-polish-1', '__bibliotechCommercialPolishCss');

    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(function (registration) { return registration.update(); })
            .catch(function (error) { console.warn('[BIBLIOTECH] Service worker registration failed:', error); });
    });
})();
