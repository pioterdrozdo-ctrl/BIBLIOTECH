(function () {
    var PROFILE_OPEN_KEY = 'bibliotech_open_profile';
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) document.documentElement.classList.add('pwa-standalone');

    var path = window.location.pathname || '';
    var isHomePage = /(^|\/)home\.html$/.test(path) || path === '/' || path === '';
    var isAdminPage = /(^|\/)admin\.html$/.test(path);

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

    if (isHomePage && !window.__bibliotechBookDetailPolishLoading) {
        window.__bibliotechBookDetailPolishLoading = true;
        var polishLink = document.createElement('link');
        polishLink.rel = 'stylesheet';
        polishLink.href = 'css/book-detail-polish.css?v=20260709-book-detail-scroll-1';
        document.head.appendChild(polishLink);
    }

    if (isHomePage && !window.__bibliotechProfileRentalsLoading) {
        window.__bibliotechProfileRentalsLoading = true;
        var rentalsScript = document.createElement('script');
        rentalsScript.src = 'js/profile-rentals.js?v=20260709-profile-rentals-1';
        rentalsScript.defer = true;
        document.head.appendChild(rentalsScript);
    }

    if (isHomePage && !window.__bibliotechCatalogFixLoading) {
        window.__bibliotechCatalogFixLoading = true;
        var script = document.createElement('script');
        script.src = 'js/catalog-fix.js?v=20260709-cover-perf-1';
        script.defer = true;
        document.head.appendChild(script);
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