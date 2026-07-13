(function () {
    'use strict';

    const ROOM_CODE = '125';
    const params = new URLSearchParams(window.location.search);
    const requestedBookId = Number(params.get('book'));
    const bookId = Number.isSafeInteger(requestedBookId) && requestedBookId > 0 ? requestedBookId : null;

    const elements = {
        status: document.getElementById('mapLiteStatus'),
        error: document.getElementById('mapLiteError'),
        content: document.getElementById('mapLiteContent'),
        pageTitle: document.querySelector('.map-lite-heading h1'),
        bookKicker: document.querySelector('.map-lite-card-head .map-lite-eyebrow'),
        title: document.getElementById('mapLiteBookTitle'),
        meta: document.getElementById('mapLiteBookMeta'),
        locationTitle: document.getElementById('mapLiteLocationTitle'),
        locationNote: document.getElementById('mapLiteLocationNote'),
        books: document.getElementById('mapLiteBooks'),
        svg: document.getElementById('mapLiteSvg'),
        fullMap: document.getElementById('openFullMapLink'),
        backLink: document.querySelector('.map-lite-back'),
        menuButton: document.getElementById('mapLiteMenuButton'),
        nav: document.getElementById('mapLiteNav')
    };

    const state = {
        data: null,
        targetBook: null,
        selectedLocationId: null
    };

    function setupMobileMenu() {
        const setOpen = open => {
            if (!elements.menuButton || !elements.nav) return;
            elements.nav.classList.toggle('active', open);
            elements.menuButton.classList.toggle('active', open);
            elements.menuButton.setAttribute('aria-expanded', String(open));
            elements.menuButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
            document.body.classList.toggle('lock', open);
        };

        elements.menuButton?.addEventListener('click', () => {
            setOpen(!elements.nav?.classList.contains('active'));
        });
        elements.nav?.addEventListener('click', event => {
            if (event.target.closest('a[href]')) setOpen(false);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && elements.nav?.classList.contains('active')) {
                setOpen(false);
                elements.menuButton?.focus();
            }
        });
    }

    function svgElement(name, attributes = {}) {
        const element = document.createElementNS('http://www.w3.org/2000/svg', name);
        Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
        return element;
    }

    function booksForLocation(locationId) {
        return (state.data?.books || []).filter(book => Number(book.location_id) === Number(locationId));
    }

    function locationById(locationId) {
        return (state.data?.locations || []).find(location => Number(location.id) === Number(locationId)) || null;
    }

    function locationForObject(object) {
        return locationById(object?.storage_location_id);
    }

    function showError(message) {
        elements.status.classList.add('hidden');
        elements.content.classList.add('hidden');
        elements.error.textContent = message;
        elements.error.classList.remove('hidden');
    }

    function renderBookHeader() {
        if (!bookId) {
            if (elements.pageTitle) elements.pageTitle.textContent = 'Карта библиотеки';
            if (elements.bookKicker) elements.bookKicker.textContent = 'Физический фонд';
            if (elements.backLink) {
                elements.backLink.href = 'home.html';
                elements.backLink.textContent = '← Вернуться в каталог';
            }
            elements.title.textContent = 'Кабинет 125';
            elements.meta.textContent = 'Выберите место на схеме, чтобы посмотреть находящиеся там книги.';
            elements.fullMap.href = 'map.html';
            return;
        }

        if (elements.pageTitle) elements.pageTitle.textContent = 'Место книги на карте';
        if (elements.bookKicker) elements.bookKicker.textContent = 'Искомая книга';
        if (elements.backLink) {
            elements.backLink.href = `home.html?book=${encodeURIComponent(bookId)}`;
            elements.backLink.textContent = '← Вернуться к книге';
        }

        if (!state.targetBook) {
            elements.title.textContent = 'Книга не найдена';
            elements.meta.textContent = `В каталоге нет книги с идентификатором ${bookId}.`;
            elements.fullMap.href = `map.html?book=${encodeURIComponent(bookId)}`;
            return;
        }

        elements.title.textContent = state.targetBook.title;
        elements.meta.textContent = [
            state.targetBook.author || 'Автор не указан',
            state.targetBook.available && Number(state.targetBook.copies || 0) > 0 ? 'В наличии' : 'Сейчас недоступна'
        ].join(' · ');
        elements.fullMap.href = `map.html?book=${encodeURIComponent(state.targetBook.id)}`;
    }

    function renderLocationPanel() {
        const location = locationById(state.selectedLocationId);
        elements.books.replaceChildren();
        if (!location) {
            elements.locationTitle.textContent = 'Место не выбрано';
            elements.locationNote.textContent = state.targetBook
                ? 'Для этой книги ещё не назначено физическое место хранения.'
                : 'Нажмите на место хранения на схеме.';
            const empty = document.createElement('p');
            empty.className = 'map-lite-empty';
            empty.textContent = state.targetBook ? 'Список книг недоступен.' : 'Выберите место на схеме.';
            elements.books.appendChild(empty);
            return;
        }

        elements.locationTitle.textContent = `${location.shelf_code || location.shelfCode || 'Стеллаж'} · место ${location.place_code || location.placeCode || '?'}`;
        elements.locationNote.textContent = location.note || 'Кабинет 125';
        const books = booksForLocation(location.id);
        if (!books.length) {
            const empty = document.createElement('p');
            empty.className = 'map-lite-empty';
            empty.textContent = 'В этом месте книги пока не указаны.';
            elements.books.appendChild(empty);
            return;
        }

        books.forEach(book => {
            const card = document.createElement('article');
            card.className = `map-lite-book${Number(book.id) === Number(bookId) ? ' target' : ''}`;
            const title = document.createElement('b');
            title.textContent = book.title;
            const author = document.createElement('span');
            author.textContent = book.author || 'Автор не указан';
            const availability = document.createElement('small');
            availability.textContent = book.available && Number(book.copies || 0) > 0
                ? `В наличии · ${Number(book.copies || 0)} экз.`
                : 'Сейчас недоступна';
            card.append(title, author, availability);
            elements.books.appendChild(card);
        });
    }

    function selectLocation(locationId) {
        state.selectedLocationId = Number(locationId) || null;
        renderMap();
        renderLocationPanel();
    }

    function renderMap() {
        elements.svg.replaceChildren();
        const title = svgElement('title');
        title.textContent = 'Схема кабинета 125 с местами хранения книг';
        elements.svg.appendChild(title);
        elements.svg.appendChild(svgElement('rect', { x: 55, y: 45, width: 690, height: 420, rx: 18, class: 'map-lite-room' }));
        elements.svg.appendChild(svgElement('rect', { x: 130, y: 240, width: 520, height: 75, rx: 12, class: 'map-lite-aisle' }));

        const aisleLabel = svgElement('text', { x: 390, y: 285, class: 'map-lite-room-label', 'text-anchor': 'middle' });
        aisleLabel.textContent = 'Основной проход';
        elements.svg.appendChild(aisleLabel);

        const storageObjects = (state.data?.objects || []).filter(object => object.object_type === 'storage' && object.storage_location_id);
        storageObjects.forEach(object => {
            const location = locationForObject(object);
            const width = Math.max(76, Number(object.width || 1) * 52);
            const height = Math.max(60, Number(object.depth || 1) * 52);
            const x = 400 + Number(object.x || 0) * 52 - width / 2;
            const y = 255 + Number(object.z || 0) * 52 - height / 2;
            const isTarget = Number(state.targetBook?.location_id) === Number(location?.id);
            const isSelected = Number(state.selectedLocationId) === Number(location?.id);
            const rect = svgElement('rect', {
                x,
                y,
                width,
                height,
                rx: 12,
                class: `map-lite-storage${isTarget ? ' target' : ''}${isSelected ? ' selected' : ''}`,
                tabindex: 0,
                role: 'button',
                'aria-label': object.label || `Место ${location?.place_code || '?'}`
            });
            rect.addEventListener('click', () => selectLocation(location?.id));
            rect.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectLocation(location?.id);
                }
            });
            const label = svgElement('text', { x: x + width / 2, y: y + height / 2, class: 'map-lite-label' });
            label.textContent = String(location?.place_code || '?').padStart(2, '0');
            elements.svg.append(rect, label);
        });

        const entrance = svgElement('text', { x: 78, y: 405, class: 'map-lite-room-label' });
        entrance.textContent = 'Вход →';
        elements.svg.appendChild(entrance);
    }

    async function loadMap() {
        const response = await fetch(`/api/library-map/room/${ROOM_CODE}`, {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) throw new Error(payload?.error || 'Сервер не вернул данные карты.');
        if (!Array.isArray(payload.objects) || !Array.isArray(payload.locations) || !Array.isArray(payload.books)) {
            throw new Error('Получены некорректные данные карты.');
        }
        return payload;
    }

    async function init() {
        setupMobileMenu();
        try {
            state.data = await loadMap();
            state.targetBook = bookId
                ? state.data.books.find(book => Number(book.id) === Number(bookId)) || null
                : null;
            state.selectedLocationId = state.targetBook?.location_id || null;
            renderBookHeader();
            renderMap();
            renderLocationPanel();
            elements.status.classList.add('hidden');
            elements.error.classList.add('hidden');
            elements.content.classList.remove('hidden');
        } catch (error) {
            console.error('[BOOK MAP]', error);
            showError(error.message || 'Не удалось открыть карту книги.');
        }
    }

    init();
})();
