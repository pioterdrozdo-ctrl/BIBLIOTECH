(function () {
    function injectStyles() {
        if (document.getElementById('cardRentSafeStyles')) return;
        const style = document.createElement('style');
        style.id = 'cardRentSafeStyles';
        style.textContent = `
            .book-card .card-actions .guest-note.user-note-hidden {
                display: none !important;
            }

            .book-card .card-rent-safe-btn {
                width: 100%;
                min-height: 42px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                padding: 10px 14px;
                border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
                border-radius: 999px;
                background: linear-gradient(135deg, var(--accent), var(--accent-strong));
                color: var(--on-accent);
                font-weight: 950;
                cursor: pointer;
                box-shadow: 0 12px 26px color-mix(in srgb, var(--accent) 20%, transparent);
                transition: transform .16s ease, filter .16s ease, opacity .16s ease;
            }

            .book-card .card-rent-safe-btn:hover {
                transform: translateY(-1px);
                filter: brightness(1.04);
            }

            .book-card .card-rent-safe-btn.return-mode {
                background: color-mix(in srgb, var(--surface-muted) 88%, var(--accent));
                color: var(--text);
                border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
            }

            .book-card .card-rent-safe-btn:disabled {
                cursor: not-allowed;
                opacity: .58;
                transform: none;
                filter: none;
                background: var(--surface-muted);
                color: var(--muted);
                box-shadow: none;
            }
        `;
        document.head.appendChild(style);
    }

    function isRegularUserNote(note) {
        return /пользователь:\s*просмотр/i.test(note?.textContent || '');
    }

    function getCardRentState(card) {
        const text = card.textContent || '';
        if (/закреплена за вами/i.test(text)) return { label: '↩ Вернуть', disabled: false, returnMode: true };
        if (/нет в наличии|недоступно/i.test(text)) return { label: 'Недоступно', disabled: true, returnMode: false };
        return { label: '🔖 Арендовать', disabled: false, returnMode: false };
    }

    function applyRentButtons() {
        const cards = document.querySelectorAll('#booksContainer .book-card');
        cards.forEach(card => {
            const actions = card.querySelector('.card-actions');
            const note = actions?.querySelector('.guest-note');
            const bookId = Number(card.dataset.id || 0);
            if (!actions || !note || !bookId || !isRegularUserNote(note)) return;

            note.classList.add('user-note-hidden');
            let button = actions.querySelector('.card-rent-safe-btn');
            if (!button) {
                button = document.createElement('button');
                button.className = 'card-rent-safe-btn';
                button.type = 'button';
                actions.appendChild(button);
            }

            const state = getCardRentState(card);
            button.dataset.id = String(bookId);
            button.textContent = state.label;
            button.disabled = state.disabled;
            button.classList.toggle('return-mode', state.returnMode);
        });
    }

    function rentFromCard(bookId) {
        if (typeof window.openBook !== 'function') return;
        window.openBook(bookId);
        window.setTimeout(() => {
            const rentButton = document.getElementById('rentBookBtn');
            if (rentButton && !rentButton.disabled) rentButton.click();
        }, 120);
    }

    function bindCardClick() {
        if (window.__bibliotechCardRentSafeClickBound) return;
        window.__bibliotechCardRentSafeClickBound = true;
        document.addEventListener('click', event => {
            const button = event.target.closest('.card-rent-safe-btn');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            if (button.disabled) return;
            const bookId = Number(button.dataset.id || 0);
            if (bookId > 0) rentFromCard(bookId);
        }, true);
    }

    function wrapRenderBooks() {
        if (window.__bibliotechCardRentSafeWrapped) return;
        const original = window.renderBooks;
        if (typeof original !== 'function') {
            window.setTimeout(wrapRenderBooks, 120);
            return;
        }
        window.__bibliotechCardRentSafeWrapped = true;
        window.renderBooks = function wrappedRenderBooks() {
            const result = original.apply(this, arguments);
            applyRentButtons();
            return result;
        };
        applyRentButtons();
    }

    function init() {
        injectStyles();
        bindCardClick();
        wrapRenderBooks();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
