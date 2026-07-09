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

    const coverRequests = new Set();

    function norm(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zа-я0-9\s]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isDemo(book) {
        return demoKeys.has(`${norm(book.title)}::${norm(book.author)}`);
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
        }[char]));
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
        const card = document.querySelector(`.book-card[data-id="${CSS.escape(String(book.id))}"]`);
        const cover = card && card.querySelector('.book-cover');
        if (!cover) return;

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

    function fetchAndSetCardCover(card) {
        const bookId = card && card.dataset ? card.dataset.id : '';
        if (!bookId || coverRequests.has(bookId)) return;

        const cover = card.querySelector('.book-cover');
        if (!cover || cover.querySelector('img')) return;

        coverRequests.add(bookId);
        const token = localStorage.getItem('token');
        fetch(`/api/books/${encodeURIComponent(bookId)}`, {
            headers: { Authorization: token ? `Bearer ${token}` : '' }
        })
            .then(response => response.ok ? response.json() : null)
            .then(book => {
                const coverDataURL = getCoverDataURL(book);
                if (book && coverDataURL) setCardCover(book, coverDataURL);
            })
            .catch(() => {});
    }

    function forceCardCoverImages() {
        document.querySelectorAll('.book-cover-img').forEach(tuneCoverImage);
        document.querySelectorAll('.book-card[data-id]').forEach(fetchAndSetCardCover);
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
            setTimeout(forceCardCoverImages, 0);
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
                        setCardCover(book, coverDataURL);
                        if (typeof window.renderBookQr === 'function') {
                            window.renderBookQr({ ...book, coverDataURL });
                        }
                    }
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', forceCardCoverImages);
    } else {
        forceCardCoverImages();
    }
    setTimeout(forceCardCoverImages, 300);
    setTimeout(forceCardCoverImages, 1000);
})();