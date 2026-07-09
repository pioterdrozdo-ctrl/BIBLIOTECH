(function () {
    function injectStyles() {
        if (document.getElementById('commentClearFixStyles')) return;
        const style = document.createElement('style');
        style.id = 'commentClearFixStyles';
        style.textContent = `
            .comments-section .input-wrapper {
                position: relative;
            }

            .comments-section #newCommentInput {
                padding-right: 44px;
            }

            .comments-section #clearCommentFieldBtn {
                right: 9px;
                z-index: 3;
                border: 0;
                background: transparent;
                color: var(--muted);
            }

            .comments-section #clearCommentFieldBtn:hover {
                background: var(--surface-muted);
                color: var(--text);
            }
        `;
        document.head.appendChild(style);
    }

    function updateClearButton() {
        const input = document.getElementById('newCommentInput');
        const clear = document.getElementById('clearCommentFieldBtn');
        if (!input || !clear) return;
        clear.classList.toggle('hidden', !input.value.trim());
    }

    function init() {
        injectStyles();
        const input = document.getElementById('newCommentInput');
        const clear = document.getElementById('clearCommentFieldBtn');
        if (!input || !clear || clear.dataset.commentClearReady === 'true') return;

        clear.dataset.commentClearReady = 'true';
        clear.setAttribute('aria-label', 'Очистить комментарий');
        clear.setAttribute('title', 'Очистить комментарий');

        input.addEventListener('input', updateClearButton);
        input.addEventListener('focus', updateClearButton);
        clear.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            input.value = '';
            updateClearButton();
            input.focus();
        });

        updateClearButton();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
