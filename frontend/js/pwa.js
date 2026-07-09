(function () {
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) document.documentElement.classList.add('pwa-standalone');

    var path = window.location.pathname || '';
    var isHomePage = /(^|\/)home\.html$/.test(path) || path === '/' || path === '';
    if (isHomePage && !window.__bibliotechBookDetailPolishLoading) {
        window.__bibliotechBookDetailPolishLoading = true;
        var polishLink = document.createElement('link');
        polishLink.rel = 'stylesheet';
        polishLink.href = 'css/book-detail-polish.css?v=20260709-book-detail-1';
        document.head.appendChild(polishLink);
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