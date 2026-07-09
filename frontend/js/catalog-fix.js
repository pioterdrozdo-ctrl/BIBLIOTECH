(function () {
    const demoKeys = new Set([
        ['Мастер и Маргарита', 'Михаил Булгаков'],
        ['Преступление и наказание', 'Фёдор Достоевский'],
        ['Преступление и наказание', 'Федор Достоевский'],
        ['1984', 'Джордж Оруэлл'],
        ['Алхимик', 'Пауло Коэльо'],
        ['Маленький принц', 'Антуан де Сент-Экзюпери'],
        ['Война и мир', 'Лев Толстой']
    ].map(([title, author]) => `${norm(title)}::${norm(author)}`));

    const MAX_COVER_REQUESTS = 4;
    const coverCache = new Map();
    const activeCoverRequests = new Set();
    const queuedCoverRequests = new Set();
    const coverQueue = [];
    let runningCoverRequests = 0;
    let observer = null;
    let observerTarget = null;
    let scheduled = false;

    function norm(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zа-я0-9\s]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function cssEscape(value) {
        const text = String(value || '');
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(text);
        return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function isDemo(book) {
        return demoKeys.has(`${norm(book.title)}::${norm(book.author)}`);
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
        }[char]));
    }

    function removeHomeAdminPanel() {
        document.getElementById('adminPanel')?.remove();
    }

    function getCoverDataURL(book) {
        return book && (
            book.coverDataURL
            || book.cover_data_url
            || book.coverDataUrl
            || book.cover
            || book.coverUrl
            || book.image
            || book.imageUrl
            || null
        );
    }

    function rememberCover(book, coverDataURL) {
        if (!book || !book.id || !coverDataURL) return;
        coverCache.set(String(book.id), {
            id: book.id,
            title: book.title || '',
            coverDataURL
        });
    }

    function makeCoverImage(book, coverDataURL) {
        const img = document.createElement('img');
        img.className = 'book-cover-img';
        img.src = coverDataURL;
        img.alt = book && book.title ? String(book.title) : 'Обложка книги';
        img.loading = 'eager';
        img.decoding = 'async';
        img.setAttribute('fetchpriority', 'high');
        return img;
    }

    function tuneCoverImage(img) {
        if (!img) return;
        img.loading = 'eager';
        img.decoding = 'async';
        img.setAttribute('loading', 'eager');
        img.setAttribute('decoding', 'async');
        img.setAttribute('fetchpriority', 'high');
        if (img.dataset.src && !img.src) img.src = img.dataset.src;
    }

    function setCardCover(book, coverDataURL) {
        if (!book || !coverDataURL) return;
        const card = document.querySelector(`.book-card[data-id="${cssEscape(book.id)}"]`);
        const cover = card && card.querySelector('.book-cover');
        if (!cover) return;

        rememberCover(book, coverDataURL);

        const existing = cover.querySelector('img');
        if (existing) {
            existing.src = coverDataURL;
            existing.alt = book.title || existing.alt || 'Обложка книги';
            tuneCoverImage(existing);
            return;
        }

        cover.innerHTML = '';
        cover.appendChild(makeCoverImage(book, coverDataURL));
    }

    function rememberExistingCover(bookId, img) {
        tuneCoverImage(img);
        if (img.src) {
            coverCache.set(String(bookId), {
                id: bookId,
                title: img.alt || '',
                coverDataURL: img.src
            });
        }
    }

    function requestBookCover(bookId) {
        if (!bookId || activeCoverRequests.has(bookId) || queuedCoverRequests.has(bookId) || coverCache.has(bookId)) return;
        queuedCoverRequests.add(bookId);
        coverQueue.push(bookId);
        drainCoverQueue();
    }

    function drainCoverQueue() {
        while (runningCoverRequests < MAX_COVER_REQUESTS && coverQueue.length) {
            const bookId = coverQueue.shift();
            queuedCoverRequests.delete(bookId);
            if (!bookId || activeCoverRequests.has(bookId) || coverCache.has(bookId)) continue;

            activeCoverRequests.add(bookId);
            runningCoverRequests += 1;
            const token = localStorage.getItem('token');

            fetch(`/api/books/${encodeURIComponent(bookId)}`, {
                headers: { Authorization: token ? `Bearer ${token}` : '' }
            })
                .then(response => response.ok ? response.json() : null)
                .then(book => {
                    const coverDataURL = getCoverDataURL(book);
                    if (book && coverDataURL) {
                        rememberCover(book, coverDataURL);
                        setCardCover(book, coverDataURL);
                    }
                })
                .catch(() => {})
                .finally(() => {
                    activeCoverRequests.delete(bookId);
                    runningCoverRequests = Math.max(0, runningCoverRequests - 1);
                    drainCoverQueue();
                });
        }
    }

    function fixCardCover(card) {
        const bookId = card && card.dataset ? String(card.dataset.id || '') : '';
        if (!bookId) return;

        const cover = card.querySelector('.book-cover');
        if (!cover) return;

        const existing = cover.querySelector('img');
        if (existing) {
            rememberExistingCover(bookId, existing);
            return;
        }

        const cached = coverCache.get(bookId);
        if (cached && cached.coverDataURL) {
            setCardCover(cached, cached.coverDataURL);
            return;
        }

        requestBookCover(bookId);
    }

    function forceCardCoverImages() {
        scheduled = false;
        removeHomeAdminPanel();
        const cards = document.querySelectorAll('.book-card[data-id]');
        if (!cards.length) return;
        cards.forEach(fixCardCover);
    }

    function scheduleForceCardCoverImages(delay = 0) {
        if (scheduled) return;
        scheduled = true;
        const run = forceCardCoverImages;
        if (delay > 0) {
            setTimeout(run, delay);
            return;
        }
        if (window.requestAnimationFrame) requestAnimationFrame(run);
        else setTimeout(run, 0);
    }

    function getObserverRoot() {
        return document.getElementById('booksContainer')
            || document.getElementById('catalog')
            || document.body;
    }

    function startCoverObserver() {
        if (!window.MutationObserver || !document.body) return;
        const target = getObserverRoot();
        if (!target || target === observerTarget) return;

        if (observer) observer.disconnect();
        observerTarget = target;
        observer = new MutationObserver(mutations => {
            if (mutations.some(item => item.addedNodes && item.addedNodes.length)) {
                scheduleForceCardCoverImages(80);
            }
        });
        observer.observe(target, { childList: true, subtree: true });
    }

    try {
        localStorage.removeItem('book_catalog_v18');
    } catch {}

    window.__bibliotechDemoBooksDisabled = function demoBooksDisabled() {
        return [];
    };

    const originalSaveBooks = window.saveBooks;
    if (typeof originalSaveBooks === 'function') {
        window.__bibliotechSaveBooksWithoutDemo = function saveBooksWithoutDemo() {
            const result = originalSaveBooks.apply(this, arguments);
            try {
                const raw = localStorage.getItem('book_catalog_v18');
                const books = raw ? JSON.parse(raw) : [];
                if (Array.isArray(books)) {
                    localStorage.setItem('book_catalog_v18', JSON.stringify(books.filter(book => !isDemo(book))));
                }
            } catch {}
            return result;
        };
    }

    const originalRenderBooks = window.renderBooks;
    if (typeof originalRenderBooks === 'function') {
        window.__bibliotechRenderBooksWithCovers = function renderBooksWithCovers() {
            const result = originalRenderBooks.apply(this, arguments);
            startCoverObserver();
            scheduleForceCardCoverImages(0);
            return result;
        };
    }

    const originalOpenBook = window.openBook;
    if (typeof originalOpenBook === 'function') {
        window.__bibliotechOpenBookWithCover = function openBookWithCover(bookId) {
            const result = originalOpenBook.apply(this, arguments);
            const token = localStorage.getItem('token');
            fetch(`/api/books/${encodeURIComponent(bookId)}`, {
                headers: { Authorization: token ? `Bearer ${token}` : '' }
            })
                .then(response => response.ok ? response.json() : null)
                .then(book => {
                    const coverDataURL = getCoverDataURL(book);
                    const cover = document.querySelector('#viewCover');
                    if (cover && coverDataURL) {
                        cover.innerHTML = `<img src="${coverDataURL}" alt="${escapeHtml(book.title || '')}" loading="eager" decoding="async" fetchpriority="high">`;
                    }
                    if (book && coverDataURL) {
                        rememberCover(book, coverDataURL);
                        setCardCover(book, coverDataURL);
                        if (typeof window.renderBookQr === 'function') {
                            window.renderBookQr({ ...book, coverDataURL });
                        }
                    }
                    scheduleForceCardCoverImages(0);
                })
                .catch(() => {});
            return result;
        };
    }

    try {
        window.eval('demoBooks = window.__bibliotechDemoBooksDisabled;');
        if (window.__bibliotechSaveBooksWithoutDemo) {
            window.eval('saveBooks = window.__bibliotechSaveBooksWithoutDemo;');
        }
        if (window.__bibliotechRenderBooksWithCovers) {
            window.eval('renderBooks = window.__bibliotechRenderBooksWithCovers;');
        }
        if (window.__bibliotechOpenBookWithCover) {
            window.eval('openBook = window.__bibliotechOpenBookWithCover;');
        }
    } catch {}

    removeHomeAdminPanel();
    startCoverObserver();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            startCoverObserver();
            forceCardCoverImages();
        });
    } else {
        forceCardCoverImages();
    }
    setTimeout(forceCardCoverImages, 300);
    setTimeout(forceCardCoverImages, 1200);
})();