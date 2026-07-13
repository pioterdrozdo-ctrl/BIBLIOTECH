(function () {
    'use strict';

    const apiBase = window.BIBLIOTECH_API_URL || '/api';
    const activeSessionKey = 'bibliotech_active_inventory_session';
    const state = { sessions: [], active: null, stream: null, scanFrame: null, cameraBusy: false };

    function authHeaders(json = false) {
        const token = localStorage.getItem('token') || '';
        return {
            ...(json ? { 'Content-Type': 'application/json' } : {}),
            Authorization: token ? `Bearer ${token}` : ''
        };
    }

    function escapeHtml(value = '') {
        return String(value).replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[char]));
    }

    function formatDate(value, withTime = false) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
        });
    }

    function formatLocation(location = null) {
        if (!location) return 'Весь фонд';
        return [location.note, location.shelfCode || location.shelf_code, (location.placeCode || location.place_code) ? `место ${location.placeCode || location.place_code}` : '']
            .filter(Boolean).join(' · ') || 'Без названия';
    }

    function setFeedback(targetId, message = '', type = '') {
        const target = document.getElementById(targetId);
        if (!target) return;
        target.className = `inventory-feedback ${type}`.trim();
        target.textContent = message;
    }

    async function fetchJson(url, options = {}) {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));
        return { response, data };
    }

    async function loadLocations() {
        try {
            const response = await fetch(`${apiBase}/storage-locations`);
            const data = await response.json();
            if (!response.ok) throw new Error('locations');
            const locations = data.locations || [];
            const inventorySelect = document.getElementById('inventoryLocationSelect');
            const documentSelect = document.getElementById('documentLocationSelect');
            const options = locations.map(location => `<option value="${Number(location.id)}">${escapeHtml(formatLocation(location))}</option>`).join('');
            if (inventorySelect) inventorySelect.innerHTML = `<option value="">Весь фонд</option>${options}`;
            if (documentSelect) documentSelect.innerHTML = `<option value="">Все места</option>${options}`;
        } catch {
            setFeedback('inventoryScanFeedback', 'Не удалось загрузить места хранения.', 'error');
        }
    }

    function summaryCard(value, label, tone = '') {
        return `<div class="inventory-summary-card ${tone}"><b>${Number(value || 0)}</b><span>${escapeHtml(label)}</span></div>`;
    }

    function bookResultItem(book = {}, detail = '') {
        return `<div class="inventory-result-item"><b>${escapeHtml(book.title || 'Неизвестная книга')}</b><span>${escapeHtml(book.author || 'Автор не указан')}</span><small>${escapeHtml(detail || book.qrCode || book.qr_code || formatLocation(book.location))}</small></div>`;
    }

    function renderInventorySession(session) {
        state.active = session || null;
        const workspace = document.getElementById('inventoryWorkspace');
        const pill = document.getElementById('inventoryStatusPill');
        if (!session) {
            if (workspace) workspace.hidden = true;
            if (pill) {
                pill.textContent = 'Нет активной проверки';
                pill.className = 'operation-status-pill';
            }
            localStorage.removeItem(activeSessionKey);
            return;
        }
        localStorage.setItem(activeSessionKey, String(session.id));
        if (workspace) workspace.hidden = false;
        const completed = session.status === 'completed';
        if (pill) {
            pill.textContent = completed ? 'Завершена' : 'Идёт проверка';
            pill.className = `operation-status-pill ${completed ? 'completed' : 'active'}`;
        }
        const name = document.getElementById('inventorySessionName');
        const meta = document.getElementById('inventorySessionMeta');
        if (name) name.textContent = session.name || `Инвентаризация #${session.id}`;
        if (meta) meta.textContent = `${formatLocation(session.location)} · начата ${formatDate(session.started_at, true)}`;
        const report = session.report || {};
        const summary = report.summary || {};
        const summaryGrid = document.getElementById('inventorySummaryGrid');
        if (summaryGrid) summaryGrid.innerHTML = [
            summaryCard(summary.expectedTitles, 'ожидалось позиций'),
            summaryCard(summary.foundTitles, 'найдено', 'ok'),
            summaryCard(summary.missingTitles, 'не найдено', summary.missingTitles ? 'danger' : ''),
            summaryCard(summary.misplacedTitles, 'не на месте', summary.misplacedTitles ? 'danger' : '')
        ].join('');
        const missing = report.missing || [];
        const misplaced = report.misplaced || [];
        const scans = report.scans || [];
        const missingList = document.getElementById('inventoryMissingList');
        const misplacedList = document.getElementById('inventoryMisplacedList');
        const recentList = document.getElementById('inventoryRecentScans');
        if (missingList) missingList.innerHTML = missing.map(book => bookResultItem(book, `${book.qrCode || book.qr_code || 'Без QR'} · ${formatLocation(book.location)}`)).join('') || '<span class="inventory-result-empty">Пропусков нет.</span>';
        if (misplacedList) misplacedList.innerHTML = misplaced.map(book => bookResultItem(book, `Сейчас: ${formatLocation(book.location)}`)).join('') || '<span class="inventory-result-empty">Ошибок размещения нет.</span>';
        if (recentList) recentList.innerHTML = scans.map(scan => {
            const labels = { found: 'Найдено', misplaced: 'Не на месте', duplicate: 'Повтор', unknown: 'Неизвестный код' };
            return scan.book
                ? bookResultItem(scan.book, `${labels[scan.result] || scan.result} · ${formatDate(scan.scanned_at, true)}`)
                : `<div class="inventory-result-item"><b>${escapeHtml(scan.scanned_code)}</b><span>Неизвестный код</span><small>${formatDate(scan.scanned_at, true)}</small></div>`;
        }).join('') || '<span class="inventory-result-empty">Сканирований пока нет.</span>';
        const missingCount = document.getElementById('inventoryMissingCount');
        const misplacedCount = document.getElementById('inventoryMisplacedCount');
        if (missingCount) missingCount.textContent = String(missing.length);
        if (misplacedCount) misplacedCount.textContent = String(misplaced.length);
        const input = document.getElementById('inventoryScanInput');
        const scanButton = document.getElementById('inventoryScanBtn');
        const cameraButton = document.getElementById('inventoryCameraBtn');
        const completeButton = document.getElementById('inventoryCompleteBtn');
        if (input) input.disabled = completed;
        if (scanButton) scanButton.disabled = completed;
        if (cameraButton) cameraButton.disabled = completed;
        if (completeButton) completeButton.hidden = completed;
        if (!completed) setTimeout(() => input?.focus(), 30);
    }

    function renderInventoryHistory() {
        const target = document.getElementById('inventoryHistoryList');
        if (!target) return;
        target.innerHTML = state.sessions.map(session => `
            <div class="inventory-history-item">
                <div><b>${escapeHtml(session.name || `Инвентаризация #${session.id}`)}</b><small>${escapeHtml(formatLocation(session.location))} · ${formatDate(session.started_at, true)} · ${session.status === 'completed' ? 'завершена' : 'в работе'} · сканов ${Number(session.total_scans ?? session.report?.summary?.totalScans ?? 0)}</small></div>
                <button type="button" data-inventory-open="${Number(session.id)}">Открыть</button>
            </div>
        `).join('') || '<span class="inventory-result-empty">Проверок пока нет.</span>';
    }

    async function loadSession(sessionId) {
        const { response, data } = await fetchJson(`${apiBase}/inventory/${encodeURIComponent(sessionId)}`, {
            headers: authHeaders()
        });
        if (!response.ok) throw new Error(data.error || 'Не удалось загрузить проверку');
        renderInventorySession(data.session);
        return data.session;
    }

    async function loadInventorySessions() {
        const target = document.getElementById('inventoryHistoryList');
        if (target) target.innerHTML = '<span>Загрузка...</span>';
        try {
            const { response, data } = await fetchJson(`${apiBase}/inventory`, { headers: authHeaders() });
            if (!response.ok) throw new Error(data.error || 'inventory');
            state.sessions = data.sessions || [];
            renderInventoryHistory();
            const saved = localStorage.getItem(activeSessionKey);
            const preferred = saved || state.sessions.find(session => session.status === 'active')?.id;
            if (preferred) await loadSession(preferred);
        } catch {
            if (target) target.innerHTML = '<span class="inventory-result-empty">Инвентаризация недоступна.</span>';
        }
    }

    async function startInventory(event) {
        event.preventDefault();
        const button = event.submitter || event.target.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        try {
            const name = document.getElementById('inventoryNameInput')?.value.trim();
            const locationId = document.getElementById('inventoryLocationSelect')?.value || null;
            const { response, data } = await fetchJson(`${apiBase}/inventory`, {
                method: 'POST', headers: authHeaders(true), body: JSON.stringify({ name, locationId })
            });
            if (!response.ok) throw new Error(data.error || 'Не удалось начать инвентаризацию');
            renderInventorySession(data.session);
            setFeedback('inventoryScanFeedback', 'Проверка начата. Можно сканировать существующие QR.', 'ok');
            event.target.reset();
            await loadInventorySessions();
        } catch (error) {
            setFeedback('inventoryScanFeedback', error.message, 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    function feedbackForScan(event = {}) {
        const book = event.book;
        if (event.result === 'found') return { text: `Найдено: ${book?.title || event.scanned_code}`, type: 'ok' };
        if (event.result === 'misplaced') return { text: `Книга не в выбранной зоне: ${book?.title || event.scanned_code}. Текущее место: ${formatLocation(book?.location)}`, type: 'warning' };
        if (event.result === 'duplicate') return { text: `Повторное сканирование: ${book?.title || event.scanned_code}`, type: 'warning' };
        return { text: `Код не найден в каталоге: ${event.scanned_code || 'неизвестно'}`, type: 'error' };
    }

    async function scanActiveBook(rawCode = '') {
        const code = String(rawCode || document.getElementById('inventoryScanInput')?.value || '').trim();
        if (!state.active || !code) return setFeedback('inventoryScanFeedback', 'Введите QR, ISBN или ID книги.', 'error');
        const button = document.getElementById('inventoryScanBtn');
        if (button) button.disabled = true;
        try {
            const { response, data } = await fetchJson(`${apiBase}/inventory/${encodeURIComponent(state.active.id)}/scan`, {
                method: 'POST', headers: authHeaders(true), body: JSON.stringify({ code })
            });
            if (data.session) renderInventorySession(data.session);
            const feedback = feedbackForScan(data.event || { result: 'unknown', scanned_code: code });
            setFeedback('inventoryScanFeedback', feedback.text, feedback.type);
            if (!response.ok && !data.event) throw new Error(data.error || 'Не удалось сохранить сканирование');
            const input = document.getElementById('inventoryScanInput');
            if (input) {
                input.value = '';
                input.focus();
            }
        } catch (error) {
            setFeedback('inventoryScanFeedback', error.message, 'error');
        } finally {
            if (button && state.active?.status === 'active') button.disabled = false;
        }
    }

    async function completeInventory() {
        if (!state.active || !confirm('Завершить инвентаризацию? Новые сканы после этого приниматься не будут.')) return;
        try {
            const { response, data } = await fetchJson(`${apiBase}/inventory/${encodeURIComponent(state.active.id)}/complete`, {
                method: 'POST', headers: authHeaders(true), body: '{}'
            });
            if (!response.ok) throw new Error(data.error || 'Не удалось завершить проверку');
            renderInventorySession(data.session);
            setFeedback('inventoryScanFeedback', 'Инвентаризация завершена. PDF-отчёт готов к формированию.', 'ok');
            await loadInventorySessions();
        } catch (error) {
            setFeedback('inventoryScanFeedback', error.message, 'error');
        }
    }

    async function downloadPdf(url, body, fallbackName, messageTarget = 'documentBuilderMessage') {
        const response = await fetch(url, {
            method: 'POST', headers: authHeaders(true), body: JSON.stringify(body || {})
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Не удалось сформировать PDF');
        }
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') || '';
        const match = disposition.match(/filename="([^"]+)"/i);
        const link = document.createElement('a');
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.download = match?.[1] || fallbackName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
        setFeedback(messageTarget, 'PDF сформирован.', 'ok');
    }

    async function downloadInventoryReport() {
        if (!state.active) return;
        try {
            await downloadPdf(`${apiBase}/documents/inventory/${encodeURIComponent(state.active.id)}/report`, {}, `bibliotech-inventory-${state.active.id}.pdf`, 'inventoryScanFeedback');
        } catch (error) {
            setFeedback('inventoryScanFeedback', error.message, 'error');
        }
    }

    async function generateDocument(event) {
        event.preventDefault();
        const type = document.getElementById('documentTypeSelect')?.value || 'labels';
        const locationId = document.getElementById('documentLocationSelect')?.value || null;
        const codes = document.getElementById('documentBookCodes')?.value || '';
        const reason = document.getElementById('documentReasonInput')?.value || '';
        const button = document.getElementById('generateDocumentBtn');
        if (type === 'writeoff' && !codes.trim()) return setFeedback('documentBuilderMessage', 'Для акта списания укажите коды книг.', 'error');
        if (button) {
            button.disabled = true;
            button.textContent = 'Формируем...';
        }
        setFeedback('documentBuilderMessage', 'Подготавливаем PDF...', '');
        try {
            await downloadPdf(`${apiBase}/documents/${type}`, { locationId, codes, reason }, `bibliotech-${type}.pdf`);
        } catch (error) {
            setFeedback('documentBuilderMessage', error.message, 'error');
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = 'Сформировать PDF';
            }
        }
    }

    async function downloadRentalAct(rentalId) {
        try {
            await downloadPdf(`${apiBase}/documents/rentals/${encodeURIComponent(rentalId)}/act`, {}, `bibliotech-rental-${rentalId}.pdf`);
        } catch (error) {
            setFeedback('documentBuilderMessage', error.message, 'error');
            document.getElementById('documentsPanelTitle')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function stopCamera() {
        if (state.scanFrame) cancelAnimationFrame(state.scanFrame);
        state.scanFrame = null;
        state.stream?.getTracks().forEach(track => track.stop());
        state.stream = null;
        state.cameraBusy = false;
        const video = document.getElementById('inventoryCameraVideo');
        if (video) video.srcObject = null;
        const modal = document.getElementById('inventoryCameraModal');
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }
    }

    async function openCamera() {
        if (!navigator.mediaDevices?.getUserMedia || typeof window.jsQR !== 'function') {
            return setFeedback('inventoryScanFeedback', 'Камера или распознавание QR недоступны. Введите код вручную.', 'error');
        }
        const modal = document.getElementById('inventoryCameraModal');
        const video = document.getElementById('inventoryCameraVideo');
        const canvas = document.getElementById('inventoryCameraCanvas');
        const hint = document.getElementById('inventoryCameraHint');
        modal?.classList.add('active');
        modal?.setAttribute('aria-hidden', 'false');
        if (hint) hint.textContent = 'Запрашиваем доступ к камере...';
        try {
            state.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
            video.srcObject = state.stream;
            await video.play();
            if (hint) hint.textContent = 'Поместите QR в центр кадра';
            const context = canvas.getContext('2d', { willReadFrequently: true });
            const scan = () => {
                if (!state.stream) return;
                if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && !state.cameraBusy) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
                    const result = window.jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' });
                    if (result?.data) {
                        state.cameraBusy = true;
                        const code = result.data;
                        stopCamera();
                        const input = document.getElementById('inventoryScanInput');
                        if (input) input.value = code;
                        scanActiveBook(code);
                        return;
                    }
                }
                state.scanFrame = requestAnimationFrame(scan);
            };
            scan();
        } catch (error) {
            stopCamera();
            setFeedback('inventoryScanFeedback', error?.name === 'NotAllowedError'
                ? 'Доступ к камере запрещён. Разрешите его в настройках браузера или введите код вручную.'
                : 'Не удалось запустить камеру.', 'error');
        }
    }

    function init() {
        const session = (() => { try { return JSON.parse(localStorage.getItem('bibliotech_current_user') || 'null'); } catch { return null; } })();
        if (!session || session.role !== 'admin') return;
        document.getElementById('inventoryStartForm')?.addEventListener('submit', startInventory);
        document.getElementById('inventoryScanBtn')?.addEventListener('click', () => scanActiveBook());
        document.getElementById('inventoryScanInput')?.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                scanActiveBook();
            }
        });
        document.getElementById('inventoryCompleteBtn')?.addEventListener('click', completeInventory);
        document.getElementById('inventoryReportBtn')?.addEventListener('click', downloadInventoryReport);
        document.getElementById('refreshInventoryBtn')?.addEventListener('click', loadInventorySessions);
        document.getElementById('inventoryHistoryList')?.addEventListener('click', event => {
            const button = event.target.closest('[data-inventory-open]');
            if (button) loadSession(button.dataset.inventoryOpen).catch(error => setFeedback('inventoryScanFeedback', error.message, 'error'));
        });
        document.getElementById('documentBuilderForm')?.addEventListener('submit', generateDocument);
        document.getElementById('documentTypeSelect')?.addEventListener('change', event => {
            const writeoff = event.target.value === 'writeoff';
            const reason = document.getElementById('documentReasonField');
            if (reason) reason.hidden = !writeoff;
        });
        document.getElementById('inventoryCameraBtn')?.addEventListener('click', openCamera);
        document.getElementById('closeInventoryCameraBtn')?.addEventListener('click', stopCamera);
        document.getElementById('stopInventoryCameraBtn')?.addEventListener('click', stopCamera);
        document.getElementById('inventoryCameraModal')?.addEventListener('click', event => {
            if (event.target.id === 'inventoryCameraModal') stopCamera();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && state.stream) stopCamera();
        });
        window.addEventListener('pagehide', stopCamera);
        loadLocations();
        loadInventorySessions();
    }

    window.BibliotechDocuments = { downloadRentalAct };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
