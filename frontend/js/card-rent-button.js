(function () {
    function injectStyles() {
        if (document.getElementById('cardRentButtonStyles')) return;
        const style = document.createElement('style');
        style.id = 'cardRentButtonStyles';
        style.textContent = `
            .card-rent-btn {
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

            .card-rent-btn:hover {
                transform: translateY(-1px);
                filter: brightness(1.04);
            }

            .card-rent-btn.return-mode {
                background: color-mix(in srgb, var(--surface-muted) 88%, var(--accent));
                color: var(--text);
                border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
            }

            .card-rent-btn:disabled {
                cursor: not-allowed;
                opacity: .58;
                transform: none;
                filter: none;
                background: var(--surface-muted);
                color: var(--muted);
                box-shadow: none;
            }

            .card-actions .guest-note.card-rent-replaced {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    function isUserNote(text) {
        return /пользователь:\s*просмотр/i.test(String(text || ''));
    }

    function getBookId(card) {
        const id = Number(card?.dataset?.id);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    function getCardState(card) {
        const text = card.textContent || '';
        const unavailable = /нет в наличии|недоступно/i.test(text);
        const rentedByMe = /закреплена за вами/i.test(text);
        if (rentedByMe) return { text: 'Вернуть', mode: 'return', disabled: false };
        if (unavailable) return { text: 'Недоступно', mode: 'disabled', disabled: true };
        return { text: 'Арендовать', mode: 'rent', disabled: false };
    }

    function replaceUserNotes() {
        document.querySelectorAll('#booksContainer .book-card').forEach(card => {
            const actions = card.querySelector('.card-actions');
            const note = actions?.querySelector('.guest-note');
            if (!actions || !note || !isUserNote(note.textContent)) return;
            const bookId = getBookId(card);
            if (!bookId) return;

            const current = getCardState(card);
            note.classList.add('card-rent-replaced');

            let button = actions.querySelector('.card-rent-btn');
            if (!button) {
                button = document.createElement('button');
                button.type = 'button';
                button.className = 'card-rent-btn';
                actions.appendChild(button);
            }

            button.dataset.id = String(bookId);
            button.textContent = current.mode === 'return' ? '↩ Вернуть' : current.mode === 'disabled' ? 'Недоступно' : '🔖 Арендовать';
            button.disabled = current.disabled;
            button.classList.toggle('return-mode', current.mode === 'return');
        });
    }

    function handleRentClick(event) {
        const button = event.target.closest('.card-rent-btn');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled) return;

        const bookId = Number(button.dataset.id);
        if (!Number.isFinite(bookId) || bookId <= 0) return;

        if (typeof window.openBook === 'function') {
            window.openBook(bookId);
            setTimeout(() => {
                const rentButton = document.getElementById('rentBookBtn');
                if (rentButton && !rentButton.disabled) rentButton.click();
            }, 80);
        }
    }

    function init() {
        injectStyles();
        replaceUserNotes();
        document.addEventListener('click', handleRentClick, true);

        const container = document.getElementById('booksContainer');
        if (container && 'MutationObserver' in window) {
            const observer = new MutationObserver(() => replaceUserNotes());
            observer.observe(container, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
