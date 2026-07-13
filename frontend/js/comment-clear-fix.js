(function () {
    'use strict';

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

            #bookIsbnPreview {
                scroll-margin-block: 18px;
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

    function setupCommentClearButton() {
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

    function prefersReducedMotion() {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    }

    function findScrollableParent(element) {
        let current = element?.parentElement || null;
        while (current && current !== document.body && current !== document.documentElement) {
            const style = window.getComputedStyle(current);
            const canScroll = /(auto|scroll|overlay)/.test(style.overflowY)
                && current.scrollHeight > current.clientHeight + 1;
            if (canScroll) return current;
            current = current.parentElement;
        }
        return null;
    }

    let isbnScrollFrame = 0;

    function scrollIsbnPreviewIntoView() {
        const preview = document.getElementById('bookIsbnPreview');
        if (!preview || preview.hidden || !preview.childElementCount) return;

        if (isbnScrollFrame) cancelAnimationFrame(isbnScrollFrame);
        isbnScrollFrame = requestAnimationFrame(() => {
            isbnScrollFrame = requestAnimationFrame(() => {
                isbnScrollFrame = 0;
                const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
                const scrollParent = findScrollableParent(preview);

                if (scrollParent && typeof scrollParent.scrollTo === 'function') {
                    const parentRect = scrollParent.getBoundingClientRect();
                    const previewRect = preview.getBoundingClientRect();
                    const targetTop = Math.max(
                        0,
                        scrollParent.scrollTop + previewRect.top - parentRect.top - 18
                    );
                    scrollParent.scrollTo({ top: targetTop, behavior });
                    return;
                }

                preview.scrollIntoView?.({ behavior, block: 'nearest', inline: 'nearest' });
            });
        });
    }

    function setupIsbnAutoScroll() {
        const preview = document.getElementById('bookIsbnPreview');
        if (!preview || preview.dataset.isbnScrollReady === 'true') return;

        preview.dataset.isbnScrollReady = 'true';
        const observer = new MutationObserver(() => {
            if (!preview.hidden && preview.childElementCount) scrollIsbnPreviewIntoView();
        });
        observer.observe(preview, {
            attributes: true,
            attributeFilter: ['hidden'],
            childList: true,
            subtree: true
        });

        const lookupButton = document.getElementById('lookupBookIsbnBtn');
        lookupButton?.addEventListener('click', () => {
            window.setTimeout(() => {
                if (!preview.hidden && preview.childElementCount) scrollIsbnPreviewIntoView();
            }, 0);
        });
    }

    function init() {
        injectStyles();
        setupCommentClearButton();
        setupIsbnAutoScroll();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
