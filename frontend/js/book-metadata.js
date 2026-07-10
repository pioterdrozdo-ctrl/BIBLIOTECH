(function () {
    'use strict';

    const API_URL = window.BIBLIOTECH_API_URL || '/api';
    let pendingMetadata = null;
    let appliedIsbn = '';
    let lookupController = null;

    function byId(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value = '') {
        return String(value).replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
        }[character]));
    }

    function normalizeIsbn(value) {
        return String(value || '').toUpperCase().replace(/[^0-9X]/g, '');
    }

    function appState() {
        try { return typeof state !== 'undefined' ? state : null; }
        catch { return null; }
    }

    function token() {
        return localStorage.getItem('token') || '';
    }

    function setStatus(message = '', type = '') {
        const status = byId('bookIsbnStatus');
        if (!status) return;
        status.textContent = message;
        status.className = `isbn-status ${type}`.trim();
    }

    function setInputValue(id, value) {
        const element = byId(id);
        if (element) element.value = value ?? '';
    }

    function getInputValue(id) {
        return String(byId(id)?.value || '').trim();
    }

    function mountFormFields() {
        const form = byId('bookForm');
        const titleGroup = byId('bookTitle')?.closest('.form-group');
        const descriptionGroup = byId('bookDesc')?.closest('.form-group');
        if (!form || !titleGroup || !descriptionGroup || byId('bookIsbn')) return;

        const isbnSection = document.createElement('section');
        isbnSection.className = 'isbn-assistant';
        isbnSection.innerHTML = `
            <div class="isbn-assistant-head">
                <div>
                    <b>ISBN и данные издания</b>
                    <span>Введите ISBN-10 или ISBN-13. Данные можно проверить до сохранения.</span>
                </div>
                <span class="isbn-provider">Open Library</span>
            </div>
            <div class="isbn-lookup-row">
                <label class="isbn-input-field">
                    <span>ISBN</span>
                    <input id="bookIsbn" type="text" maxlength="17" inputmode="numeric" autocomplete="off" placeholder="978-5-699-12014-7">
                </label>
                <button id="lookupBookIsbnBtn" type="button">Найти данные</button>
            </div>
            <p class="isbn-status" id="bookIsbnStatus" aria-live="polite"></p>
            <div class="isbn-preview" id="bookIsbnPreview" hidden></div>
        `;
        titleGroup.parentNode.insertBefore(isbnSection, titleGroup);

        const metadataGrid = document.createElement('div');
        metadataGrid.className = 'book-metadata-form-grid';
        metadataGrid.innerHTML = `
            <label class="form-group">
                <span>Год издания</span>
                <input id="bookPublicationYear" type="number" min="1000" max="2100" inputmode="numeric" placeholder="2024">
            </label>
            <label class="form-group">
                <span>Издательство</span>
                <input id="bookPublisher" type="text" maxlength="255" placeholder="Название издательства">
            </label>
            <label class="form-group">
                <span>Жанр</span>
                <input id="bookGenre" type="text" maxlength="160" placeholder="Роман, программирование...">
            </label>
            <label class="form-group">
                <span>Язык</span>
                <input id="bookLanguage" type="text" maxlength="80" placeholder="Русский">
            </label>
            <input id="bookMetadataSource" type="hidden">
            <input id="bookMetadataSourceUrl" type="hidden">
        `;
        descriptionGroup.parentNode.insertBefore(metadataGrid, descriptionGroup);

        byId('lookupBookIsbnBtn')?.addEventListener('click', lookupIsbn);
        byId('bookIsbn')?.addEventListener('input', () => {
            const current = normalizeIsbn(getInputValue('bookIsbn'));
            if (current !== appliedIsbn) {
                pendingMetadata = null;
                setInputValue('bookMetadataSource', '');
                setInputValue('bookMetadataSourceUrl', '');
                const preview = byId('bookIsbnPreview');
                if (preview) preview.hidden = true;
                setStatus(current ? 'Нажмите «Найти данные», чтобы проверить ISBN.' : '');
            }
        });
        form.addEventListener('submit', saveBookWithMetadata, true);
    }

    function metadataLine(label, value) {
        return value ? `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>` : '';
    }

    function renderLookupPreview(metadata) {
        const preview = byId('bookIsbnPreview');
        if (!preview) return;
        const cover = metadata.coverDataURL
            ? `<img src="${escapeHtml(metadata.coverDataURL)}" alt="Обложка найденного издания">`
            : '<span class="isbn-preview-placeholder">📖</span>';
        preview.innerHTML = `
            <div class="isbn-preview-main">
                <div class="isbn-preview-cover">${cover}</div>
                <div class="isbn-preview-copy">
                    <span class="isbn-preview-kicker">Найденное издание</span>
                    <h3>${escapeHtml(metadata.title || 'Без названия')}</h3>
                    <p>${escapeHtml(metadata.author || 'Автор не указан')}</p>
                    <div class="isbn-preview-meta">
                        ${metadataLine('Год', metadata.publicationYear)}
                        ${metadataLine('Издательство', metadata.publisher)}
                        ${metadataLine('Жанр', metadata.genre)}
                        ${metadataLine('Язык', metadata.language)}
                    </div>
                </div>
            </div>
            <div class="isbn-preview-actions">
                <button id="cancelIsbnMetadataBtn" type="button" class="isbn-preview-secondary">Не применять</button>
                <button id="applyIsbnMetadataBtn" type="button" class="isbn-preview-primary">Применить данные</button>
            </div>
            <small>После применения все поля останутся редактируемыми.</small>
        `;
        preview.hidden = false;
        byId('cancelIsbnMetadataBtn')?.addEventListener('click', () => {
            pendingMetadata = null;
            preview.hidden = true;
            setStatus('Данные не применены. ISBN можно заполнить вручную.', 'neutral');
        });
        byId('applyIsbnMetadataBtn')?.addEventListener('click', applyPendingMetadata);
    }

    async function lookupIsbn() {
        const isbn = normalizeIsbn(getInputValue('bookIsbn'));
        if (!isbn) {
            setStatus('Введите ISBN.', 'error');
            byId('bookIsbn')?.focus();
            return;
        }

        lookupController?.abort();
        lookupController = new AbortController();
        const button = byId('lookupBookIsbnBtn');
        if (button) {
            button.disabled = true;
            button.textContent = 'Ищем…';
        }
        setStatus('Проверяем ISBN и ищем сведения об издании…', 'loading');
        const preview = byId('bookIsbnPreview');
        if (preview) preview.hidden = true;

        try {
            const response = await fetch(`${API_URL}/book-metadata/isbn/${encodeURIComponent(isbn)}`, {
                headers: { Authorization: token() ? `Bearer ${token()}` : '' },
                signal: lookupController.signal
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Не удалось получить данные по ISBN.');
            pendingMetadata = payload.metadata;
            setInputValue('bookIsbn', pendingMetadata.isbn || isbn);
            renderLookupPreview(pendingMetadata);
            setStatus('Данные найдены. Проверьте их и нажмите «Применить данные».', 'success');
        } catch (error) {
            if (error.name === 'AbortError') return;
            pendingMetadata = null;
            setStatus(error.message || 'Не удалось получить данные по ISBN.', 'error');
        } finally {
            lookupController = null;
            if (button) {
                button.disabled = false;
                button.textContent = 'Найти данные';
            }
        }
    }

    function applyPendingMetadata() {
        if (!pendingMetadata) return;
        const metadata = pendingMetadata;
        setInputValue('bookIsbn', metadata.isbn);
        setInputValue('bookTitle', metadata.title);
        setInputValue('bookAuthor', metadata.author);
        if (metadata.description) setInputValue('bookDesc', metadata.description);
        setInputValue('bookPublicationYear', metadata.publicationYear);
        setInputValue('bookPublisher', metadata.publisher);
        setInputValue('bookGenre', metadata.genre);
        setInputValue('bookLanguage', metadata.language);
        setInputValue('bookMetadataSource', metadata.source || 'openlibrary');
        setInputValue('bookMetadataSourceUrl', metadata.sourceUrl || '');
        appliedIsbn = normalizeIsbn(metadata.isbn);

        const currentState = appState();
        if (metadata.coverDataURL && currentState) {
            currentState.coverDataUrl = metadata.coverDataURL;
            const preview = byId('imagePreview');
            if (preview) preview.innerHTML = `<img src="${escapeHtml(metadata.coverDataURL)}" class="preview-img" alt="preview"><span>Обложка получена по ISBN</span>`;
            byId('clearBookCoverBtn')?.classList.remove('hidden');
        }
        byId('bookIsbnPreview').hidden = true;
        pendingMetadata = null;
        setStatus('Данные применены. Проверьте поля и сохраните книгу.', 'success');
    }

    function readBookData() {
        const currentState = appState();
        const copies = Math.max(0, Number(byId('bookCopies')?.value || 0));
        const available = copies > 0 && Boolean(byId('bookAvailable')?.checked);
        const yearRaw = getInputValue('bookPublicationYear');
        return {
            title: getInputValue('bookTitle'),
            author: getInputValue('bookAuthor'),
            description: getInputValue('bookDesc'),
            coverDataURL: currentState?.coverDataUrl || null,
            copies: available ? Math.max(1, copies) : 0,
            available,
            locationId: byId('bookLocationSelect')?.value ? Number(byId('bookLocationSelect').value) : null,
            isbn: normalizeIsbn(getInputValue('bookIsbn')) || null,
            publicationYear: yearRaw ? Number(yearRaw) : null,
            publisher: getInputValue('bookPublisher') || null,
            genre: getInputValue('bookGenre') || null,
            language: getInputValue('bookLanguage') || null,
            metadataSource: getInputValue('bookMetadataSource') || null,
            metadataSourceUrl: getInputValue('bookMetadataSourceUrl') || null
        };
    }

    async function saveBookWithMetadata(event) {
        const currentState = appState();
        if (!currentState || typeof migrateBook !== 'function' || typeof renderBooks !== 'function') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (typeof canManageBooks === 'function' && !canManageBooks()) {
            notify?.('Редактировать книги может только админ', 'error');
            return;
        }

        const data = readBookData();
        if (!data.title || !data.author) {
            notify?.('Заполните название и автора', 'error');
            return;
        }
        const editingId = currentState.editingBookId ? Number(currentState.editingBookId) : null;
        const existingBook = editingId ? currentState.books.find(book => Number(book.id) === editingId) : null;
        const endpoint = editingId
            ? `${API_URL}/book-metadata/books/${editingId}`
            : `${API_URL}/book-metadata/books`;
        const submit = document.querySelector('#bookModal .submit-modal');
        if (submit) {
            submit.disabled = true;
            submit.textContent = editingId ? 'Сохраняем…' : 'Добавляем…';
        }

        try {
            const response = await fetch(endpoint, {
                method: editingId ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: token() ? `Bearer ${token()}` : ''
                },
                body: JSON.stringify(data)
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить книгу.');

            const migrated = migrateBook({
                ...payload,
                coverDataURL: payload.coverDataURL || payload.cover_data_url || data.coverDataURL,
                dateAdded: payload.created_at ? formatDate(new Date(payload.created_at)) : (existingBook?.dateAdded || formatDate()),
                comments: Array.isArray(payload.comments) ? payload.comments : (existingBook?.comments || [])
            });
            if (editingId) {
                const index = currentState.books.findIndex(book => Number(book.id) === editingId);
                if (index >= 0) currentState.books[index] = { ...currentState.books[index], ...migrated };
                else currentState.books.unshift(migrated);
            } else {
                currentState.books.unshift(migrated);
            }
            saveBooks();
            closeModal('#bookModal');
            resetBookForm();
            renderBooks();
            if (editingId) openBook(editingId);
            notify?.(editingId ? 'Карточка книги обновлена' : 'Книга добавлена в каталог', 'success');
        } catch (error) {
            notify?.(error.message || 'Не удалось сохранить книгу.', 'error');
        } finally {
            if (submit) {
                submit.disabled = false;
                submit.textContent = editingId ? 'Сохранить изменения' : 'Сохранить книгу';
            }
        }
    }

    function metadataFromBook(book = {}) {
        return {
            isbn: book.isbn || '',
            publicationYear: book.publicationYear ?? book.publication_year ?? '',
            publisher: book.publisher || '',
            genre: book.genre || '',
            language: book.language || '',
            metadataSource: book.metadataSource || book.metadata_source || '',
            metadataSourceUrl: book.metadataSourceUrl || book.metadata_source_url || ''
        };
    }

    function fillMetadataForm(book = null) {
        const metadata = metadataFromBook(book || {});
        setInputValue('bookIsbn', metadata.isbn);
        setInputValue('bookPublicationYear', metadata.publicationYear);
        setInputValue('bookPublisher', metadata.publisher);
        setInputValue('bookGenre', metadata.genre);
        setInputValue('bookLanguage', metadata.language);
        setInputValue('bookMetadataSource', metadata.metadataSource);
        setInputValue('bookMetadataSourceUrl', metadata.metadataSourceUrl);
        appliedIsbn = normalizeIsbn(metadata.isbn);
        pendingMetadata = null;
        const preview = byId('bookIsbnPreview');
        if (preview) preview.hidden = true;
        setStatus(metadata.isbn ? 'ISBN сохранён в карточке.' : '');
    }

    function resetMetadataForm() {
        ['bookIsbn', 'bookPublicationYear', 'bookPublisher', 'bookGenre', 'bookLanguage', 'bookMetadataSource', 'bookMetadataSourceUrl']
            .forEach(id => setInputValue(id, ''));
        appliedIsbn = '';
        pendingMetadata = null;
        const preview = byId('bookIsbnPreview');
        if (preview) preview.hidden = true;
        setStatus('');
    }

    function renderBookMetadata(book) {
        let section = byId('viewBibliographicMeta');
        const anchor = byId('viewMeta');
        if (!section && anchor) {
            section = document.createElement('section');
            section.id = 'viewBibliographicMeta';
            section.className = 'book-bibliographic-details';
            anchor.insertAdjacentElement('afterend', section);
        }
        if (!section) return;
        const fields = [
            ['ISBN', book.isbn],
            ['Год', book.publicationYear ?? book.publication_year],
            ['Издательство', book.publisher],
            ['Жанр', book.genre],
            ['Язык', book.language]
        ].filter(([, value]) => value !== null && value !== undefined && String(value).trim());
        if (!fields.length) {
            section.hidden = true;
            section.innerHTML = '';
            return;
        }
        section.hidden = false;
        const sourceUrl = book.metadataSourceUrl || book.metadata_source_url;
        section.innerHTML = `
            <div class="book-bibliographic-head">
                <b>Данные издания</b>
                ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Источник</a>` : ''}
            </div>
            <div class="book-bibliographic-grid">
                ${fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}
            </div>
        `;
    }

    function patchCatalogFunctions() {
        if (typeof migrateBook === 'function' && !migrateBook.__metadataPatched) {
            const original = migrateBook;
            const patched = function migrateBookWithMetadata(book) {
                return { ...original(book), ...metadataFromBook(book) };
            };
            patched.__metadataPatched = true;
            migrateBook = patched;
        }

        if (typeof getSearchScore === 'function' && !getSearchScore.__metadataPatched) {
            const original = getSearchScore;
            const patched = function getSearchScoreWithMetadata(book, query) {
                const base = original(book, query);
                const normalizedQuery = typeof normalizeText === 'function' ? normalizeText(query) : String(query || '').toLowerCase();
                if (!normalizedQuery) return base;
                const metadata = [book.isbn, book.publicationYear, book.publisher, book.genre, book.language]
                    .map(value => typeof normalizeText === 'function' ? normalizeText(value || '') : String(value || '').toLowerCase())
                    .join(' ');
                if (metadata.includes(normalizedQuery)) return Math.max(base, 90);
                return base;
            };
            patched.__metadataPatched = true;
            getSearchScore = patched;
        }

        if (typeof openBook === 'function' && !openBook.__metadataPatched) {
            const original = openBook;
            const patched = function openBookWithMetadata(bookId) {
                original(bookId);
                const currentState = appState();
                const book = currentState?.books.find(item => Number(item.id) === Number(bookId));
                if (book) renderBookMetadata(book);
            };
            patched.__metadataPatched = true;
            openBook = patched;
        }

        if (typeof openBookEditor === 'function' && !openBookEditor.__metadataPatched) {
            const original = openBookEditor;
            const patched = function openBookEditorWithMetadata(bookId) {
                original(bookId);
                const currentState = appState();
                fillMetadataForm(currentState?.books.find(item => Number(item.id) === Number(bookId)) || null);
            };
            patched.__metadataPatched = true;
            openBookEditor = patched;
        }

        if (typeof resetBookForm === 'function' && !resetBookForm.__metadataPatched) {
            const original = resetBookForm;
            const patched = function resetBookFormWithMetadata() {
                original();
                resetMetadataForm();
            };
            patched.__metadataPatched = true;
            resetBookForm = patched;
        }
    }

    function init() {
        mountFormFields();
        patchCatalogFunctions();
        const modal = byId('bookModal');
        if (modal && !modal.dataset.metadataObserverReady) {
            modal.dataset.metadataObserverReady = 'true';
            new MutationObserver(() => {
                if (!modal.classList.contains('active')) return;
                const currentState = appState();
                const editingId = currentState?.editingBookId;
                fillMetadataForm(editingId ? currentState.books.find(book => Number(book.id) === Number(editingId)) : null);
            }).observe(modal, { attributes: true, attributeFilter: ['class'] });
        }
    }

    window.BibliotechBookMetadata = {
        lookupIsbn,
        applyPendingMetadata,
        renderBookMetadata
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
