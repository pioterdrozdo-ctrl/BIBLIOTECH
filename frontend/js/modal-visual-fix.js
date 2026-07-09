(function () {
    function injectModalVisualFix() {
        const old = document.getElementById('modalVisualFixStyles');
        if (old) old.remove();

        const style = document.createElement('style');
        style.id = 'modalVisualFixStyles';
        style.textContent = `
            .modal .profile-extra-close,
            .modal .profile-close-btn,
            .modal .close-view-btn,
            .modal .close-btn,
            .modal button[aria-label="Закрыть"] {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 42px !important;
                height: 42px !important;
                min-width: 42px !important;
                min-height: 42px !important;
                padding: 0 !important;
                margin: 0 !important;
                line-height: 0 !important;
                box-sizing: border-box !important;
                text-align: center !important;
                vertical-align: middle !important;
            }

            .modal .profile-extra-close {
                position: relative !important;
                flex: 0 0 42px !important;
                font-size: 0 !important;
                transform: none !important;
            }

            .modal .profile-extra-close::before,
            .modal .profile-close-btn::before,
            .modal .close-view-btn::before,
            .modal .close-btn::before,
            .modal button[aria-label="Закрыть"]::before {
                content: '×' !important;
                display: block !important;
                font-size: 26px !important;
                font-weight: 500 !important;
                line-height: 1 !important;
                transform: translateY(-1px) !important;
            }

            .modal .profile-close-btn,
            .modal .close-view-btn,
            .modal .close-btn,
            .modal button[aria-label="Закрыть"] {
                font-size: 0 !important;
            }

            .profile-extra-header {
                position: relative !important;
                overflow: hidden !important;
                background: var(--surface) !important;
                isolation: isolate !important;
            }

            .profile-extra-header::before {
                content: '' !important;
                position: absolute !important;
                inset: 0 !important;
                z-index: -1 !important;
                pointer-events: none !important;
                background:
                    radial-gradient(ellipse at 8% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 58%),
                    radial-gradient(ellipse at 32% 0%, color-mix(in srgb, var(--accent-strong) 8%, transparent), transparent 54%),
                    linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, transparent), transparent 100%) !important;
                opacity: .85 !important;
            }

            .profile-extra-header::after {
                content: '' !important;
                position: absolute !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                height: 54px !important;
                z-index: -1 !important;
                background: linear-gradient(180deg, transparent, var(--surface)) !important;
                pointer-events: none !important;
            }

            .profile-extra-header > * {
                position: relative !important;
                z-index: 1 !important;
            }

            @media (max-width: 560px) {
                .modal .profile-extra-close,
                .modal .profile-close-btn,
                .modal .close-view-btn,
                .modal .close-btn,
                .modal button[aria-label="Закрыть"] {
                    width: 38px !important;
                    height: 38px !important;
                    min-width: 38px !important;
                    min-height: 38px !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectModalVisualFix);
    else injectModalVisualFix();

    window.addEventListener('load', injectModalVisualFix);
})();
