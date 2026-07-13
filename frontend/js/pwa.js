(function () {
    var PROFILE_OPEN_KEY = 'bibliotech_open_profile';
    var LANGUAGE_KEY = 'bibliotech_language';
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) document.documentElement.classList.add('pwa-standalone');

    var path = window.location.pathname || '';
    var isHomePage = /(^|\/)home\.html$/.test(path);
    var isAuthPage = /(^|\/)index\.html$/.test(path) || path === '/' || path === '';
    var isSecondaryPage = !isHomePage && !isAuthPage;

    var NAV_LABELS = {
        ru: { home: 'Главная', map: 'Карта', stats: 'Статистика', about: 'О нас', admin: 'Админ' },
        en: { home: 'Home', map: 'Map', stats: 'Statistics', about: 'About', admin: 'Admin' },
        uk: { home: 'Головна', map: 'Карта', stats: 'Статистика', about: 'Про нас', admin: 'Адмін' },
        de: { home: 'Startseite', map: 'Karte', stats: 'Statistik', about: 'Über uns', admin: 'Admin' },
        kk: { home: 'Басты бет', map: 'Карта', stats: 'Статистика', about: 'Біз туралы', admin: 'Әкімші' },
        es: { home: 'Inicio', map: 'Mapa', stats: 'Estadística', about: 'Sobre nosotros', admin: 'Admin' },
        zh: { home: '首页', map: '地图', stats: '统计', about: '关于我们', admin: '管理' }
    };

    function currentLanguage() {
        try { return localStorage.getItem(LANGUAGE_KEY) || document.documentElement.lang || 'ru'; }
        catch (e) { return document.documentElement.lang || 'ru'; }
    }

    function navigationKey(link) {
        var href = link.getAttribute('href') || '';
        var pathname = '';
        try { pathname = new URL(href, document.baseURI).pathname; }
        catch (e) { pathname = href.split(/[?#]/)[0]; }
        if (/(^|\/)home\.html$/.test(pathname) || pathname === '/') return 'home';
        if (/(^|\/)map\.html$/.test(pathname)) return 'map';
        if (/(^|\/)stats\.html$/.test(pathname)) return 'stats';
        if (/(^|\/)about\.html$/.test(pathname)) return 'about';
        if (/(^|\/)admin\.html$/.test(pathname)) return 'admin';
        return '';
    }

    function currentNavigationKey() {
        if (/(^|\/)map(?:-lite)?\.html$/.test(path)) return 'map';
        if (/(^|\/)stats\.html$/.test(path)) return 'stats';
        if (/(^|\/)about\.html$/.test(path)) return 'about';
        if (/(^|\/)admin\.html$/.test(path)) return 'admin';
        if (/(^|\/)home\.html$/.test(path)) return 'home';
        return '';
    }

    function syncNavigation() {
        var labels = NAV_LABELS[currentLanguage()] || NAV_LABELS.ru;
        var activeKey = currentNavigationKey();
        document.querySelectorAll('#navMenu, #mapNav').forEach(function (nav) {
            nav.querySelectorAll('a[href]').forEach(function (link) {
                var key = navigationKey(link);
                if (!key) return;
                if (link.textContent.trim() !== labels[key]) link.textContent = labels[key];
                var item = link.closest('li');
                var active = Boolean(activeKey && key === activeKey);
                if (item) item.classList.toggle('active', active);
                if (active) link.setAttribute('aria-current', 'page');
                else link.removeAttribute('aria-current');
            });
        });
    }

    function installNavigationGuard() {
        syncNavigation();
        document.querySelectorAll('#navMenu, #mapNav').forEach(function (nav) {
            if (nav.dataset.navigationGuardReady === 'true') return;
            nav.dataset.navigationGuardReady = 'true';
            new MutationObserver(syncNavigation).observe(nav, {
                childList: true,
                subtree: true,
                characterData: true
            });
        });
        document.querySelectorAll('.lang-option').forEach(function (button) {
            if (button.dataset.navigationGuardReady === 'true') return;
            button.dataset.navigationGuardReady = 'true';
            button.addEventListener('click', function () { setTimeout(syncNavigation, 0); });
        });
        window.addEventListener('storage', function (event) {
            if (event.key === LANGUAGE_KEY) syncNavigation();
        });
    }

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

    function wireSecondaryProfileLinks() {
        document.querySelectorAll('#currentUserPill, #mapCurrentUser').forEach(function (pill) {
            if (pill.dataset.productProfileLinkReady === 'true' || pill.dataset.profileBridgeReady === 'true') return;
            pill.dataset.profileBridgeReady = 'true';
            pill.title = 'Открыть полноценный профиль';
            pill.addEventListener('click', function (event) {
                event.preventDefault();
                try { localStorage.setItem(PROFILE_OPEN_KEY, '1'); } catch (e) {}
                window.location.href = 'home.html#profile';
            });
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
            installNavigationGuard();
            window.BibliotechTheme?.bindControls();
            if (isSecondaryPage) wireSecondaryProfileLinks();
            if (isHomePage) openPendingProfile();
        });
    } else {
        installThemeControllerBridge();
        installNavigationGuard();
        window.BibliotechTheme?.bindControls();
        if (isSecondaryPage) wireSecondaryProfileLinks();
        if (isHomePage) openPendingProfile();
    }

    loadScript('js/product-polish.js?v=20260710-product-polish-2', '__bibliotechProductPolishLoading');
    loadScript('js/entry-promo-removal.js?v=20260711-entry-promo-removal-1', '__bibliotechEntryPromoRemovalLoading');

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
        loadScript('js/book-metadata.js?v=20260713-book-metadata-4', '__bibliotechBookMetadataLoading');
        loadScript('js/reservation-queue.js?v=20260710-reservation-queue-1', '__bibliotechReservationQueueLoading');
        loadScript('js/rentals-request-guard.js?v=20260710-rentals-guard-1', '__bibliotechRentalsRequestGuardLoading');
        loadScript('js/profile-rentals.js?v=20260709-profile-rentals-1', '__bibliotechProfileRentalsLoading');
        loadScript('js/profile-reservations.js?v=20260710-profile-reservations-1', '__bibliotechProfileReservationsLoading');
        loadScript('js/profile-twitter.js?v=20260710-profile-customize-modal-1', '__bibliotechProfileTwitterLoading');
        loadScript('js/profile-customization-modal.js?v=20260710-profile-customize-modal-1', '__bibliotechProfileCustomizationLoading');
        loadScript('js/profile-banner-save-fix.js?v=20260710-profile-banner-save-2', '__bibliotechProfileBannerSaveFixLoading');
        loadScript('js/profile-settings-modal.js?v=20260710-profile-settings-2', '__bibliotechProfileSettingsLoading');
        loadScript('js/account-settings-close-guard.js?v=20260710-account-settings-close-1', '__bibliotechAccountSettingsCloseGuardLoading');
        loadScript('js/profile-security.js?v=20260710-profile-security-modal-1', '__bibliotechProfileSecurityLoading');
        loadScript('js/account-settings-features.js?v=20260710-account-settings-1', '__bibliotechAccountSettingsFeaturesLoading');
        loadScript('js/modal-visual-fix.js?v=20260710-modal-visual-fix-2', '__bibliotechModalVisualFixLoading');
        loadScript('js/card-rent-safe.js?v=20260710-card-rent-refined-2', '__bibliotechCardRentSafeLoading');
        loadScript('js/comment-clear-fix.js?v=20260713-comment-clear-2', '__bibliotechCommentClearFixLoading');
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
        loadStylesheet('css/book-metadata.css?v=20260713-book-metadata-3', '__bibliotechBookMetadataCss');
        loadStylesheet('css/reservation-queue.css?v=20260710-reservation-queue-1', '__bibliotechReservationQueueCss');
    }

    loadStylesheet('css/theme-mode-preview.css?v=20260710-theme-mode-preview-1', '__bibliotechThemeModePreviewCss');
    loadStylesheet('css/liquid-theme-toggle.css?v=20260710-liquid-theme-2', '__bibliotechLiquidThemeToggleCss');
    loadStylesheet('css/commercial-polish.css?v=20260710-commercial-polish-1', '__bibliotechCommercialPolishCss');
    loadStylesheet('css/apple-polish.css?v=20260713-apple-polish-5', '__bibliotechApplePolishCss');
    loadStylesheet('css/stats-spacing-fix.css?v=20260711-stats-spacing-1', '__bibliotechStatsSpacingFixCss');

    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(function (registration) { return registration.update(); })
            .catch(function (error) { console.warn('[BIBLIOTECH] Service worker registration failed:', error); });
    });
})();
