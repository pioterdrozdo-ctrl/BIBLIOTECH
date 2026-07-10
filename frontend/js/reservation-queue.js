(function () {
    'use strict';

    const API_URL = window.BIBLIOTECH_API_URL || '/api';
    const POLL_INTERVAL_MS = 60000;
    let notificationTimer = null;

    function token() {
        return localStorage.getItem('token') || '';
    }

    function session() {
        try { return JSON.parse(localStorage.getItem('bibliotech_current_user') || 'null'); }
        catch { return null; }
    }

    function isGuestSession() {
        return Boolean(session()?.guest);
    }

    function appState() {
        try { return typeof state !== 'undefined' ? state : null; }
        catch { return null; }
    }

    function reservationData(book = {}) {
        const status = book.myReservationStatus || book.my_reservation_status || book.reservation?.status || null;
        const id = book.myReservationId || book.my_reservation_id || book.reservation?.id || null;
        const position = Number(book.myQueuePosition || book.my_queue_position || book.reservation?.queuePosition || book.reservation?.queue_position || 0) || null;
        const expiresAt = book.reservationReadyExpiresAt || book.reservation_ready_expires_at || book.reservation?.expiresAt || book.reservation?.expires_at || null;
        const count = Number(book.reservationCount || book.reservation_count || 0);
        const waitingCount = Number(book.reservationWaitingCount || book.reservation_waiting_count || 0);
        const readyCount = Number(book.reservationReadyCount || book.reservation_ready_count || 0);
        return { status, id, position, expiresAt, count, waitingCount, readyCount };
    }

    function withReservationFields(book = {}) {
        const data = reservationData(book);
        return {
            ...book,
            reservationCount: data.count,
            reservation_count: data.count,
            reservationWaitingCount: data.waitingCount,
            reservation_waiting_count: data.waitingCount,
            reservationReadyCount: data.readyCount,
            reservation_ready_count: data.readyCount,
            myReservationId: data.id,
            my_reservation_id: data.id,
            myReservationStatus: data.status,
            my_reservation_status: data.status,
            myQueuePosition: data.position,
            my_queue_position: data.position,
            reservationReadyExpiresAt: data.expiresAt,
            reservation_ready_expires_at: data.expiresAt,
            reservation: book.reservation || (data.id ? {
                id: data.id,
                status: data.status,
                queuePosition: data.position,
                expiresAt: data.expiresAt
            } : null)
        };
    }

    function formatDeadline(value) {
        if (!value) return 'в течение 48 часов';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'в течение 48 часов';
        return `до ${date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    }

    function notifyUser(message, type = 'info', options = {}) {
        if (typeof window.notify === 'function') window.notify(message, type, options);
        else console[type === 'error' ? 'error' : 'log'](message);
    }

    function patchMigrateBook() {
        const original = window.migrateBook;
        if (typeof original !== 'function' || original.__reservationQueuePatched) return;
        const patched = function migrateBookWithReservations(book) {
            return withReservationFields({ ...original(book), ...book });
        };
        patched.__reservationQueuePatched = true;
        window.migrateBook = patched;
        try { migrateBook = patched; } catch {}
    }

    function updateLocalBook(bookId, payloadBook) {
        const current = appState();
        if (!current || !payloadBook) return null;
        const index = current.books.findIndex(item => Number(item.id) === Number(bookId));
        const previous = index >= 0 ? current.books[index] : {};
        let core = { ...previous, ...payloadBook };
        if (typeof window.migrateBook === 'function') {
            try {
                core = window.migrateBook({
                    ...previous,
                    ...payloadBook,
                    coverDataURL: payloadBook.coverDataURL || payloadBook.cover_data_url || previous.coverDataURL,
                    dateAdded: payloadBook.created_at && typeof window.formatDate === 'function'
                        ? window.formatDate(new Date(payloadBook.created_at))
                        : previous.dateAdded,
                    comments: Array.isArray(payloadBook.comments) ? payloadBook.comments : (previous.comments || [])
                });
            } catch {
                core = { ...previous, ...payloadBook };
            }
        }
        const migrated = withReservationFields({
            ...previous,
            ...core,
            ...payloadBook,
            coverDataURL: payloadBook.coverDataURL || payloadBook.cover_data_url || core.coverDataURL || previous.coverDataURL,
            comments: Array.isArray(payloadBook.comments) ? payloadBook.comments : (core.comments || previous.comments || [])
        });
        if (index >= 0) current.books[index] = migrated;
        else current.books.unshift(migrated);
        if (typeof window.saveBooks === 'function') window.saveBooks();
        return current.books.find(item => Number(item.id) === Number(bookId));
    }

    function reservationBadgeText(book) {
        const reservation = reservationData(book);
        if (reservation.status === 'ready') return `✅ Ждёт вас ${formatDeadline(reservation.expiresAt)}`;
        if (reservation.status === 'waiting') return `⏳ Очередь: место ${reservation.position || '—'}`;
        if (reservation.count > 0) return `👥 В очереди: ${reservation.count}`;
        return '';
    }

    function decorateCards() {
        const current = appState();
        if (!current) return;
        document.querySelectorAll('#booksContainer .book-card').forEach(card => {
            const book = current.books.find(item => Number(item.id) === Number(card.dataset.id));
            if (!book) return;
            const reservation = reservationData(book);
            card.dataset.reservationStatus = reservation.status || '';
            card.dataset.queuePosition = reservation.position || '';
            card.dataset.reservationCount = String(reservation.count || 0);
            card.dataset.rentedByMe = book.rentedByMe ? 'true' : 'false';
            card.dataset.available = book.available && Number(book.copies || 0) > 0 ? 'true' : 'false';

            const meta = card.querySelector('.book-meta');
            meta?.querySelector('.reservation-queue-badge')?.remove();
            const text = reservationBadgeText(book);
            if (meta && text) {
                const badge = document.createElement('span');
                badge.className = `badge reservation-queue-badge ${reservation.status || 'queue'}`;
                badge.textContent = text;
                meta.insertBefore(badge, meta.querySelector('.date'));
            }
        });
    }

    function customizeRentalPanel(book) {
        const status = document.getElementById('viewRentalStatus');
        const note = document.getElementById('viewRentalNote');
        const button = document.getElementById('rentBookBtn');
        if (!status || !note || !button || !book || isGuestSession() || book.rentedByMe) return;
        const reservation = reservationData(book);
        button.classList.remove('ready-mode', 'cancel-reservation-mode');

        if (reservation.status === 'ready') {
            status.textContent = 'Книга ждёт вас';
            note.textContent = `Экземпляр закреплён за вами ${formatDeadline(reservation.expiresAt)}.`;
            button.textContent = 'Забрать книгу';
            button.disabled = false;
            button.classList.add('ready-mode');
            return;
        }

        if (reservation.status === 'waiting') {
            status.textContent = `Вы в очереди · место ${reservation.position || '—'}`;
            note.textContent = 'Когда экземпляр вернут, вы получите уведомление. Очередь двигается по времени бронирования.';
            button.textContent = 'Отменить бронь';
            button.disabled = false;
            button.classList.add('cancel-reservation-mode', 'return-mode');
            return;
        }

        if (!book.available || Number(book.copies || 0) <= 0) {
            status.textContent = reservation.count > 0 ? `Нет свободных копий · в очереди ${reservation.count}` : 'Нет свободных копий';
            note.textContent = 'Забронируйте книгу. После возврата экземпляр получит первый читатель в очереди.';
            button.textContent = 'Забронировать';
            button.disabled = false;
        }
    }

    function decorateBookModal(book) {
        customizeRentalPanel(book);
        const meta = document.getElementById('viewMeta');
        if (!meta) return;
        meta.querySelector('.reservation-queue-badge')?.remove();
        const text = reservationBadgeText(book);
        if (text) {
            const badge = document.createElement('span');
            badge.className = `badge reservation-queue-badge ${reservationData(book).status || 'queue'}`;
            badge.textContent = text;
            meta.appendChild(badge);
        }
    }

    function refreshVisibleBook(book) {
        if (!book) return;
        try {
            if (typeof window.updateRentalPanel === 'function') window.updateRentalPanel(book);
        } catch {}
        decorateBookModal(book);
    }

    function patchRenderBooks() {
        const original = window.renderBooks;
        if (typeof original !== 'function' || original.__reservationQueuePatched) return;
        const patched = function renderBooksWithReservations() {
            const result = original.apply(this, arguments);
            decorateCards();
            return result;
        };
        patched.__reservationQueuePatched = true;
        window.renderBooks = patched;
        try { renderBooks = patched; } catch {}
    }

    function patchOpenBook() {
        const original = window.openBook;
        if (typeof original !== 'function' || original.__reservationQueuePatched) return;
        const patched = function openBookWithReservations(bookId) {
            const result = original.apply(this, arguments);
            const current = appState();
            const book = current?.books.find(item => Number(item.id) === Number(bookId));
            if (book) decorateBookModal(book);
            return result;
        };
        patched.__reservationQueuePatched = true;
        window.openBook = patched;
        try { openBook = patched; } catch {}
    }

    function patchRentalPanel() {
        const original = window.updateRentalPanel;
        if (typeof original !== 'function' || original.__reservationQueuePatched) return;
        const patched = function updateRentalPanelWithReservations(book) {
            const result = original.apply(this, arguments);
            customizeRentalPanel(book);
            return result;
        };
        patched.__reservationQueuePatched = true;
        window.updateRentalPanel = patched;
        try { updateRentalPanel = patched; } catch {}
    }

    async function performReservationAction() {
        const current = appState();
        if (!current || isGuestSession()) {
            notifyUser('Войдите в аккаунт, чтобы бронировать книги', 'error');
            return null;
        }
        const book = current.books.find(item => Number(item.id) === Number(current.activeBookId));
        if (!book) return null;
        const reservation = reservationData(book);
        let action = 'rent';
        let method = 'POST';
        let body = {};

        if (book.rentedByMe) {
            action = 'return';
            body = { rentalId: book.myRentalId || book.my_rental_id || null };
        } else if (reservation.status === 'waiting') {
            action = 'reserve';
            method = 'DELETE';
        } else if (reservation.status !== 'ready' && (!book.available || Number(book.copies || 0) <= 0)) {
            action = 'reserve';
        }

        const button = document.getElementById('rentBookBtn');
        if (button) {
            button.disabled = true;
            button.dataset.previousText = button.textContent;
            button.textContent = action === 'reserve' && method === 'POST' ? 'Бронируем…'
                : action === 'reserve' ? 'Отменяем…'
                    : action === 'return' ? 'Возвращаем…' : 'Оформляем…';
        }

        try {
            const response = await fetch(`${API_URL}/books/${book.id}/${action}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: token() ? `Bearer ${token()}` : ''
                },
                body: method === 'DELETE' ? undefined : JSON.stringify(body)
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Не удалось выполнить действие.');
            const updated = updateLocalBook(book.id, payload.book);
            try {
                if (typeof window.renderBooks === 'function') window.renderBooks();
            } catch {}
            refreshVisibleBook(updated || payload.book);

            if (action === 'reserve' && method === 'POST') {
                const position = reservationData(updated || payload.book).position;
                notifyUser(position ? `Вы добавлены в очередь. Ваше место: ${position}` : 'Книга забронирована', 'success');
            } else if (action === 'reserve') {
                notifyUser('Бронирование отменено', 'success');
            } else if (action === 'return') {
                notifyUser(payload.promoted?.length ? 'Книга возвращена. Первый читатель в очереди получил уведомление.' : 'Книга возвращена', 'success');
            } else {
                notifyUser(reservation.status === 'ready' ? 'Бронь оформлена в аренду' : 'Книга закреплена за вами', 'success');
            }
            document.dispatchEvent(new CustomEvent('bibliotech:reservation-changed', { detail: { bookId: book.id, payload } }));
            return { ...payload, book: updated || payload.book };
        } catch (error) {
            notifyUser(error.message || 'Не удалось выполнить действие.', 'error');
            if (button) {
                button.disabled = false;
                button.textContent = button.dataset.previousText || 'Повторить';
            }
            return null;
        }
    }

    function patchRentalAction() {
        const patched = performReservationAction;
        patched.__reservationQueuePatched = true;
        window.toggleBookRental = patched;
        try { toggleBookRental = patched; } catch {}
    }

    async function refreshBookReservation(bookId) {
        if (!bookId || !token()) return null;
        try {
            const response = await fetch(`${API_URL}/books/${bookId}/reservation`, {
                headers: { Authorization: `Bearer ${token()}` }
            });
            if (!response.ok) return null;
            const payload = await response.json();
            const updated = updateLocalBook(bookId, payload.book);
            try {
                if (typeof window.renderBooks === 'function') window.renderBooks();
            } catch {}
            const current = appState();
            if (Number(current?.activeBookId) === Number(bookId)) refreshVisibleBook(updated || payload.book);
            return updated;
        } catch {
            return null;
        }
    }

    function notificationSeenKey() {
        const user = session();
        return `bibliotech_reservation_notifications_seen_${user?.id || user?.username || 'user'}`;
    }

    function readSeenNotifications() {
        try { return new Set(JSON.parse(localStorage.getItem(notificationSeenKey()) || '[]')); }
        catch { return new Set(); }
    }

    function saveSeenNotifications(values) {
        localStorage.setItem(notificationSeenKey(), JSON.stringify([...values].slice(-100)));
    }

    async function pollReservationNotifications() {
        if (!token() || isGuestSession() || document.visibilityState === 'hidden') return;
        try {
            const response = await fetch(`${API_URL}/account/notifications`, {
                headers: { Authorization: `Bearer ${token()}` },
                cache: 'no-store'
            });
            if (!response.ok) return;
            const payload = await response.json();
            const seen = readSeenNotifications();
            const ready = (payload.notifications || []).filter(item => item.type === 'reservation_ready' && !item.read_at && !seen.has(String(item.id)));
            for (const item of ready.reverse()) {
                seen.add(String(item.id));
                notifyUser(item.message || 'Забронированная книга доступна.', 'warning', {
                    duration: 9000,
                    actionText: item.book_id ? 'Открыть книгу' : '',
                    onAction: () => {
                        if (item.book_id && typeof window.openBook === 'function') window.openBook(Number(item.book_id));
                    }
                });
                if (item.book_id) await refreshBookReservation(Number(item.book_id));
            }
            saveSeenNotifications(seen);
        } catch {}
    }

    function patchAll() {
        patchMigrateBook();
        patchRentalPanel();
        patchRenderBooks();
        patchOpenBook();
        patchRentalAction();
        decorateCards();
    }

    function init() {
        patchAll();
        window.setTimeout(patchAll, 100);
        window.setTimeout(pollReservationNotifications, 900);
        notificationTimer = window.setInterval(pollReservationNotifications, POLL_INTERVAL_MS);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') pollReservationNotifications();
        });
        document.addEventListener('bibliotech:reservation-changed', () => window.setTimeout(decorateCards, 50));
    }

    window.BibliotechReservationQueue = {
        refreshBookReservation,
        pollReservationNotifications,
        performReservationAction,
        reservationData
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
