(function () {
    'use strict';

    const apiBase = window.BIBLIOTECH_API_URL || '/api';
    const MAX_FILE_BYTES = 5 * 1024 * 1024;
    const ALLOWED_EXTENSIONS = ['.csv', '.xlsx'];
    let previewState = null;
    let activeRequest = null;
    let lastTrigger = null;

    function escapeHtml(value = '') {
        return String(value).replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
        }[char]));
    }

    function getToken() {
        return localStorage.getItem('token') || '';
    }

    function getElement(id) {
        return document.getElementById(id);
    }

    function setHidden(id, hidden) {
        const element = getElement(id);
        if (element) element.hidden = hidden;
    }

    function formatBytes(bytes) {
        const value = Number(bytes || 0);
        if (value < 1024) return `${value} Б`;
        if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
        return `${(value / 1024 / 1024).toFixed(1)} МБ`;
    }

    function fileExtension(fileName) {
        const index = String(fileName || '').lastIndexOf('.');
        return index >= 0 ? String(fileName).slice(index).toLowerCase() : '';
    }

    function setBusy(busy) {
        const close = getElement('closeBookImportBtn');
        const cancel = getElement('bookImportCancelBtn');
        const commit = getElement('bookImportCommitBtn');
        const replace = getElement('bookImportReplaceFileBtn');
        [close, cancel, replace].forEach(button => { if (button) button.disabled = busy; });
        if (commit) commit.disabled = busy || !canCommit();
    }

    function showError(message) {
        const error = getElement('bookImportError');
        if (!error) return;
        error.textContent = message || 'Не удалось выполнить импорт.';
        error.hidden = false;
    }

    function clearError() {
        const error = getElement('bookImportError');
        if (!error) return;
        error.textContent = '';
        error.hidden = true;
    }

    function resetStages() {
        setHidden('bookImportUploadStage', false);
        setHidden('bookImportLoading', true);
        setHidden('bookImportPreviewStage', true);
        setHidden('bookImportResultStage', true);
        setHidden('bookImportOpenCatalogBtn', true);
        clearError();
        previewState = null;
        const input = getElement('bookImportFileInput');
        if (input) input.value = '';
        const commit = getElement('bookImportCommitBtn');
        if (commit) {
            commit.hidden = false;
            commit.disabled = true;
            commit.textContent = 'Добавить книги';
        }
        const cancel = getElement('bookImportCancelBtn');
        if (cancel) cancel.textContent = 'Отмена';
    }

    function openModal(trigger) {
        const modal = getElement('bookImportModal');
        if (!modal) return;
        lastTrigger = trigger || document.activeElement;
        resetStages();
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('book-import-open');
        setTimeout(() => getElement('bookImportDropzone')?.focus(), 0);
    }

    function closeModal() {
        activeRequest?.abort();
        activeRequest = null;
        const modal = getElement('bookImportModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('book-import-open');
        resetStages();
        if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true });
    }

    function validateFile(file) {
        if (!file) return 'Выберите файл.';
        if (!ALLOWED_EXTENSIONS.includes(fileExtension(file.name))) return 'Поддерживаются только файлы CSV и XLSX.';
        if (file.size <= 0) return 'Файл пустой.';
        if (file.size > MAX_FILE_BYTES) return 'Файл должен быть меньше 5 МБ.';
        return '';
    }

    function summaryCard(label, value, className = '') {
        return `<article class="book-import-summary-card ${className}"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></article>`;
    }

    function renderSummary(summary = {}) {
        const container = getElement('bookImportSummary');
        if (!container) return;
        container.innerHTML = [
            summaryCard('Всего строк', summary.total || 0),
            summaryCard('Готово', summary.ready || 0, 'is-ready'),
            summaryCard('В каталоге', summary.duplicateCatalog || 0, summary.duplicateCatalog ? 'is-warning' : ''),
            summaryCard('Повторы в файле', summary.duplicateFile || 0, summary.duplicateFile ? 'is-warning' : ''),
            summaryCard('С ошибками', summary.errors || 0, summary.errors ? 'is-error' : ''),
            summaryCard('Предупреждения', summary.warnings || 0, summary.warnings ? 'is-warning' : '')
        ].join('');
    }

    function statusCopy(row) {
        if (row.status === 'error') return ['Ошибка', 'error'];
        if (row.duplicate?.type === 'catalog') return ['Уже в каталоге', 'duplicate'];
        if (row.duplicate?.type === 'file') return ['Повтор в файле', 'duplicate'];
        return ['Готово', 'ready'];
    }

    function rowMessages(row) {
        const messages = [];
        (row.errors || []).forEach(message => messages.push(`<span class="error">${escapeHtml(message)}</span>`));
        if (row.duplicate?.message) messages.push(`<span class="warning">${escapeHtml(row.duplicate.message)}</span>`);
        (row.warnings || []).forEach(message => messages.push(`<span class="warning">${escapeHtml(message)}</span>`));
        if (!messages.length) messages.push('<span class="ok">Проверка пройдена</span>');
        return messages.join('');
    }

    function renderRows(rows = []) {
        const tbody = getElement('bookImportPreviewBody');
        if (!tbody) return;
        tbody.innerHTML = rows.map(row => {
            const [label, statusClass] = statusCopy(row);
            return `
                <tr data-import-row="${escapeHtml(row.rowNumber)}">
                    <td><b>${escapeHtml(row.rowNumber || '—')}</b></td>
                    <td><span class="book-import-status ${statusClass}">${escapeHtml(label)}</span></td>
                    <td class="book-import-book-cell"><b>${escapeHtml(row.data?.title || 'Без названия')}</b><small>${escapeHtml(row.data?.description || 'Без описания')}</small></td>
                    <td>${escapeHtml(row.data?.author || '—')}</td>
                    <td>${escapeHtml(row.data?.copies ?? '—')}</td>
                    <td>${escapeHtml(row.data?.locationLabel || 'Не указано')}</td>
                    <td><div class="book-import-message-list">${rowMessages(row)}</div></td>
                </tr>`;
        }).join('');
    }

    function importCount() {
        if (!previewState?.summary) return 0;
        const strategy = getElement('bookImportDuplicateStrategy')?.value || 'skip';
        const mergeableDuplicates = strategy === 'merge_copies'
            ? (previewState.rows || []).filter(row => row.duplicate?.type === 'catalog' && Number(row.data?.copies || 0) > 0).length
            : 0;
        return Number(previewState.summary.ready || 0) + mergeableDuplicates;
    }

    function canCommit() {
        return Boolean(previewState?.importToken && importCount() > 0);
    }

    function updateCommitButton() {
        const button = getElement('bookImportCommitBtn');
        if (!button) return;
        const count = importCount();
        button.disabled = count <= 0;
        button.textContent = count > 0 ? `Добавить книги · ${count}` : 'Нет строк для добавления';
    }

    function renderPreview(payload) {
        previewState = payload;
        setHidden('bookImportUploadStage', true);
        setHidden('bookImportLoading', true);
        setHidden('bookImportResultStage', true);
        setHidden('bookImportPreviewStage', false);
        clearError();

        const fileName = getElement('bookImportFileName');
        const fileMeta = getElement('bookImportFileMeta');
        if (fileName) fileName.textContent = payload.file?.name || 'Файл';
        if (fileMeta) {
            const meta = [formatBytes(payload.file?.size), payload.file?.sheetName, `${payload.summary?.total || 0} строк`].filter(Boolean);
            fileMeta.textContent = meta.join(' · ');
        }
        renderSummary(payload.summary);
        renderRows(payload.rows);
        setHidden('bookImportStrategyBlock', !payload.summary?.duplicateCatalog);
        updateCommitButton();
    }

    async function previewFile(file) {
        const validationError = validateFile(file);
        if (validationError) {
            showError(validationError);
            return;
        }

        activeRequest?.abort();
        activeRequest = new AbortController();
        clearError();
        setHidden('bookImportUploadStage', true);
        setHidden('bookImportPreviewStage', true);
        setHidden('bookImportResultStage', true);
        setHidden('bookImportLoading', false);
        setBusy(true);

        try {
            const body = new FormData();
            body.append('file', file, file.name);
            const response = await fetch(`${apiBase}/books/import/preview`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}` },
                body,
                signal: activeRequest.signal
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Не удалось проверить файл.');
            renderPreview(payload);
        } catch (error) {
            if (error.name === 'AbortError') return;
            setHidden('bookImportLoading', true);
            setHidden('bookImportUploadStage', false);
            showError(error.message || 'Не удалось проверить файл.');
        } finally {
            activeRequest = null;
            setBusy(false);
            updateCommitButton();
        }
    }

    function renderResult(payload) {
        setHidden('bookImportUploadStage', true);
        setHidden('bookImportLoading', true);
        setHidden('bookImportPreviewStage', true);
        setHidden('bookImportResultStage', false);
        setHidden('bookImportOpenCatalogBtn', false);
        clearError();

        const text = getElement('bookImportResultText');
        if (text) {
            text.textContent = payload.errors
                ? 'Корректные строки обработаны, строки с ошибками пропущены.'
                : 'Каталог успешно обновлён. Для новых книг автоматически созданы QR-коды.';
        }
        const grid = getElement('bookImportResultGrid');
        if (grid) {
            grid.innerHTML = `
                <article><b>${escapeHtml(payload.created || 0)}</b><span>новых книг</span></article>
                <article><b>${escapeHtml(payload.merged || 0)}</b><span>обновлено дублей</span></article>
                <article><b>${escapeHtml(payload.skipped || 0)}</b><span>пропущено</span></article>
                <article><b>${escapeHtml(payload.errors || 0)}</b><span>с ошибками</span></article>`;
        }
        const commit = getElement('bookImportCommitBtn');
        if (commit) commit.hidden = true;
        const cancel = getElement('bookImportCancelBtn');
        if (cancel) cancel.textContent = 'Закрыть';
    }

    async function commitImport() {
        if (!canCommit()) return;
        activeRequest?.abort();
        activeRequest = new AbortController();
        clearError();
        setBusy(true);
        const button = getElement('bookImportCommitBtn');
        if (button) button.textContent = 'Добавляем книги…';

        try {
            const response = await fetch(`${apiBase}/books/import/commit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getToken()}`
                },
                body: JSON.stringify({
                    rows: previewState.rows.map(row => ({ rowNumber: row.rowNumber, data: row.data })),
                    importToken: previewState.importToken,
                    duplicateStrategy: getElement('bookImportDuplicateStrategy')?.value || 'skip'
                }),
                signal: activeRequest.signal
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Не удалось выполнить импорт.');
            renderResult(payload);
        } catch (error) {
            if (error.name === 'AbortError') return;
            showError(error.message || 'Не удалось выполнить импорт.');
            updateCommitButton();
        } finally {
            activeRequest = null;
            setBusy(false);
            if (!getElement('bookImportResultStage')?.hidden) {
                const commit = getElement('bookImportCommitBtn');
                if (commit) commit.hidden = true;
            } else {
                updateCommitButton();
            }
        }
    }

    function csvCell(value) {
        const text = String(value ?? '');
        return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function downloadTemplate() {
        const rows = [
            ['Название', 'Автор', 'Описание', 'Количество', 'Доступна', 'ID места', 'Полка', 'Место', 'Заметка', 'Обложка URL'],
            ['Облачные вычисления', 'Иван Иванов', 'Учебное пособие', '2', 'да', '', 'ИКТ-ФВ 13', '09', 'Надставка', '']
        ];
        const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'bibliotech_import_template.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function chooseAnotherFile() {
        previewState = null;
        setHidden('bookImportPreviewStage', true);
        setHidden('bookImportUploadStage', false);
        clearError();
        const input = getElement('bookImportFileInput');
        if (input) {
            input.value = '';
            input.click();
        }
    }

    function wireDropzone() {
        const dropzone = getElement('bookImportDropzone');
        const input = getElement('bookImportFileInput');
        if (!dropzone || !input) return;

        dropzone.addEventListener('click', () => input.click());
        input.addEventListener('change', () => previewFile(input.files?.[0]));
        ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, event => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            dropzone.classList.add('is-dragover');
        }));
        ['dragleave', 'dragend'].forEach(type => dropzone.addEventListener(type, () => dropzone.classList.remove('is-dragover')));
        dropzone.addEventListener('drop', event => {
            event.preventDefault();
            dropzone.classList.remove('is-dragover');
            previewFile(event.dataTransfer.files?.[0]);
        });
    }

    function init() {
        const modal = getElement('bookImportModal');
        if (!modal || modal.dataset.importReady === 'true') return;
        modal.dataset.importReady = 'true';

        getElement('openBookImportBtn')?.addEventListener('click', event => openModal(event.currentTarget));
        getElement('downloadBookImportTemplateBtn')?.addEventListener('click', downloadTemplate);
        getElement('closeBookImportBtn')?.addEventListener('click', closeModal);
        getElement('bookImportCancelBtn')?.addEventListener('click', closeModal);
        getElement('bookImportReplaceFileBtn')?.addEventListener('click', chooseAnotherFile);
        getElement('bookImportCommitBtn')?.addEventListener('click', commitImport);
        getElement('bookImportDuplicateStrategy')?.addEventListener('change', updateCommitButton);
        modal.addEventListener('click', event => {
            if (event.target === modal && !activeRequest) closeModal();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && modal.classList.contains('active') && !activeRequest) closeModal();
        });
        wireDropzone();
    }

    window.BibliotechBookImport = {
        open: openModal,
        close: closeModal,
        previewFile,
        downloadTemplate
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
