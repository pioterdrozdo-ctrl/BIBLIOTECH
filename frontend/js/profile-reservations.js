(function () {
    'use strict';

    const API_URL = window.BIBLIOTECH_API_URL || '/api';

    function escapeHtml(value = '') {
        return String(value).replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
        }[char]));
    }

    function session() {
        try { return JSON.parse(localStorage.getItem('bibliotech_current_user') || 'null'); }
        catch { return null; }
    }

    function token() {
        return localStorage.getItem('token') || '';
    }

    function formatDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
            + ' ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    function notify(message, type = 'info') {
        if (typeof window.notify === 'function') window.notify(message, type);
        else console[type === 'error' ? 'error' : 'log'](message);
    }

    function ensurePanel() {
        const modalContent = document.querySelector('#profileModal .profile-modal-content');
        const rentalsPanel = document.getElementById('profileRentalsPanel');
        if (!modalContent || document.getElementById('profileReservationsPanel')) return;

        const panel = document.createElement('section');
        panel.id = 'profileReservationsPanel';
        panel.className = 'profile-reservations-panel';
        panel.innerHTML = `
            <div class="profile-reservations-head">
                <div>
                    <h3>🔖 Мои бронирования</h3>
                    <p>Очередь на книги без свободных экземпляров и книги, которые уже ждут вас.</p>
                </div>
                <span class="profile-reservations-counter" id="profileReservationsCounter">0</span>
            </div>
            <div class="profile-reservations-list" id="profileReservationsList">
                <div class="profile-reservations-empty">Загрузка бронирований…</div>
            </div>
        `;
        if (rentalsPanel) rentalsPanel.insertAdjacentElement('afterend', panel);
        else modalContent.appendChild(panel);

        panel.addEventListener('click', async event => {
            const openButton = event.target.closest('[data-open-reservation-book]');
            if (openButton) {
                document.getElementById('profileModal')?.classList.remove('active');
                const bookId = Number(openButton.dataset.openReservationBook || 0);
                if (bookId && typeof window.openBook === 'function') window.openBook(bookId);
                return;
            }

            const cancelButton = event.target.closest('[data-cancel-reservation-id]');
            if (!cancelButton) return;
            const bookId = Number(cancelButton.dataset.cancelReservationId || 0);
            if (!bookId || cancelButton.disabled) return;
            cancelButton.disabled = true;
            const previous = cancelButton.textContent;
            cancelButton.textContent = 'Отменяем…';
            try {
                const response = await fetch(`${API_URL}/books/${bookId}/reserve`, {
                    method: 'DELETE',
                    headers: { Authorization: token() ? `Bearer ${token()}` : '' }
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.error || 'Не удалось отменить бронь.');
                notify('Бронирование отменено', 'success');
                await loadReservations();
                if (window.BibliotechReservationQueue?.refreshBookReservation) {
                    await window.BibliotechReservationQueue.refreshBookReservation(bookId);
                }
                document.dispatchEvent(new CustomEvent('bibliotech:reservation-changed', { detail: { bookId, payload } }));
            } catch (error) {
                cancelButton.disabled = false;
                cancelButton.textContent = previous;
                notify(error.message || 'Не удалось отменить бронь.', 'error');
            }
        });
    }

    function coverHtml(reservation) {
        const cover = reservation.book_cover_data_url || reservation.coverDataURL || reservation.cover_data_url;
        return cover
            ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(reservation.book_title || 'Книга')}">`
            : '📖';
    }

    function reservationCard(reservation) {
        const ready = reservation.status === 'ready';
        const position = Number(reservation.queuePosition || reservation.queue_position || 0);
        const expiresAt = reservation.expiresAt || reservation.expires_at;
        const statusText = ready ? 'Можно забрать' : `Место ${position || '—'}`;
        const details = ready
            ? `Заберите книгу ${expiresAt ? `до ${formatDateTime(expiresAt)}` : 'в течение 48 часов'}.`
            : `В очереди с ${formatDateTime(reservation.created_at)}.`;
        return `
            <article class="profile-reservation-card ${ready ? 'ready' : 'waiting'}">
                <div class="profile-reservation-cover">${coverHtml(reservation)}</div>
                <div class="profile-reservation-main">
                    <b>${escapeHtml(reservation.book_title || 'Книга')}</b>
                    <small>${escapeHtml(reservation.book_author || 'Автор не указан')}</small>
                    <small>${escapeHtml(details)}</small>
                    <div class="profile-reservation-actions">
                        <button type="button" data-open-reservation-book="${escapeHtml(reservation.book_id)}">${ready ? 'Забрать книгу' : 'Открыть карточку'}</button>
                        <button type="button" data-cancel-reservation-id="${escapeHtml(reservation.book_id)}">Отменить бронь</button>
                    </div>
                </div>
                <span class="profile-reservation-state ${ready ? 'ready' : ''}">${escapeHtml(statusText)}</span>
            </article>
        `;
    }

    function renderReservations(reservations = []) {
        const list = document.getElementById('profileReservationsList');
        const counter = document.getElementById('profileReservationsCounter');
        if (!list) return;
        if (counter) counter.textContent = String(reservations.length);
        if (!reservations.length) {
            list.innerHTML = '<div class="profile-reservations-empty">Активных бронирований нет. Когда у книги закончатся экземпляры, появится кнопка «Забронировать».</div>';
            return;
        }
        list.innerHTML = reservations.map(reservationCard).join('');
    }

    async function loadReservations() {
        ensurePanel();
        const list = document.getElementById('profileReservationsList');
        const counter = document.getElementById('profileReservationsCounter');
        if (!list) return;
        const currentSession = session();
        if (!currentSession || currentSession.guest || !token()) {
            if (counter) counter.textContent = '0';
            list.innerHTML = '<div class="profile-reservations-empty">Войдите в аккаунт, чтобы бронировать книги.</div>';
            return;
        }
        list.innerHTML = '<div class="profile-reservations-empty">Загрузка бронирований…</div>';
        try {
            const response = await fetch(`${API_URL}/rentals/me`, {
                headers: { Authorization: `Bearer ${token()}` },
                cache: 'no-store'
            });
            if (!response.ok) throw new Error('reservations unavailable');
            const payload = await response.json();
            renderReservations(Array.isArray(payload.reservations) ? payload.reservations : []);
        } catch {
            if (counter) counter.textContent = '0';
            list.innerHTML = '<div class="profile-reservations-error">Не удалось загрузить очередь. Попробуйте открыть профиль позже.</div>';
        }
    }

    function init() {
        ensurePanel();
        document.getElementById('currentUserPill')?.addEventListener('click', () => setTimeout(loadReservations, 150));
        const modal = document.getElementById('profileModal');
        if (modal && 'MutationObserver' in window) {
            new MutationObserver(() => {
                if (modal.classList.contains('active')) loadReservations();
            }).observe(modal, { attributes: true, attributeFilter: ['class'] });
        }
        document.addEventListener('bibliotech:reservation-changed', () => setTimeout(loadReservations, 80));
    }

    window.BibliotechProfileReservations = { loadReservations, renderReservations };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
