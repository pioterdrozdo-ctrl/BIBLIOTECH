(function () {
    'use strict';

    if (window.__bibliotechRentalsRequestGuardReady) return;
    window.__bibliotechRentalsRequestGuardReady = true;

    const nativeFetch = window.fetch.bind(window);
    const CACHE_TTL_MS = 900;
    let inFlight = null;
    let cachedResponse = null;
    let cachedAt = 0;

    function isRentalsRequest(input, init = {}) {
        const rawUrl = typeof input === 'string' ? input : input?.url;
        const method = String(init.method || input?.method || 'GET').toUpperCase();
        if (!rawUrl || method !== 'GET') return false;
        try {
            return new URL(rawUrl, window.location.href).pathname === '/api/rentals/me';
        } catch {
            return false;
        }
    }

    function clearCache() {
        cachedResponse = null;
        cachedAt = 0;
    }

    window.fetch = function guardedFetch(input, init) {
        if (!isRentalsRequest(input, init)) return nativeFetch(input, init);

        const now = Date.now();
        if (cachedResponse && now - cachedAt < CACHE_TTL_MS) {
            return Promise.resolve(cachedResponse.clone());
        }

        if (!inFlight) {
            inFlight = nativeFetch(input, init)
                .then(response => {
                    if (response.ok) {
                        cachedResponse = response.clone();
                        cachedAt = Date.now();
                    }
                    return response;
                })
                .finally(() => {
                    queueMicrotask(() => { inFlight = null; });
                });
        }

        return inFlight.then(response => response.clone());
    };

    document.addEventListener('bibliotech:rentals-changed', clearCache);
    window.BibliotechRentalsRequestGuard = { clear: clearCache };
})();
