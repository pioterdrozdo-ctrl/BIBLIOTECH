(function () {
    var PROFILE_OPEN_KEY = 'bibliotech_open_profile';
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) document.documentElement.classList.add('pwa-standalone');

    var path = window.location.pathname || '';
    var isHomePage = /(^|\/)home\.html$/.test(path);
    var isAdminPage = /(^|\/)admin\.html$/.test(path);
    var isAuthPage = /(^|\/)index\.html$/.test(path) || path === '/' || path === '';

    function loadScript(src, key) {
        if (window[key]) return;
        window[key] = true;
        var script = document.createElement('script');
        script.src = src;
        script.defer = true;
        document.head.appendChild(script);
    }

    function wireAdminProfileLink() {
        var pill = document.getElementById('currentUserPill');
        if (!pill || pill.dataset.profileBridgeReady === 'true') return;
        pill.dataset.profileBridgeReady = 'true';
        pill.title = 'Открыть профиль';
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
            if (isAdminPage) wireAdminProfileLink();
            if (isHomePage) openPendingProfile();
        });
    } else {
        if (isAdminPage) wireAdminProfileLink();
        if (isHomePage) openPendingProfile();
    }

    if (isAuthPage) {
        loadScript('js/auth-reset-fix.js?v=20260710-login-click-fix-1', '__bibliotechAuthResetFixLoading');
        loadScript('js/auth-2fa.js?v=20260709-2fa-login-2', '__bibliotechAuth2faLoading');
    }

    if (isHomePage && !window.__bibliotechBookDetailPolishLoading) {
        window.__bibliotechBookDetailPolishLoading = true;
        var polishLink = document.createElement('link');
        polishLink.rel = 'stylesheet';
        polishLink.href = 'css/book-detail-polish.css?v=20260709-book-detail-scroll-1';
        document.head.appendChild(polishLink);
    }

    if (isHomePage) {
        loadScript('js/profile-rentals.js?v=20260709-profile-rentals-1', '__bibliotechProfileRentalsLoading');
        loadScript('js/profile-security.js?v=20260709-profile-security-1', '__bibliotechProfileSecurityLoading');
        loadScript('js/profile-compact.js?v=20260709-profile-settings-modal-1', '__bibliotechProfileCompactLoading');
        loadScript('js/catalog-fix.js?v=20260709-cover-perf-1', '__bibliotechCatalogFixLoading');
    }

    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(function (registration) {
                return registration.update();
            })
            .catch(function (error) {
                console.warn('[BIBLIOTECH] Service worker registration failed:', error);
            });
    });
})();