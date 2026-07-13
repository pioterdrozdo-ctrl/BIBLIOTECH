const CACHE_NAME = 'bibliotech-pwa-v43-admin-map';
const APP_SHELL = [
    '/',
    '/index.html',
    '/home.html',
    '/stats.html',
    '/about.html',
    '/admin.html',
    '/manifest.webmanifest',
    '/css/auth.css',
    '/css/style.css',
    '/css/ui-refresh.css',
    '/css/ui-refresh-release-fix.css',
    '/css/product-polish.css',
    '/css/home-minimal.css',
    '/css/book-metadata.css',
    '/css/reservation-queue.css',
    '/css/book-import.css',
    '/css/profile-twitter-restored.css',
    '/css/profile-customization-modal.css',
    '/css/profile-settings-modal.css',
    '/css/account-settings-features.css',
    '/css/theme-mode-preview.css',
    '/css/liquid-theme-toggle.css',
    '/css/commercial-polish.css',
    '/css/apple-polish.css',
    '/js/app.js',
    '/js/script.js',
    '/js/catalog-fix.js',
    '/js/theme-bootstrap.js',
    '/js/pwa.js',
    '/js/product-polish.js',
    '/js/book-metadata.js',
    '/js/reservation-queue.js',
    '/js/admin.js',
    '/js/book-import.js',
    '/js/rentals-request-guard.js',
    '/js/profile-rentals.js',
    '/js/profile-reservations.js',
    '/js/profile-twitter.js',
    '/js/profile-customization-modal.js',
    '/js/profile-settings-modal.js',
    '/js/account-settings-close-guard.js',
    '/js/profile-security.js',
    '/js/account-settings-features.js',
    '/js/card-rent-safe.js',
    '/vendor/jsQR.js',
    '/vendor/qrcode-generator.js',
    '/vendor/three/build/three.module.js',
    '/vendor/three/examples/jsm/controls/OrbitControls.js',
    '/img/appicon.png',
    '/img/appicon-system-v2.png',
    '/img/appicon-light.png',
    '/img/appicon-dark.png',
    '/img/appicon-forest.png',
    '/img/appicon-ocean.png',
    '/img/appicon-sunset.png',
    '/img/appicon-violet.png',
    '/img/appicon-coffee.png',
    '/img/appicon-mono.png',
    '/img/DefaultImage.png',
    '/img/lupa.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.all(APP_SHELL.map(url => cache.add(url).catch(() => null))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isApiRequest(url) {
    return url.pathname.startsWith('/api/');
}

function isAppAsset(request) {
    return ['document', 'script', 'style', 'manifest'].includes(request.destination);
}

function isStaticAsset(request) {
    return ['image', 'font'].includes(request.destination);
}

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response && response.ok) cache.put(request, response.clone());
        return response;
    } catch {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate' || request.destination === 'document') {
            return cache.match('/index.html');
        }
        return Response.error();
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (isApiRequest(url)) {
        event.respondWith(fetch(request, { cache: 'no-store' }));
        return;
    }

    if (request.mode === 'navigate' || isAppAsset(request)) {
        event.respondWith(networkFirst(request));
        return;
    }

    if (isStaticAsset(request)) {
        event.respondWith(cacheFirst(request));
    }
});
