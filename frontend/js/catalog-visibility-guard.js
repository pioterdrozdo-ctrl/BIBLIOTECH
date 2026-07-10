(function () {
    'use strict';

    if (!/(^|\/)home\.html$/.test(window.location.pathname || '')) return;

    const STORAGE_KEY = 'book_catalog_v18';
    let reloadRequested = false;

    function hasExplicitCatalogQuery() {
        const params = new URLSearchParams(window.location.search);
        return ['qr', 'q', 'search', 'book', 'bookId'].some(key => params.has(key));
    }

    function parseCachedBooks() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(value) ? value : [];
        } catch {
            return [];
        }
    }

    function forceVisible(container) {
        container.style.setProperty('display', 'grid', 'important');
        container.style.setProperty('visibility', 'visible', 'important');
        container.style.setProperty('opacity', '1', 'important');

        container.querySelectorAll('.book-card').forEach(card => {
            card.style.setProperty('display', 'flex', 'important');
            card.style.setProperty('visibility', 'visible', 'important');
            card.style.setProperty('opacity', '1', 'important');
        });
    }

    function renderKnownBooks() {
        try {
            if (typeof state !== 'undefined' && Array.isArray(state.books) && state.books.length && typeof renderBooks === 'function') {
                renderBooks({ updateDashboard: false });
                return true;
            }
        } catch {}
        return false;
    }

    function restoreCache() {
        const cached = parseCachedBooks();
        if (!cached.length) return false;

        try {
            if (typeof state === 'undefined' || typeof renderBooks !== 'function') return false;
            state.books = typeof migrateBook === 'function' ? cached.map(migrateBook) : cached;
            renderBooks({ updateDashboard: false });
            if (typeof updateDashboard === 'function') updateDashboard();
            return true;
        } catch {
            return false;
        }
    }

    function clearStaleSearch() {
        if (hasExplicitCatalogQuery()) return false;

        const input = document.getElementById('searchInput');
        const savedSearch = localStorage.getItem('lastSearch') || '';
        const activeSearch = String(input?.value || savedSearch).trim();
        if (!activeSearch) return false;

        localStorage.removeItem('lastSearch');
        if (input) input.value = '';

        try {
            if (typeof state !== 'undefined') state.search = '';
            if (typeof renderBooks === 'function') renderBooks({ updateDashboard: false });
        } catch {
            input?.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
    }

    function showLoadingState(container) {
        if (container.children.length) return;
        container.innerHTML = '<div class="empty-state catalog-recovery-state">📚 Загружаем книги…</div>';
    }

    function recoverCatalog() {
        const container = document.getElementById('booksContainer');
        if (!container) return;

        forceVisible(container);
        if (container.querySelector('.book-card')) return;

        if (clearStaleSearch()) {
            forceVisible(container);
            if (container.querySelector('.book-card')) return;
        }

        if (renderKnownBooks()) {
            forceVisible(container);
            if (container.querySelector('.book-card')) return;
        }

        if (restoreCache()) {
            forceVisible(container);
            if (container.querySelector('.book-card')) return;
        }

        showLoadingState(container);
        if (!reloadRequested && typeof loadBooks === 'function') {
            reloadRequested = true;
            Promise.resolve(loadBooks())
                .catch(error => console.warn('[BIBLIOTECH] Catalog recovery failed:', error))
                .finally(() => {
                    forceVisible(container);
                    if (!container.querySelector('.book-card')) restoreCache();
                });
        }
    }

    function init() {
        const container = document.getElementById('booksContainer');
        if (!container) return;

        forceVisible(container);
        new MutationObserver(() => forceVisible(container)).observe(container, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden']
        });

        window.setTimeout(recoverCatalog, 500);
        window.setTimeout(recoverCatalog, 1600);
        window.setTimeout(recoverCatalog, 3200);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
