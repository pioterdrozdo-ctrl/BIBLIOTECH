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
                    const coverDataURL = book && (book.coverDataURL || book.cover_data_url || book.coverDataUrl);
                    const cover = document.querySelector('#viewCover');
                    if (!cover || !coverDataURL) return;
                    cover.innerHTML = `<img src="${coverDataURL}" alt="${escapeHtml(book.title || '')}">`;
                    if (typeof window.renderBookQr === 'function') {
                        window.renderBookQr({ ...book, coverDataURL });
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
        if (window.__bibliotechOpenBookWithCover) {
            window.eval('openBook = window.__bibliotechOpenBookWithCover;');
        }
    } catch {}
})();
