(function () {
    const API_URL = window.BIBLIOTECH_API_URL || '/api';
    const SESSION_KEY = 'bibliotech_current_user';

    function escapeHtml(value = '') {
        return String(value).replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
        }[char]));
    }

    function formatDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
            + ' ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    function getSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
        catch { return null; }
    }

    function injectStyles() {
        if (document.getElementById('profileRentalsStyles')) return;
        const style = document.createElement('style');
        style.id = 'profileRentalsStyles';
        style.textContent = `
            .profile-rentals-panel {
                margin-top: 16px;
                padding: 16px;
                border: 1px solid var(--border);
                border-radius: var(--radius);
                background: var(--surface);
                box-shadow: var(--shadow-soft);
            }

            .profile-rentals-head {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 12px;
            }

            .profile-rentals-head h3 {
                margin: 0;
                font-size: 18px;
            }

            .profile-rentals-head p {
                margin: 4px 0 0;
                color: var(--muted);
                font-size: 13px;
                line-height: 1.45;
            }

            .profile-rentals-counter {
                flex: 0 0 auto;
                min-width: 34px;
                height: 34px;
                display: inline-grid;
                place-items: center;
                border-radius: 999px;
                background: var(--accent-soft);
                color: var(--accent);
                font-weight: 900;
            }

            .profile-rentals-tabs {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px;
                margin-bottom: 12px;
                padding: 4px;
                border: 1px solid var(--border);
                border-radius: var(--radius);
                background: var(--surface-muted);
            }

            .profile-rental-tab {
                min-height: 38px;
                border: 0;
                border-radius: calc(var(--radius) - 2px);
                background: transparent;
                color: var(--muted);
                cursor: pointer;
                font-weight: 850;
            }

            .profile-rental-tab.active {
                background: linear-gradient(135deg, var(--accent), var(--accent-strong));
                color: var(--on-accent);
            }

            .profile-rentals-list {
                display: grid;
                gap: 10px;
                max-height: min(360px, 42vh);
                overflow-y: auto;
                scrollbar-width: none;
                -ms-overflow-style: none;
            }

            .profile-rentals-list::-webkit-scrollbar {
                width: 0;
                height: 0;
                display: none;
            }

            .profile-rental-card {
                display: grid;
                grid-template-columns: 52px minmax(0, 1fr) auto;
                gap: 12px;
                align-items: center;
                padding: 10px;
                border: 1px solid var(--border);
                border-radius: var(--radius);
                background: var(--bg-soft);
            }

            .profile-rental-cover {
                width: 52px;
                height: 68px;
                display: grid;
                place-items: center;
                overflow: hidden;
                border-radius: 10px;
                background: var(--surface-muted);
                color: var(--muted);
                font-size: 22px;
            }

            .profile-rental-cover img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .profile-rental-main {
                min-width: 0;
            }

            .profile-rental-main b {
                display: block;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: var(--text);
            }

            .profile-rental-main small {
                display: block;
                margin-top: 3px;
                color: var(--muted);
                line-height: 1.35;
            }

            .profile-rental-status {
                justify-self: end;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 30px;
                padding: 5px 9px;
                border-radius: 999px;
                background: var(--ok-soft);
                color: var(--ok);
                font-size: 12px;
                font-weight: 900;
                white-space: nowrap;
            }

            .profile-rental-status.returned {
                background: var(--surface-muted);
                color: var(--muted);
            }

            .profile-rental-open {
                margin-top: 8px;
                min-height: 32px;
                padding: 7px 10px;
                border: 1px solid var(--border);
                border-radius: 10px;
                background: var(--surface);
                color: var(--text);
                cursor: pointer;
                font-weight: 800;
            }

            .profile-rentals-empty,
            .profile-rentals-error {
                padding: 14px;
                border-radius: var(--radius);
                background: var(--surface-muted);
                color: var(--muted);
                text-align: center;
                line-height: 1.45;
            }

            .profile-rentals-error {
                color: var(--danger);
                background: var(--danger-soft);
            }

            @media (max-width: 560px) {
                .profile-rentals-panel { padding: 14px; }
                .profile-rentals-head { flex-direction: column; }
                .profile-rentals-counter { align-self: flex-start; }
                .profile-rental-card {
                    grid-template-columns: 46px minmax(0, 1fr);
                    align-items: start;
                }
                .profile-rental-cover { width: 46px; height: 62px; }
                .profile-rental-status {
                    grid-column: 2;
                    justify-self: start;
                    margin-top: -2px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function ensurePanel() {
        const modalContent = document.querySelector('#profileModal .profile-modal-content');
        const anchor = document.querySelector('#profileModal .avatar-settings');
        if (!modalContent || document.getElementById('profileRentalsPanel')) return;

        const panel = document.createElement('div');
        panel.className = 'profile-rentals-panel';
        panel.id = 'profileRentalsPanel';
        panel.innerHTML = `
            <div class="profile-rentals-head">
                <div>
                    <h3>📚 Мои книги</h3>
                    <p>Здесь отображаются книги, которые вы брали в аренду.</p>
                </div>
                <span class="profile-rentals-counter" id="profileRentalsCounter">0</span>
            </div>
            <div class="profile-rentals-tabs">
                <button class="profile-rental-tab active" type="button" data-rental-filter="active">На руках</button>
                <button class="profile-rental-tab" type="button" data-rental-filter="history">История</button>
            </div>
            <div class="profile-rentals-list" id="profileRentalsList">
                <div class="profile-rentals-empty">Загрузка арендованных книг...</div>
            </div>
        `;

        if (anchor) modalContent.insertBefore(panel, anchor);
        else modalContent.appendChild(panel);

        panel.addEventListener('click', event => {
            const tab = event.target.closest('[data-rental-filter]');
            if (tab) {
                panel.querySelectorAll('.profile-rental-tab').forEach(item => item.classList.toggle('active', item === tab));
                renderRentals(panel.__rentals || [], tab.dataset.rentalFilter);
                return;
            }

            const openBtn = event.target.closest('[data-open-book-id]');
            if (openBtn && typeof window.openBook === 'function') {
                document.getElementById('profileModal')?.classList.remove('active');
                window.openBook(Number(openBtn.dataset.openBookId));
            }
        });
    }

    function rentalCover(rental) {
        const cover = rental.book_cover_data_url || rental.coverDataURL || rental.cover_data_url;
        if (cover) return `<img src="${cover}" alt="${escapeHtml(rental.book_title || 'Книга')}">`;
        return '📖';
    }

    function rentalCard(rental) {
        const active = rental.status === 'active' || !rental.returned_at;
        const canOpen = rental.book_id && rental.book_title !== 'Книга удалена';
        return `
            <div class="profile-rental-card">
                <div class="profile-rental-cover">${rentalCover(rental)}</div>
                <div class="profile-rental-main">
                    <b data-user-content="book-title">${escapeHtml(rental.book_title || 'Книга')}</b>
                    <small data-user-content="book-author">${escapeHtml(rental.book_author || 'Автор не указан')}</small>
                    <small>Взята: ${escapeHtml(formatDateTime(rental.rented_at))}</small>
                    ${active ? '' : `<small>Возвращена: ${escapeHtml(formatDateTime(rental.returned_at))}</small>`}
                    ${canOpen ? `<button class="profile-rental-open" type="button" data-open-book-id="${escapeHtml(rental.book_id)}">Открыть карточку</button>` : ''}
                </div>
                <span class="profile-rental-status ${active ? '' : 'returned'}">${active ? 'На руках' : 'Возвращена'}</span>
            </div>
        `;
    }

    function renderRentals(rentals = [], filter = 'active') {
        const panel = document.getElementById('profileRentalsPanel');
        const list = document.getElementById('profileRentalsList');
        const counter = document.getElementById('profileRentalsCounter');
        if (!panel || !list) return;

        panel.__rentals = rentals;
        const active = rentals.filter(rental => rental.status === 'active' || !rental.returned_at);
        const source = filter === 'history' ? rentals : active;
        if (counter) counter.textContent = String(active.length);

        if (!rentals.length) {
            list.innerHTML = '<div class="profile-rentals-empty">Вы пока не арендовали книги. Откройте карточку книги и нажмите «Арендовать».</div>';
            return;
        }

        if (!source.length) {
            list.innerHTML = filter === 'history'
                ? '<div class="profile-rentals-empty">История аренды пока пустая.</div>'
                : '<div class="profile-rentals-empty">Сейчас у вас нет книг на руках.</div>';
            return;
        }

        list.innerHTML = source.map(rentalCard).join('');
    }

    async function loadProfileRentals() {
        injectStyles();
        ensurePanel();

        const session = getSession();
        const list = document.getElementById('profileRentalsList');
        const counter = document.getElementById('profileRentalsCounter');
        if (!list) return;

        if (!session || session.guest) {
            if (counter) counter.textContent = '0';
            list.innerHTML = '<div class="profile-rentals-empty">Войдите в аккаунт, чтобы видеть свои арендованные книги.</div>';
            return;
        }

        list.innerHTML = '<div class="profile-rentals-empty">Загрузка арендованных книг...</div>';

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/rentals/me`, {
                headers: { Authorization: token ? `Bearer ${token}` : '' }
            });
            if (!response.ok) throw new Error('rentals unavailable');
            const payload = await response.json();
            const rentals = Array.isArray(payload) ? payload : (payload.rentals || []);
            const activeTab = document.querySelector('#profileRentalsPanel .profile-rental-tab.active')?.dataset.rentalFilter || 'active';
            renderRentals(rentals, activeTab);
        } catch (error) {
            if (counter) counter.textContent = '0';
            list.innerHTML = '<div class="profile-rentals-error">Не удалось загрузить ваши книги. Попробуйте открыть профиль позже.</div>';
        }
    }

    function initProfileRentals() {
        injectStyles();
        ensurePanel();

        const pill = document.getElementById('currentUserPill');
        pill?.addEventListener('click', () => setTimeout(loadProfileRentals, 120));

        const modal = document.getElementById('profileModal');
        if (modal && 'MutationObserver' in window) {
            const observer = new MutationObserver(() => {
                if (modal.classList.contains('active')) loadProfileRentals();
            });
            observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfileRentals);
    } else {
        initProfileRentals();
    }
})();
