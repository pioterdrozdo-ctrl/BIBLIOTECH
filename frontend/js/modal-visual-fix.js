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
            .modal button[aria-label="Закрыть"],
            #closeViewBtn,
            #closeProfileBtn {
                position: absolute !important;
                display: block !important;
                width: 42px !important;
                height: 42px !important;
                min-width: 42px !important;
                min-height: 42px !important;
                max-width: 42px !important;
                max-height: 42px !important;
                padding: 0 !important;
                margin: 0 !important;
                border-radius: 50% !important;
                box-sizing: border-box !important;
                line-height: 0 !important;
                font-size: 0 !important;
                text-indent: -9999px !important;
                overflow: hidden !important;
                transform: none !important;
            }

            .modal .profile-extra-close,
            .modal .profile-extra-header .profile-extra-close {
                position: relative !important;
                flex: 0 0 42px !important;
                align-self: flex-start !important;
                top: auto !important;
                right: auto !important;
            }

            #profileModal .profile-close-btn,
            #closeProfileBtn {
                top: 14px !important;
                right: 14px !important;
            }

            .book-detail-modal .close-view-btn,
            #closeViewBtn {
                top: 14px !important;
                right: 14px !important;
                z-index: 20 !important;
            }

            .modal .profile-extra-close::before,
            .modal .profile-close-btn::before,
            .modal .close-view-btn::before,
            .modal .close-btn::before,
            .modal button[aria-label="Закрыть"]::before,
            #closeViewBtn::before,
            #closeProfileBtn::before {
                content: '×' !important;
                position: absolute !important;
                inset: 0 !important;
                width: 100% !important;
                height: 100% !important;
                display: grid !important;
                place-items: center !important;
                padding: 0 !important;
                margin: 0 !important;
                color: currentColor !important;
                font-family: Arial, Helvetica, sans-serif !important;
                font-size: 27px !important;
                font-weight: 500 !important;
                line-height: 1 !important;
                text-indent: 0 !important;
                transform: none !important;
                pointer-events: none !important;
            }

            .modal .profile-extra-close::after,
            .modal .profile-close-btn::after,
            .modal .close-view-btn::after,
            .modal .close-btn::after,
            .modal button[aria-label="Закрыть"]::after,
            #closeViewBtn::after,
            #closeProfileBtn::after {
                content: none !important;
                display: none !important;
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
                .modal button[aria-label="Закрыть"],
                #closeViewBtn,
                #closeProfileBtn {
                    width: 38px !important;
                    height: 38px !important;
                    min-width: 38px !important;
                    min-height: 38px !important;
                    max-width: 38px !important;
                    max-height: 38px !important;
                }

                .modal .profile-extra-close,
                .modal .profile-extra-header .profile-extra-close {
                    flex-basis: 38px !important;
                }

                .modal .profile-extra-close::before,
                .modal .profile-close-btn::before,
                .modal .close-view-btn::before,
                .modal .close-btn::before,
                .modal button[aria-label="Закрыть"]::before,
                #closeViewBtn::before,
                #closeProfileBtn::before {
                    font-size: 25px !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectModalVisualFix);
    else injectModalVisualFix();

    window.addEventListener('load', injectModalVisualFix);
})();
