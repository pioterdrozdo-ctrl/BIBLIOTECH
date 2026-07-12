(function () {
    const NAV_LABELS = {
        ru: { home: 'Главная', map: 'Карта', stats: 'Статистика', about: 'О нас' },
        en: { home: 'Home', map: 'Map', stats: 'Statistics', about: 'About' },
        uk: { home: 'Головна', map: 'Карта', stats: 'Статистика', about: 'Про нас' },
        de: { home: 'Startseite', map: 'Karte', stats: 'Statistik', about: 'Über uns' },
        kk: { home: 'Басты бет', map: 'Карта', stats: 'Статистика', about: 'Біз туралы' },
        es: { home: 'Inicio', map: 'Mapa', stats: 'Estadística', about: 'Sobre nosotros' },
        zh: { home: '首页', map: '地图', stats: '统计', about: '关于我们' }
    };

    function currentLanguage() {
        return localStorage.getItem('bibliotech_language')
            || document.documentElement.lang
            || 'ru';
    }

    function ensureNavigationLabels() {
        const nav = document.getElementById('navMenu');
        if (!nav) return;

        const labels = NAV_LABELS[currentLanguage()] || NAV_LABELS.ru;
        const links = {
            home: nav.querySelector('a[href^="home.html"]'),
            map: nav.querySelector('a[href="map.html"]'),
            stats: nav.querySelector('a[href="stats.html"]'),
            about: nav.querySelector('a[href="about.html"]')
        };

        Object.entries(links).forEach(([key, link]) => {
            if (link && link.textContent !== labels[key]) link.textContent = labels[key];
        });
    }

    function watchNavigation() {
        const nav = document.getElementById('navMenu');
        if (!nav) return;

        ensureNavigationLabels();
        const observer = new MutationObserver(ensureNavigationLabels);
        observer.observe(nav, { childList: true, subtree: true, characterData: true });
        document.querySelectorAll('.lang-option').forEach(button => {
            button.addEventListener('click', () => setTimeout(ensureNavigationLabels, 0));
        });
    }

    function ensureMapButton() {
        const placementCard = document.querySelector('.book-placement-card');
        if (!placementCard || document.getElementById('showBookOnMapButton')) return;
        const button = document.createElement('button');
        button.id = 'showBookOnMapButton';
        button.type = 'button';
        button.className = 'rent-book-btn show-book-map-button';
        button.textContent = '⌖ Показать на карте';
        button.addEventListener('click', () => {
            const bookId = Number(document.getElementById('viewModal')?.dataset.bookId);
            if (!Number.isSafeInteger(bookId) || bookId <= 0) return;
            window.location.assign(`map-lite.html?book=${encodeURIComponent(bookId)}`);
        });
        placementCard.appendChild(button);
    }

    function init() {
        ensureMapButton();
        watchNavigation();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
