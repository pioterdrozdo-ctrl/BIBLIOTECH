const STORAGE_KEY = 'book_catalog_v18';
const SESSION_KEY = 'bibliotech_current_user';
const POST_LOGIN_URL_KEY = 'bibliotech_post_login_url';
const API_URL = window.BIBLIOTECH_API_URL || '/api';
let currentToken = localStorage.getItem('token');
let booksRequestVersion = 0;
const state = {
    books: [],
    filter: 'all',
    sort: 'relevance',
    activeBookId: null,
    editingBookId: null,
    coverDataUrl: null,
    storageLocations: [],
    search: '',
    minCopies: 0
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function authToken() {
    return localStorage.getItem('token') || currentToken || '';
}

function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
    catch { return null; }
}

function clearAuthSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentToken = null;
}

function isGuest() {
    const session = getSession();
    return Boolean(session && session.guest);
}

function getRole() {
    const session = getSession();
    if (!session || session.guest) return 'guest';
    return session.role === 'admin' ? 'admin' : 'user';
}

function isAdmin() {
    return getRole() === 'admin';
}

function canManageBooks() {
    return isAdmin();
}

function canComment() {
    return getRole() !== 'guest';
}

function getRoleLabel() {
    const session = getSession();
    const username = session?.username || 'Пользователь';
    if (getRole() === 'admin') return `Админ: ${username}`;
    if (getRole() === 'user') return `Пользователь: ${username}`;
    return 'Гостевой режим';
}

function canDeleteComment(comment = {}) {
    if (isAdmin()) return true;
    if (!canComment()) return false;
    const session = getSession();
    const sameId = comment.user_id && session?.id && Number(comment.user_id) === Number(session.id);
    const sameName = comment.username && session?.username && comment.username === session.username;
    return Boolean(sameId || sameName);
}

function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
    }[char]));
}

function normalizeLocation(location = null) {
    if (!location) return null;
    const shelfCode = location.shelfCode || location.shelf_code || '';
    const placeCode = location.placeCode || location.place_code || '';
    if (!location.id && !shelfCode && !placeCode) return null;
    return {
        id: location.id,
        shelfCode,
        shelf_code: shelfCode,
        placeCode,
        place_code: placeCode,
        note: location.note || ''
    };
}

function formatLocation(location = null) {
    const normalized = normalizeLocation(location);
    if (!normalized) return 'Место не указано';
    return [normalized.note, normalized.shelfCode, normalized.placeCode ? `место ${normalized.placeCode}` : '']
        .filter(Boolean)
        .join(' · ');
}

function getBookLocation(book = {}) {
    return normalizeLocation(book.location)
        || state.storageLocations.find(location => Number(location.id) === Number(book.locationId || book.location_id))
        || null;
}

function formatDate(date = new Date()) {
    return date.toLocaleDateString('ru-RU') + ' в ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function normalizeText(value = '') {
    return String(value)
        .toLowerCase()
        .replace(/ё/g, 'е')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zа-я0-9\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function transliterate(value = '') {
    const map = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
    return normalizeText(value).split('').map(ch => map[ch] ?? ch).join('');
}

function levenshtein(a, b) {
    a = normalizeText(a); b = normalizeText(b);
    if (!a || !b) return Math.max(a.length, b.length);
    const dp = Array.from({ length: b.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= a.length; j++) dp[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[b.length][a.length];
}

function demoBooks() {
    const now = formatDate();
    const yesterday = formatDate(new Date(Date.now() - 86400000));
    const before = formatDate(new Date(Date.now() - 172800000));
    return [
        { id: Date.now()+1, title:'Мастер и Маргарита', author:'Михаил Булгаков', description:'Роман о любви, мистике, свободе творчества и вечном споре добра со злом.', available:true, copies:3, coverDataURL:null, dateAdded:now, comments:[{text:'Сильная книга, легко обсуждать на защите проекта.', date:now}] },
        { id: Date.now()+2, title:'Преступление и наказание', author:'Фёдор Достоевский', description:'Психологический роман о выборе, совести и последствиях поступков.', available:true, copies:2, coverDataURL:null, dateAdded:yesterday, comments:[] },
        { id: Date.now()+3, title:'1984', author:'Джордж Оруэлл', description:'Антиутопия о контроле, пропаганде и потере личной свободы.', available:false, copies:0, coverDataURL:null, dateAdded:before, comments:[] },
        { id: Date.now()+4, title:'Алхимик', author:'Пауло Коэльо', description:'Притча о мечте, пути и вере в собственную цель.', available:true, copies:5, coverDataURL:null, dateAdded:now, comments:[] },
        { id: Date.now()+5, title:'Маленький принц', author:'Антуан де Сент-Экзюпери', description:'Философская сказка о дружбе, взрослении и ответственности.', available:true, copies:4, coverDataURL:null, dateAdded:yesterday, comments:[] },
        { id: Date.now()+6, title:'Война и мир', author:'Лев Толстой', description:'Эпический роман о семье, истории, войне и человеческом выборе.', available:true, copies:1, coverDataURL:null, dateAdded:before, comments:[] }
    ];
}

function buildBookQrCode(bookId) {
    const id = Number(bookId);
    return Number.isFinite(id) && id > 0 ? `BT${String(Math.trunc(id)).padStart(6, '0')}` : '';
}

function migrateBook(book) {
    const id = Number(book.id) || Date.now() + Math.floor(Math.random() * 10000);
    const qrCode = book.qrCode || book.qr_code || buildBookQrCode(id);
    const qrPayload = book.qrPayload || book.qr_payload || (qrCode ? `bibliotech://book/${id}` : '');
    return {
        id,
        title: book.title || 'Без названия',
        author: book.author || guessAuthor(book.description) || 'Автор не указан',
        description: book.description || '',
        coverDataURL: book.coverDataURL || book.coverDataUrl || book.cover || book.coverUrl || book.image || book.imageUrl || null,
        available: Boolean(book.available),
        copies: Number.isFinite(Number(book.copies)) ? Math.max(0, Number(book.copies)) : (book.available ? 1 : 0),
        location: normalizeLocation(book.location),
        locationId: book.locationId || book.location_id || book.location?.id || null,
        location_id: book.location_id || book.locationId || book.location?.id || null,
        activeRentalsCount: Number(book.activeRentalsCount || book.active_rentals_count || 0),
        myRentalId: book.myRentalId || book.my_rental_id || null,
        rentedByMe: Boolean(book.rentedByMe || book.myRentalId || book.my_rental_id),
        dateAdded: book.dateAdded || formatDate(),
        comments: Array.isArray(book.comments) ? book.comments : [],
        qrCode,
        qr_code: qrCode,
        qrPayload,
        qr_payload: qrPayload
    };
}

function guessAuthor(description = '') {
    const first = String(description).split('.')[0]?.trim();
    return first && first.length <= 40 && first.split(' ').length <= 4 ? first : '';
}

async function loadBooks() {
    const requestVersion = ++booksRequestVersion;
    try {
        const params = new URLSearchParams();
        if (state.filter !== 'all') params.append('filter', state.filter);
        if (state.sort !== 'relevance') params.append('sort', state.sort);
        if (state.minCopies > 0) params.append('minCopies', state.minCopies);

        const response = await fetch(`${API_URL}/books?${params.toString()}`, {
            headers: { 'Authorization': authToken() ? `Bearer ${authToken()}` : '' }
        });

        if (response.ok) {
            const books = await response.json();
            if (requestVersion !== booksRequestVersion) return;
            state.books = books.map(book => migrateBook({
                ...book,
                coverDataURL: book.coverDataURL || book.cover_data_url || book.coverDataUrl || null,
                dateAdded: book.created_at ? formatDate(new Date(book.created_at)) : formatDate(),
                comments: book.comments || []
            }));
            saveBooks();
        } else {
            throw new Error('API error');
        }
    } catch (error) {
        if (requestVersion !== booksRequestVersion) return;
        console.warn('Using local storage fallback:', error);
        const raw = localStorage.getItem(STORAGE_KEY);
        try {
            const parsed = raw ? JSON.parse(raw) : [];
            state.books = Array.isArray(parsed) && parsed.length ? parsed.map(migrateBook) : demoBooks();
        } catch {
            state.books = demoBooks();
        }
        saveBooks();
    }
    renderBooks();
    updateDashboard();
}

async function loadStorageLocations() {
    try {
        const response = await fetch(`${API_URL}/storage-locations`, {
            headers: { 'Authorization': authToken() ? `Bearer ${authToken()}` : '' }
        });
        if (!response.ok) throw new Error('locations API error');
        const payload = await response.json();
        const rawLocations = Array.isArray(payload) ? payload : (payload.locations || []);
        state.storageLocations = rawLocations.map(normalizeLocation).filter(Boolean);
    } catch (error) {
        state.storageLocations = [
            { id: 1, shelfCode: 'ИКТ-ФВ 13', shelf_code: 'ИКТ-ФВ 13', placeCode: '09', place_code: '09', note: 'Надставка' },
            { id: 2, shelfCode: 'ИКТ-ФВ 13', shelf_code: 'ИКТ-ФВ 13', placeCode: '12', place_code: '12', note: 'Надставка' }
        ];
    }
    renderLocationSelect();
}

function renderLocationSelect(selectedId = '') {
    const select = document.getElementById('bookLocationSelect');
    if (!select) return;
    const current = selectedId || select.value || '';
    select.innerHTML = '<option value="">Без места хранения</option>' + state.storageLocations.map(location => (
        `<option value="${escapeHtml(location.id)}">${escapeHtml(formatLocation(location))}</option>`
    )).join('');
    select.value = current && state.storageLocations.some(location => Number(location.id) === Number(current)) ? String(current) : '';
}

function saveBooks() {
    const safeSnapshot = state.books.map(book => ({
        ...book,
        coverDataURL: typeof book.coverDataURL === 'string' && book.coverDataURL.length <= 250000
            ? book.coverDataURL
            : null
    }));
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(safeSnapshot));
    } catch (error) {
        console.warn('Catalog cache could not be saved:', error);
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
    }
}

async function compressImageFile(file, options = {}) {
    if (!file?.type?.startsWith('image/')) throw new Error('INVALID_IMAGE');
    if (file.size > 8 * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE');

    const objectUrl = URL.createObjectURL(file);
    try {
        const image = await new Promise((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = reject;
            element.src = objectUrl;
        });
        const maxWidth = Number(options.maxWidth || 900);
        const maxHeight = Number(options.maxHeight || 1200);
        const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const result = canvas.toDataURL('image/jpeg', Number(options.quality || 0.82));
        if (result.length > Number(options.maxDataLength || 2.5 * 1024 * 1024)) throw new Error('IMAGE_TOO_LARGE');
        return result;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function getSearchScore(book, query) {
    const q = normalizeText(query);
    if (!q) return 1;
    const title = normalizeText(book.title);
    const author = normalizeText(book.author);
    const desc = normalizeText(book.description);
    const comments = normalizeText((book.comments || []).map(c => c.text).join(' '));
    const qr = normalizeText([book.qrCode, book.qr_code, book.qrPayload, book.qr_payload].filter(Boolean).join(' '));
    const location = normalizeText(formatLocation(getBookLocation(book)));
    const full = `${title} ${author} ${desc} ${comments} ${qr} ${location}`;
    const fullLatin = transliterate(full);
    const qLatin = transliterate(q);
    const words = q.split(' ').filter(Boolean);
    let score = 0;
    if (qr === q) score += 130;
    if (title === q) score += 120;
    if (author === q) score += 100;
    if (qr.includes(q)) score += 90;
    if (title.startsWith(q)) score += 80;
    if (author.startsWith(q)) score += 70;
    if (title.includes(q)) score += 55;
    if (author.includes(q)) score += 50;
    if (desc.includes(q)) score += 25;
    if (location.includes(q)) score += 22;
    if (comments.includes(q)) score += 15;
    if (fullLatin.includes(qLatin)) score += 25;
    for (const word of words) {
        if (title.split(' ').some(w => w.startsWith(word))) score += 16;
        if (author.split(' ').some(w => w.startsWith(word))) score += 14;
        if (full.includes(word)) score += 6;
    }
    const initials = title.split(' ').map(w => w[0]).join('') + ' ' + author.split(' ').map(w => w[0]).join('');
    if (q.length >= 2 && initials.includes(q)) score += 20;
    const closeWords = `${title} ${author}`.split(' ');
    if (q.length >= 3 && closeWords.some(w => Math.abs(w.length - q.length) <= 2 && levenshtein(w, q) <= 2)) score += 18;
    return score;
}

function getFilteredBooks() {
    const query = state.search;
    let result = state.books
        .map(book => ({ book, score: getSearchScore(book, query) }))
        .filter(item => !query.trim() || item.score > 0);

    if (state.filter === 'available') result = result.filter(item => item.book.available);
    if (state.filter === 'unavailable') result = result.filter(item => !item.book.available);
    if (Number(state.minCopies) > 0) result = result.filter(item => Number(item.book.copies || 0) >= Number(state.minCopies));

    const cmpText = (a, b, field) => normalizeText(a.book[field]).localeCompare(normalizeText(b.book[field]), 'ru');
    result.sort((a, b) => {
        switch (state.sort) {
            case 'title-asc': return cmpText(a, b, 'title');
            case 'title-desc': return cmpText(b, a, 'title');
            case 'author-asc': return cmpText(a, b, 'author');
            case 'date-newest': return b.book.id - a.book.id;
            case 'date-oldest': return a.book.id - b.book.id;
            case 'available-first': return Number(b.book.available) - Number(a.book.available) || cmpText(a, b, 'title');
            case 'copies-desc': return (b.book.copies || 0) - (a.book.copies || 0);
            case 'copies-asc': return (a.book.copies || 0) - (b.book.copies || 0);
            case 'relevance':
            default: return (b.score - a.score) || cmpText(a, b, 'title');
        }
    });
    return result.map(item => item.book);
}

function highlight(text, query) {
    const safe = escapeHtml(text);
    const q = String(query || '').trim();
    if (!q) return safe;

    // Красиво подсвечиваем все совпадения.
    // Сначала длинные фразы, потом короткие слова — так подсветка не рвётся.
    const parts = q
        .split(/\s+/)
        .map(part => part.trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (!parts.length) return safe;

    return safe.replace(
        new RegExp(`(${parts.join('|')})`, 'gi'),
        '<mark class="search-highlight"><span>$1</span></mark>'
    );
}

function updateAdminPanel(stats = null) {
    const panel = document.getElementById('adminPanel');
    if (!panel) return;
    const visible = canManageBooks();
    panel.hidden = !visible;
    panel.classList.toggle('hidden', !visible);
    if (!visible) return;

    const books = Array.isArray(state.books) ? state.books : [];
    const total = Number(stats?.totalBooks ?? books.length);
    const available = Number(stats?.availableBooks ?? books.filter(book => book.available).length);
    const copies = Number(stats?.totalCopies ?? books.reduce((sum, book) => sum + (Number(book.copies) || 0), 0));
    const comments = Number(stats?.totalComments ?? books.reduce((sum, book) => sum + ((book.comments || []).length), 0));
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    set('adminTotalBooks', total);
    set('adminAvailableBooks', available);
    set('adminTotalCopies', copies);
    set('adminTotalComments', comments);
}


async function updateDashboard() {
    try {
        const response = await fetch(`${API_URL}/stats`, {
            headers: { 'Authorization': authToken() ? `Bearer ${authToken()}` : '' }
        });
        if (response.ok) {
            const stats = await response.json();
            const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
            set('dashBooks', stats.totalBooks);
            set('dashAvailable', stats.availableBooks);
            set('dashCopies', stats.totalCopies);
            set('dashComments', stats.totalComments);
            set('dashPercent', stats.availablePercent + '%');
            set('heroTotalBooks', stats.totalBooks);
            set('heroTotalCopies', stats.totalCopies);
            updateAdminPanel(stats);

            const authorsBox = document.getElementById('topAuthors');
            if (authorsBox && stats.topAuthors) {
                authorsBox.innerHTML = stats.topAuthors.length
                    ? stats.topAuthors.map((author, index) => `<div class="author-row"><span>${index + 1}. ${escapeHtml(author.author)}</span><b>${author.count}</b></div>`).join('')
                    : 'Пока нет данных';
            }
            return;
        }
    } catch (e) { }

    // Fallback на локальные данные
    const total = state.books.length;
    const available = state.books.filter(b => b.available).length;
    const copies = state.books.reduce((sum, b) => sum + (Number(b.copies) || 0), 0);
    const comments = state.books.reduce((sum, b) => sum + ((b.comments || []).length), 0);
    const percent = total ? Math.round((available / total) * 100) : 0;
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set('dashBooks', total);
    set('dashAvailable', available);
    set('dashCopies', copies);
    set('dashComments', comments);
    set('dashPercent', percent + '%');
    set('heroTotalBooks', total);
    set('heroTotalCopies', copies);
    updateAdminPanel({ totalBooks: total, availableBooks: available, totalCopies: copies, totalComments: comments });

    const authorCounts = state.books.reduce((acc, book) => {
        const author = (book.author || 'Автор не указан').trim();
        acc[author] = (acc[author] || 0) + 1;
        return acc;
    }, {});
    const topAuthors = Object.entries(authorCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).slice(0, 5);
    const authorsBox = document.getElementById('topAuthors');
    if (authorsBox) {
        authorsBox.innerHTML = topAuthors.length
            ? topAuthors.map(([name, count], index) => `<div class="author-row"><span data-user-content="book-author">${index + 1}. ${escapeHtml(name)}</span><b>${count}</b></div>`).join('')
            : 'Пока нет данных';
    }

    set('catalogHealth', total >= 10 ? 'Каталог выглядит насыщенно' : total >= 5 ? 'Хорошая основа, можно расширять' : 'Добавьте ещё несколько книг');
    set('commentActivity', comments >= 5 ? 'Есть активное обсуждение' : comments > 0 ? 'Появились первые отзывы' : 'Комментарии пока ждут читателей');

    const ring = document.querySelector('.meter-ring');
    if (ring) ring.style.setProperty('--p', (percent * 3.6) + 'deg');
}

function renderStats(books) {
    const total = state.books.length;
    const available = state.books.filter(b => b.available).length;
    const copies = state.books.reduce((sum, b) => sum + (b.copies || 0), 0);
    const stats = $('#stats');
    if (stats) stats.innerHTML = `${escapeHtml(tr('shown'))}: <b>${books.length}</b> ${escapeHtml(tr('of'))} <b>${total}</b> · ${escapeHtml(tr('availableCount'))}: <b>${available}</b> · ${escapeHtml(tr('copiesCount'))}: <b>${copies}</b>`;
}

function renderBooks(options = {}) {
    const books = getFilteredBooks();
    const container = $('#booksContainer');
    if (!container) return;
    renderStats(books);
    if (options.updateDashboard !== false) updateDashboard();
    $('#clearSearchBtn')?.classList.toggle('hidden', !state.search);
    if (!books.length) {
        container.innerHTML = `<div class="empty-state">📭 ${escapeHtml(getLangPack().emptySearch || 'Ничего не найдено. Попробуйте изменить запрос или фильтры.')}</div>`;
        return;
    }
    container.innerHTML = books.map(book => {
        const coverHtml = book.coverDataURL
            ? `<img class="book-cover-img" src="${book.coverDataURL}" alt="${escapeHtml(book.title)}" loading="lazy">`
            : '<div class="no-cover-icon">📖</div>';
        const availableText = book.available ? tr('inStock') : tr('outStock');
        const availableClass = book.available ? '' : 'out';
        const locationText = formatLocation(getBookLocation(book));
        const rentalText = book.rentedByMe ? 'Закреплена за вами' : (book.activeRentalsCount ? `Аренда: ${book.activeRentalsCount}` : '');
        const controls = canManageBooks()
            ? `<button class="delete-btn" data-id="${book.id}" title="${escapeHtml(tr('deleteBook'))}">🗑️ ${escapeHtml(tr('deleteBook'))}</button>`
            : `<span class="guest-note">${isGuest() ? escapeHtml(tr('guestView')) : 'Пользователь: просмотр и комментарии'}</span>`;
        return `<div class="book-card ${state.search ? 'search-match-card' : ''}" data-id="${book.id}" tabindex="0" aria-label="${escapeHtml(`${tr('openBook')}: ${book.title}, ${book.author || tr('unknownAuthor')}`)}">
            <div class="book-cover">${coverHtml}</div>
            <div class="book-info">
                <div class="book-title" data-user-content="book-title">${highlight(book.title, state.search)}</div>
                <div class="book-author" data-user-content="book-author">✍️ ${highlight(book.author || 'Автор не указан', state.search)}</div>
                <div class="book-description" data-user-content="book-description">${highlight(book.description || 'Нет описания', state.search)}</div>
                <div class="book-meta">
                    <span class="badge ${availableClass}">${availableText}</span>
                    <span class="badge copies">📚 ${book.copies || 0} ${escapeHtml(tr('copyAbbr'))}</span>
                    <span class="badge location-badge" data-user-content="storage-location">📍 ${escapeHtml(locationText)}</span>
                    ${rentalText ? `<span class="badge rental-badge">🔖 ${escapeHtml(rentalText)}</span>` : ''}
                    <span class="badge date">📅 ${escapeHtml(book.dateAdded || 'Дата неизвестна')}</span>
                </div>
            </div>
            <div class="card-actions">${controls}</div>
        </div>`;
    }).join('');
}

function openBook(bookId) {
    const book = state.books.find(b => b.id === Number(bookId));
    if (!book) return;
    state.activeBookId = book.id;
    const viewModal = $('#viewModal');
    if (viewModal) viewModal.dataset.bookId = String(book.id);
    const availableText = book.available ? tr('inStock') : tr('outStock');
    const commentsCount = (book.comments || []).length;
    const location = getBookLocation(book);
    const locationText = formatLocation(location);
    $('#viewTitle').textContent = book.title;
    $('#viewTitle').dataset.userContent = 'book-title';
    $('#viewDescription').textContent = book.description || 'Нет описания';
    $('#viewDescription').dataset.userContent = 'book-description';
    const authorEl = $('#viewAuthorValue'); if (authorEl) { authorEl.textContent = book.author || 'Автор не указан'; authorEl.dataset.userContent = 'book-author'; }
    const statusEl = $('#viewStatusValue'); if (statusEl) { statusEl.textContent = availableText; statusEl.className = 'detail-value status ' + (book.available ? 'ok' : 'bad'); }
    const addedEl = $('#viewAddedValue'); if (addedEl) addedEl.textContent = book.dateAdded || 'Дата неизвестна';
    const commEl = $('#viewCommentsValue'); if (commEl) commEl.textContent = commentsCount;
    $('#viewMeta').innerHTML = `
        <span class="badge">✍️ ${escapeHtml(book.author || 'Автор не указан')}</span>
        <span class="badge ${book.available ? '' : 'out'}">${escapeHtml(availableText)}</span>
        <span class="badge copies">📚 ${book.copies || 0} ${escapeHtml(tr('copyAbbr'))}</span>
        <span class="badge location-badge" data-user-content="storage-location">📍 ${escapeHtml(locationText)}</span>
        ${book.rentedByMe ? '<span class="badge rental-badge">🔖 Закреплена за вами</span>' : ''}
        <span class="badge date">📅 ${escapeHtml(book.dateAdded || 'Дата неизвестна')}</span>`;
    $('#viewCopiesCount').textContent = book.copies || 0;
    const locationValue = $('#viewLocationValue');
    if (locationValue) locationValue.textContent = locationText;
    const locationNote = $('#viewLocationNote');
    if (locationNote) locationNote.textContent = location ? 'Используйте этот код, чтобы быстро найти книгу на полке.' : 'Админ может выбрать полку при редактировании книги.';
    updateRentalPanel(book);
    $('#editBookBtn')?.classList.toggle('hidden', !canManageBooks());
    $$('.copies-control button').forEach(btn => {
        btn.disabled = !canManageBooks();
        btn.classList.toggle('hidden', !canManageBooks());
    });
    const cover = $('#viewCover');
    cover.innerHTML = book.coverDataURL ? `<img src="${book.coverDataURL}" alt="${escapeHtml(book.title)}">` : `<div class="view-cover-placeholder"><span>📖</span><b>${escapeHtml(book.title.slice(0, 22))}</b></div>`;
    renderBookQr(book);
    renderComments(book);
    applyLanguage(localStorage.getItem(LANGUAGE_KEY) || 'ru');
    $('#viewModal').classList.add('active');
}

function updateRentalPanel(book) {
    const status = $('#viewRentalStatus');
    const note = $('#viewRentalNote');
    const button = $('#rentBookBtn');
    if (!status || !note || !button) return;

    button.classList.remove('hidden', 'return-mode');
    button.disabled = false;

    if (isGuest()) {
        status.textContent = 'Только просмотр';
        note.textContent = 'Войдите в аккаунт, чтобы арендовать книгу.';
        button.textContent = 'Нужен вход';
        button.disabled = true;
        return;
    }

    if (book.rentedByMe) {
        status.textContent = 'Закреплена за вами';
        note.textContent = 'После возврата книга снова станет доступна.';
        button.textContent = 'Вернуть книгу';
        button.classList.add('return-mode');
        return;
    }

    if (!book.available || Number(book.copies || 0) <= 0) {
        status.textContent = 'Нет свободных копий';
        note.textContent = book.activeRentalsCount ? `Сейчас на руках: ${book.activeRentalsCount}` : 'Админ может увеличить количество копий.';
        button.textContent = 'Недоступно';
        button.disabled = true;
        return;
    }

    status.textContent = 'Можно арендовать';
    note.textContent = book.activeRentalsCount ? `Уже на руках: ${book.activeRentalsCount}` : 'Книга свободна для выдачи.';
    button.textContent = 'Арендовать';
}

async function toggleBookRental() {
    if (isGuest()) return notify('Войдите в аккаунт, чтобы арендовать книгу', 'error');
    const book = state.books.find(b => b.id === Number(state.activeBookId));
    if (!book) return;
    const returning = Boolean(book.rentedByMe);
    const endpoint = returning ? 'return' : 'rent';

    try {
        const response = await fetch(`${API_URL}/books/${book.id}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authToken() ? `Bearer ${authToken()}` : '' },
            body: JSON.stringify({ rentalId: book.myRentalId || null })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Rental error');

        if (payload.book) {
            const migrated = migrateBook({
                ...payload.book,
                coverDataURL: payload.book.coverDataURL || payload.book.cover_data_url || book.coverDataURL,
                dateAdded: payload.book.created_at ? formatDate(new Date(payload.book.created_at)) : book.dateAdded,
                comments: Array.isArray(payload.book.comments) ? payload.book.comments : (book.comments || [])
            });
            const index = state.books.findIndex(item => Number(item.id) === Number(book.id));
            if (index >= 0) state.books[index] = { ...state.books[index], ...migrated };
        } else {
            book.rentedByMe = !returning;
            book.copies = Math.max(0, Number(book.copies || 0) + (returning ? 1 : -1));
            book.available = book.copies > 0;
            book.activeRentalsCount = Math.max(0, Number(book.activeRentalsCount || 0) + (returning ? -1 : 1));
        }
        saveBooks();
        renderBooks();
        openBook(book.id);
        notify(returning ? 'Книга возвращена' : 'Книга закреплена за вами', 'success');
    } catch (error) {
        notify(returning ? 'Не удалось вернуть книгу' : 'Не удалось арендовать книгу', 'error');
    }
}

function renderComments(book) {
    const list = $('#commentsList');
    if (!list) return;
    if (!book.comments || !book.comments.length) {
        list.innerHTML = '<div class="empty-comments">✨ Комментариев пока нет.</div>';
    } else {
        list.innerHTML = book.comments.map((comment, index) => {
            const deleteAction = canDeleteComment(comment) ? `<button class="delete-comment-btn" data-idx="${index}">🗑️</button>` : '';
            return `<div class="comment-item">
                <div class="comment-text" data-user-content="comment">${escapeHtml(comment.text)}</div>
                <span class="comment-date">📅 ${escapeHtml(comment.date || '')}</span>
                ${deleteAction}
            </div>`;
        }).join('');
    }
    const inputArea = $('.add-comment-area');
    if (inputArea) inputArea.style.display = canComment() ? '' : 'none';
}

async function addBook(event) {
    event.preventDefault();
    if (!canManageBooks()) return notify('Редактировать книги может только админ', 'error');

    // Прямое получение элементов
    const titleInput = document.getElementById('bookTitle');
    const authorInput = document.getElementById('bookAuthor');
    const descInput = document.getElementById('bookDesc');
    const copiesInput = document.getElementById('bookCopies');
    const availableCheck = document.getElementById('bookAvailable');
    const locationSelect = document.getElementById('bookLocationSelect');

    if (!titleInput || !authorInput) {
        notify('Ошибка: поля формы не найдены', 'error');
        return;
    }

    const title = titleInput.value.trim();
    const author = authorInput.value.trim();
    const description = descInput ? descInput.value.trim() : '';
    const copies = Math.max(0, Number(copiesInput?.value || 0));
    const available = copies > 0 && (availableCheck?.checked || false);
    const locationId = locationSelect?.value ? Number(locationSelect.value) : null;

    if (!title || !author) return notify('Заполните название и автора', 'error');

    const editingId = state.editingBookId ? Number(state.editingBookId) : null;
    const existingBook = editingId ? state.books.find(book => book.id === editingId) : null;
    const normalizedCopies = available ? Math.max(1, copies) : 0;
    const bookData = { title, author, description, coverDataURL: state.coverDataUrl, copies: normalizedCopies, available, locationId };
    const requestUrl = editingId ? `${API_URL}/books/${editingId}` : `${API_URL}/books`;
    const requestMethod = editingId ? 'PUT' : 'POST';
    console.log('📦 Отправляем на сервер:', bookData);

    try {
        const response = await fetch(requestUrl, {
            method: requestMethod,
            headers: { 'Content-Type': 'application/json', 'Authorization': authToken() ? `Bearer ${authToken()}` : '' },
            body: JSON.stringify(bookData)
        });

        if (response.ok) {
            const savedBook = await response.json();
            const migrated = migrateBook({
                ...savedBook,
                coverDataURL: savedBook.coverDataURL || savedBook.cover_data_url || state.coverDataUrl,
                dateAdded: savedBook.created_at ? formatDate(new Date(savedBook.created_at)) : (existingBook?.dateAdded || formatDate()),
                comments: Array.isArray(savedBook.comments) ? savedBook.comments : (existingBook?.comments || [])
            });
            if (editingId) {
                const index = state.books.findIndex(book => book.id === editingId);
                if (index >= 0) state.books[index] = { ...state.books[index], ...migrated };
                else state.books.unshift(migrated);
            } else {
                state.books.unshift(migrated);
            }
            saveBooks();
            closeModal('#bookModal');
            resetBookForm();
            renderBooks();
            if (editingId) openBook(editingId);
            notify(editingId ? 'Карточка книги обновлена' : 'Книга добавлена в каталог', 'success');
        } else {
            const err = await response.json();
            console.error('Ошибка сервера:', err);
            throw new Error(err.error || 'API error');
        }
    } catch (error) {
        console.error('Book save failed:', error);
        notify('Не удалось сохранить книгу. Проверьте соединение — изменения не применены.', 'error');
    }
}

async function deleteBook(id) {
    if (!canManageBooks()) return notify('Удалять книги может только админ', 'error');
    const book = state.books.find(b => b.id === Number(id));
    if (!book) return;
    const ok = await askConfirm({
        title: 'Удалить карточку книги?',
        message: `«${book.title}» будет удалена из каталога.`,
        confirmText: 'Удалить',
        danger: true
    });
    if (!ok) return;
    try {
        const response = await fetch(`${API_URL}/books/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': authToken() ? `Bearer ${authToken()}` : '' }
        });

        if (response.ok) {
            state.books = state.books.filter(b => b.id !== book.id);
            saveBooks();
            renderBooks();
            notify(`Карточка «${book.title}» удалена`, 'delete');
        } else {
            throw new Error('API error');
        }
    } catch (error) {
        notify(`Не удалось удалить «${book.title}». Проверьте соединение и повторите.`, 'error');
    }
}

async function updateCopies(delta) {
    if (!canManageBooks()) return notify('Менять количество книг может только админ', 'error');
    const book = state.books.find(b => b.id === state.activeBookId);
    if (!book) return;
    const newCopies = Math.max(0, (book.copies || 0) + delta);

    try {
        const response = await fetch(`${API_URL}/books/${book.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': authToken() ? `Bearer ${authToken()}` : '' },
            body: JSON.stringify({ copies: newCopies, available: newCopies > 0 })
        });

        if (response.ok) {
            book.copies = newCopies;
            book.available = newCopies > 0;
            saveBooks();
            openBook(book.id);
            renderBooks();
        } else {
            throw new Error('API error');
        }
    } catch (error) {
        notify('Не удалось изменить количество экземпляров. Данные не изменены.', 'error');
    }
}

async function addComment() {
    if (isGuest()) return notify('Гость не может писать комментарии', 'error');
    const input = $('#newCommentInput');
    const text = input.value.trim();
    if (!text) return;
    const book = state.books.find(b => b.id === state.activeBookId);
    if (!book) return;

    try {
        const response = await fetch(`${API_URL}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authToken() ? `Bearer ${authToken()}` : '' },
            body: JSON.stringify({ bookId: book.id, text })
        });

        if (response.ok) {
            const newComment = await response.json();
            book.comments.unshift({ text, date: formatDate(), id: newComment.id });
            input.value = '';
            saveBooks();
            renderComments(book);
            renderBooks();
            notify('Комментарий добавлен', 'success');
        } else {
            throw new Error('API error');
        }
    } catch (error) {
        notify('Не удалось добавить комментарий. Проверьте соединение.', 'error');
    }
}

async function deleteComment(index) {
    const book = state.books.find(b => b.id === state.activeBookId);
    if (!book) return;
    const comment = book.comments[Number(index)];
    if (!comment) return;
    if (!canDeleteComment(comment)) return notify('Удалить можно только свой комментарий или комментарий как админ', 'error');

    if (comment.id) {
        try {
            const response = await fetch(`${API_URL}/comments/${comment.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': authToken() ? `Bearer ${authToken()}` : '' }
            });
            if (!response.ok) throw new Error('COMMENT_DELETE_FAILED');
        } catch (error) {
            notify('Не удалось удалить комментарий. Проверьте соединение.', 'error');
            return;
        }
    }

    book.comments.splice(Number(index), 1);
    saveBooks();
    renderComments(book);
}

function setBookModalMode(mode = 'create') {
    const title = document.querySelector('#bookModal .modal-content h2');
    const submit = document.querySelector('#bookModal .submit-modal');
    if (title) title.textContent = mode === 'edit' ? 'Редактировать карточку книги' : 'Добавить книгу';
    if (submit) submit.textContent = mode === 'edit' ? 'Сохранить изменения' : 'Сохранить книгу';
}

function openAddBookModal() {
    if (!canManageBooks()) return notify('Добавлять книги может только админ', 'error');
    resetBookForm();
    openModal('#bookModal');
}

function openBookEditor(bookId) {
    if (!canManageBooks()) return notify('Редактировать карточку книги может только админ', 'error');
    const book = state.books.find(item => item.id === Number(bookId));
    if (!book) return notify('Книга не найдена', 'error');

    state.editingBookId = book.id;
    state.coverDataUrl = book.coverDataURL || null;
    const setValue = (id, value) => {
        const input = document.getElementById(id);
        if (input) input.value = value ?? '';
    };
    setValue('bookTitle', book.title || '');
    setValue('bookAuthor', book.author || '');
    setValue('bookDesc', book.description || '');
    setValue('bookCopies', Number.isFinite(Number(book.copies)) ? Number(book.copies) : 0);
    renderLocationSelect(book.locationId || book.location_id || book.location?.id || '');
    const available = document.getElementById('bookAvailable');
    if (available) available.checked = Boolean(book.available);
    const preview = document.getElementById('imagePreview');
    if (preview) {
        preview.innerHTML = state.coverDataUrl
            ? `<img src="${state.coverDataUrl}" class="preview-img" alt="preview"><span>✅ Обложка выбрана</span>`
            : '🖼️ Обложка не выбрана';
    }
    const clearCoverBtn = document.getElementById('clearBookCoverBtn');
    clearCoverBtn?.classList.toggle('hidden', !state.coverDataUrl);
    setBookModalMode('edit');
    closeModal('#viewModal');
    openModal('#bookModal');
}

function resetBookForm() {
    $('#bookForm')?.reset();
    state.editingBookId = null;
    state.coverDataUrl = null;
    setBookModalMode('create');
    const preview = $('#imagePreview');
    if (preview) preview.innerHTML = '🖼️ Обложка не выбрана';
    $('#clearBookCoverBtn')?.classList.add('hidden');
    const copies = $('#bookCopies');
    if (copies) copies.value = 1;
    renderLocationSelect('');
    const available = $('#bookAvailable');
    if (available) available.checked = true;
}

function closeModal(selector) { $(selector)?.classList.remove('active'); }
function openModal(selector) { $(selector)?.classList.add('active'); }

function notify(message, type = 'success', options = {}) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.className = 'toast-stack';
        document.body.appendChild(stack);
    }
    const icons = { success: '✅', error: '⚠️', info: '💡', warning: '🔔', delete: '🗑️' };
    const titles = { success: 'Готово', error: 'Ошибка', info: 'Информация', warning: 'Внимание', delete: 'Удаление' };
    const el = document.createElement('div');
    el.className = `custom-notification toast ${type}`;
    const isUrgent = type === 'error' || type === 'warning';
    el.setAttribute('role', isUrgent ? 'alert' : 'status');
    el.setAttribute('aria-live', isUrgent ? 'assertive' : 'polite');
    el.setAttribute('aria-atomic', 'true');
    const action = options.actionText ? `<button class="toast-action">${escapeHtml(options.actionText)}</button>` : '';
    el.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.success}</div>
        <div class="toast-body"><b>${titles[type] || titles.success}</b><span>${escapeHtml(message)}</span></div>
        ${action}
        <button class="toast-close" aria-label="Закрыть">×</button>
        <i class="toast-progress"></i>`;
    stack.appendChild(el);
    const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 260); };
    el.querySelector('.toast-close')?.addEventListener('click', close);
    el.querySelector('.toast-action')?.addEventListener('click', () => { options.onAction?.(); close(); });
    setTimeout(() => el.classList.add('show'), 20);
    setTimeout(close, options.duration || 3600);
}

function askConfirm({ title = 'Подтвердите действие', message = 'Вы уверены?', confirmText = 'Подтвердить', danger = false } = {}) {
    return new Promise(resolve => {
        const modal = $('#confirmModal');
        const titleEl = $('#confirmTitle');
        const messageEl = $('#confirmMessage');
        const cancelBtn = $('#confirmCancelBtn');
        const deleteBtn = $('#confirmDeleteBtn');
        if (!modal || !cancelBtn || !deleteBtn) return resolve(window.confirm(message));
        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;
        deleteBtn.textContent = confirmText;
        deleteBtn.classList.toggle('is-danger', danger);
        modal.classList.add('active');
        const cleanup = (answer) => {
            modal.classList.remove('active');
            cancelBtn.removeEventListener('click', onCancel);
            deleteBtn.removeEventListener('click', onConfirm);
            modal.removeEventListener('click', onBackdrop);
            resolve(answer);
        };
        const onCancel = () => cleanup(false);
        const onConfirm = () => cleanup(true);
        const onBackdrop = (event) => { if (event.target === modal) cleanup(false); };
        cancelBtn.addEventListener('click', onCancel);
        deleteBtn.addEventListener('click', onConfirm);
        modal.addEventListener('click', onBackdrop);
    });
}


const LANGUAGE_KEY = 'bibliotech_language';
const LANG_META = {
    ru: { code: 'RU', label: 'Русский' },
    en: { code: 'EN', label: 'English' },
    uk: { code: 'UK', label: 'Українська' },
    de: { code: 'DE', label: 'Deutsch' },
    kk: { code: 'KK', label: 'Қазақша' },
    es: { code: 'ES', label: 'Español' },
    zh: { code: 'ZH', label: '中文' }
};
const I18N = {
    ru: {
        title: '📚 Книжный шкаф', subtitle: 'Каталог с фильтрами, поиском и комментариями', add: '+ Добавить книгу',
        searchLabel: '🔍 Умный поиск', searchPlaceholder: 'Название, автор, описание или комментарий...', sort: 'Лучшее совпадение', filters: 'Фильтры', qr: '▣ Сканировать QR',
        all: '📚 Все', available: '✅ В наличии', unavailable: '❌ Нет в наличии', footer: '© 2026 BIBLIOTECH. Все права защищены.',
        voiceKicker: 'Голосовой поиск', voiceStatus: 'Готов к прослушиванию', voiceText: 'Скажите название книги, автора или тему', voiceHint: 'Нажмите «Разрешить», если браузер запросит доступ',
        qrTitle: '▣ Сканер QR-кода', qrText: 'Наведите камеру на QR-код книги — каталог сам откроет нужную карточку или выполнит поиск.', qrStart: 'Включить камеру', qrStop: 'Остановить', qrManual: 'Или вставьте текст из QR вручную', qrFind: 'Найти'
    },
    en: {
        title: '📚 Bookshelf', subtitle: 'Catalog with filters, search and comments', add: '+ Add book',
        searchLabel: '🔍 Smart search', searchPlaceholder: 'Title, author, description or comment...', sort: 'Best match', filters: 'Filters', qr: '▣ Scan QR',
        all: '📚 All', available: '✅ Available', unavailable: '❌ Unavailable', footer: '© 2026 BIBLIOTECH. All rights reserved.',
        voiceKicker: 'Voice search', voiceStatus: 'Ready to listen', voiceText: 'Say a book title, author or topic', voiceHint: 'Allow microphone access if the browser asks',
        qrTitle: '▣ QR scanner', qrText: 'Point the camera at a book QR code — the catalog will open it or search for it.', qrStart: 'Start camera', qrStop: 'Stop', qrManual: 'Or paste QR text manually', qrFind: 'Find'
    },
    uk: {
        title: '📚 Книжкова шафа', subtitle: 'Каталог з фільтрами, пошуком і коментарями', add: '+ Додати книгу',
        searchLabel: '🔍 Розумний пошук', searchPlaceholder: 'Назва, автор, опис або коментар...', sort: 'Найкращий збіг', filters: 'Фільтри', qr: '▣ Сканувати QR',
        all: '📚 Усі', available: '✅ Є в наявності', unavailable: '❌ Немає', footer: '© 2026 BIBLIOTECH. Усі права захищено.',
        voiceKicker: 'Голосовий пошук', voiceStatus: 'Готово до прослуховування', voiceText: 'Скажіть назву книги, автора або тему', voiceHint: 'Надайте доступ, якщо браузер попросить',
        qrTitle: '▣ QR-сканер', qrText: 'Наведіть камеру на QR-код книги — каталог відкриє її або виконає пошук.', qrStart: 'Увімкнути камеру', qrStop: 'Зупинити', qrManual: 'Або вставте текст QR вручну', qrFind: 'Знайти'
    },
    de: {
        title: '📚 Bücherregal', subtitle: 'Katalog mit Filtern, Suche und Kommentaren', add: '+ Buch hinzufügen',
        searchLabel: '🔍 Intelligente Suche', searchPlaceholder: 'Titel, Autor, Beschreibung oder Kommentar...', sort: 'Beste Übereinstimmung', filters: 'Filter', qr: '▣ QR scannen',
        all: '📚 Alle', available: '✅ Verfügbar', unavailable: '❌ Nicht verfügbar', footer: '© 2026 BIBLIOTECH. Alle Rechte vorbehalten.',
        voiceKicker: 'Sprachsuche', voiceStatus: 'Bereit zum Zuhören', voiceText: 'Sagen Sie Titel, Autor oder Thema', voiceHint: 'Erlauben Sie Mikrofonzugriff, wenn der Browser fragt',
        qrTitle: '▣ QR-Scanner', qrText: 'Richten Sie die Kamera auf den QR-Code — der Katalog öffnet oder sucht das Buch.', qrStart: 'Kamera starten', qrStop: 'Stoppen', qrManual: 'Oder QR-Text manuell einfügen', qrFind: 'Suchen'
    },
    kk: {
        title: '📚 Кітап сөресі', subtitle: 'Сүзгілер, іздеу және пікірлер бар каталог', add: '+ Кітап қосу',
        searchLabel: '🔍 Ақылды іздеу', searchPlaceholder: 'Атауы, авторы, сипаттамасы немесе пікір...', sort: 'Ең жақсы сәйкестік', filters: 'Сүзгілер', qr: '▣ QR сканерлеу',
        all: '📚 Барлығы', available: '✅ Бар', unavailable: '❌ Жоқ', footer: '© 2026 BIBLIOTECH. Барлық құқықтар қорғалған.',
        voiceKicker: 'Дауыспен іздеу', voiceStatus: 'Тыңдауға дайын', voiceText: 'Кітап атауын, авторын немесе тақырыбын айтыңыз', voiceHint: 'Браузер сұраса, рұқсат беріңіз',
        qrTitle: '▣ QR сканері', qrText: 'Камераны QR-кодқа бағыттаңыз — каталог кітапты ашады немесе іздейді.', qrStart: 'Камераны қосу', qrStop: 'Тоқтату', qrManual: 'Немесе QR мәтінін қолмен енгізіңіз', qrFind: 'Табу'
    },
    es: {
        title: '📚 Estantería', subtitle: 'Catálogo con filtros, búsqueda y comentarios', add: '+ Añadir libro',
        searchLabel: '🔍 Búsqueda inteligente', searchPlaceholder: 'Título, autor, descripción o comentario...', sort: 'Mejor coincidencia', filters: 'Filtros', qr: '▣ Escanear QR',
        all: '📚 Todo', available: '✅ Disponible', unavailable: '❌ No disponible', footer: '© 2026 BIBLIOTECH. Todos los derechos reservados.',
        voiceKicker: 'Búsqueda por voz', voiceStatus: 'Listo para escuchar', voiceText: 'Di el título, autor o tema del libro', voiceHint: 'Permite el micrófono si el navegador lo solicita',
        qrTitle: '▣ Escáner QR', qrText: 'Apunta la cámara al QR del libro: el catálogo lo abrirá o lo buscará.', qrStart: 'Activar cámara', qrStop: 'Detener', qrManual: 'O pega el texto del QR manualmente', qrFind: 'Buscar'
    },
    zh: {
        title: '📚 书架', subtitle: '带筛选、搜索和评论的目录', add: '+ 添加图书',
        searchLabel: '🔍 智能搜索', searchPlaceholder: '书名、作者、描述或评论...', sort: '最佳匹配', filters: '筛选', qr: '▣ 扫描二维码',
        all: '📚 全部', available: '✅ 可借', unavailable: '❌ 不可借', footer: '© 2026 BIBLIOTECH. 保留所有权利。',
        voiceKicker: '语音搜索', voiceStatus: '准备聆听', voiceText: '说出书名、作者或主题', voiceHint: '如果浏览器请求权限，请允许麦克风',
        qrTitle: '▣ 二维码扫描器', qrText: '将摄像头对准图书二维码，目录会打开或搜索该书。', qrStart: '开启摄像头', qrStop: '停止', qrManual: '或手动粘贴二维码文本', qrFind: '查找'
    }
};

const I18N_KEYS = {
    ru: {
        navHome:'Главная', navStats:'Статистика', navAbout:'О нас', profile:'Профиль', logout:'Выйти',
        heroWelcome:'BIBLIOTECH', heroTitle:'Каталог библиотеки', heroText:'Поиск, выдача и учёт книг в одном месте.', openCatalog:'Открыть каталог', viewStats:'Посмотреть статистику',
        readersEyebrow:'Для читателей', readersTitle:'🌿 Пространство для выбора книги', readersText:'Здесь можно быстро понять, что почитать дальше: выбрать настроение, найти автора и сохранить интересные книги в каталоге.',
        shelfTitle:'Каталог', shelfSubtitle:'Поиск и управление книгами', guestView:'Гость: доступен просмотр, поиск и фильтры',
        addBook:'+ Добавить книгу', smartSearch:'Поиск', searchPlaceholder:'Название, автор или описание', filterBtn:'Фильтры', qrBtn:'▣ Сканировать QR', all:'📚 Все книги', inStock:'✅ В наличии', outStock:'❌ Нет в наличии',
        bestMatch:'Лучшее совпадение', send:'Отправить', close:'Закрыть', comments:'Комментарии', copies:'Количество копий', noComments:'Комментариев пока нет.', commentPlaceholder:'Написать комментарий...',
        bookDetails:'Карточка книги', bookStatus:'Статус', bookAuthor:'Автор', bookAdded:'Добавлена', readingHint:'Подсказка читателю', readingHintText:'Откройте описание, проверьте наличие и оставьте комментарий после прочтения.',
        modalAddTitle:'Добавить книгу', saveBook:'Сохранить книгу', cancel:'Отмена', titleLabel:'Название', authorLabel:'Автор', descriptionLabel:'Описание', copiesLabel:'Количество экземпляров', coverLabel:'Обложка',
        filterTitle:'Фильтры каталога', filterHint:'Можно выбрать несколько условий одновременно.', clearAll:'Очистить всё', applyFilters:'Применить', minCopies:'Минимум экземпляров', sortLabel:'Сортировка',
        profileTitle:'Профиль читателя', avatarTitle:'Аватар', uploadAvatar:'Загрузить свою аватарку', chooseAvatar:'Выбрать готовую', saveProfile:'Сохранить профиль',
        shown:'Показано', of:'из', availableCount:'В наличии', copiesCount:'Экземпляров', copyAbbr:'экз.', openBook:'Открыть книгу', unknownAuthor:'автор не указан', deleteBook:'Удалить',
        adminManage:'🛡️ Админ: управление книгами', userManage:'👤 Пользователь: просмотр и комментарии', guestManage:'👀 Гость: просмотр, поиск и фильтры', voiceSearch:'Голосовой поиск'
    },
    en: { navHome:'Home', navStats:'Statistics', navAbout:'About', profile:'Profile', logout:'Log out', heroWelcome:'BIBLIOTECH', heroTitle:'Library catalog', heroText:'Search, lending and book tracking in one place.', openCatalog:'Open catalog', viewStats:'View statistics', readersEyebrow:'For readers', readersTitle:'🌿 A space for choosing books', readersText:'Quickly choose what to read next: mood, author and useful notes.', shelfTitle:'Catalog', shelfSubtitle:'Search and manage books', guestView:'Guest: browsing, search and filters are available', addBook:'+ Add book', smartSearch:'Search', searchPlaceholder:'Title, author or description', filterBtn:'Filters', qrBtn:'▣ Scan QR', all:'📚 All books', inStock:'✅ Available', outStock:'❌ Unavailable', bestMatch:'Best match', send:'Send', close:'Close', comments:'Comments', copies:'Copies', noComments:'No comments yet.', commentPlaceholder:'Write a comment...', bookDetails:'Book card', bookStatus:'Status', bookAuthor:'Author', bookAdded:'Added', readingHint:'Reader tip', readingHintText:'Read the description, check availability and leave a comment after reading.', modalAddTitle:'Add book', saveBook:'Save book', cancel:'Cancel', titleLabel:'Title', authorLabel:'Author', descriptionLabel:'Description', copiesLabel:'Number of copies', coverLabel:'Cover', filterTitle:'Catalog filters', filterHint:'You can combine several filters at once.', clearAll:'Clear all', applyFilters:'Apply', minCopies:'Minimum copies', sortLabel:'Sorting', profileTitle:'Reader profile', avatarTitle:'Avatar', uploadAvatar:'Upload avatar', chooseAvatar:'Choose preset', saveProfile:'Save profile', shown:'Shown', of:'of', availableCount:'Available', copiesCount:'Copies', copyAbbr:'copies', openBook:'Open book', unknownAuthor:'author not specified', deleteBook:'Delete', adminManage:'🛡️ Admin: manage books', userManage:'👤 User: browsing and comments', guestManage:'👀 Guest: browsing, search and filters', voiceSearch:'Voice search' },
    uk: {}, de: {}, kk: {}, es: {}, zh: {}
};
I18N_KEYS.uk = { ...I18N_KEYS.ru, navHome:'Головна', navStats:'Статистика', navAbout:'Про нас', profile:'Профіль', logout:'Вийти', heroTitle:'Каталог бібліотеки', heroText:'Пошук, видача та облік книг в одному місці.', openCatalog:'Відкрити каталог', viewStats:'Переглянути статистику', shelfTitle:'Каталог', shelfSubtitle:'Пошук і керування книгами', smartSearch:'Пошук', searchPlaceholder:'Назва, автор або опис', all:'📚 Усі книги', addBook:'+ Додати книгу', filterBtn:'Фільтри', qrBtn:'▣ Сканувати QR', comments:'Коментарі', copies:'Копії', send:'Надіслати', close:'Закрити', bookDetails:'Картка книги', shown:'Показано', of:'з', availableCount:'У наявності', copiesCount:'Примірників', copyAbbr:'прим.', openBook:'Відкрити книгу', unknownAuthor:'автора не вказано', deleteBook:'Видалити', adminManage:'🛡️ Адмін: керування книгами', userManage:'👤 Користувач: перегляд і коментарі', guestManage:'👀 Гість: перегляд, пошук і фільтри', voiceSearch:'Голосовий пошук' };
I18N_KEYS.de = { ...I18N_KEYS.en, navHome:'Startseite', navStats:'Statistik', navAbout:'Über uns', profile:'Profil', logout:'Abmelden', heroTitle:'Bibliothekskatalog', heroText:'Suche, Ausleihe und Buchverwaltung an einem Ort.', openCatalog:'Katalog öffnen', viewStats:'Statistik ansehen', shelfTitle:'Katalog', shelfSubtitle:'Bücher suchen und verwalten', smartSearch:'Suche', searchPlaceholder:'Titel, Autor oder Beschreibung', all:'📚 Alle Bücher', addBook:'+ Buch hinzufügen', filterBtn:'Filter', qrBtn:'▣ QR scannen', comments:'Kommentare', copies:'Exemplare', send:'Senden', close:'Schließen', bookDetails:'Buchkarte', shown:'Angezeigt', of:'von', availableCount:'Verfügbar', copiesCount:'Exemplare', copyAbbr:'Ex.', openBook:'Buch öffnen', unknownAuthor:'Autor nicht angegeben', deleteBook:'Löschen', adminManage:'🛡️ Admin: Bücher verwalten', userManage:'👤 Benutzer: Ansicht und Kommentare', guestManage:'👀 Gast: Ansicht, Suche und Filter', voiceSearch:'Sprachsuche' };
I18N_KEYS.kk = { ...I18N_KEYS.ru, navHome:'Басты бет', navStats:'Статистика', navAbout:'Біз туралы', profile:'Профиль', logout:'Шығу', heroTitle:'Кітапхана каталогы', heroText:'Кітаптарды іздеу, беру және есепке алу бір жерде.', openCatalog:'Каталогты ашу', viewStats:'Статистиканы көру', shelfTitle:'Каталог', shelfSubtitle:'Кітаптарды іздеу және басқару', smartSearch:'Іздеу', searchPlaceholder:'Атауы, авторы немесе сипаттамасы', all:'📚 Барлық кітаптар', addBook:'+ Кітап қосу', filterBtn:'Сүзгілер', qrBtn:'▣ QR сканерлеу', comments:'Пікірлер', copies:'Дана', send:'Жіберу', close:'Жабу', bookDetails:'Кітап картасы', shown:'Көрсетілді', of:'ішінен', availableCount:'Қолжетімді', copiesCount:'Дана', copyAbbr:'дана', openBook:'Кітапты ашу', unknownAuthor:'автор көрсетілмеген', deleteBook:'Жою', adminManage:'🛡️ Әкімші: кітаптарды басқару', userManage:'👤 Пайдаланушы: көру және пікірлер', guestManage:'👀 Қонақ: көру, іздеу және сүзгілер', voiceSearch:'Дауыспен іздеу' };
I18N_KEYS.es = { ...I18N_KEYS.en, navHome:'Inicio', navStats:'Estadística', navAbout:'Sobre nosotros', profile:'Perfil', logout:'Salir', heroTitle:'Catálogo de la biblioteca', heroText:'Búsqueda, préstamo y control de libros en un solo lugar.', openCatalog:'Abrir catálogo', viewStats:'Ver estadísticas', shelfTitle:'Catálogo', shelfSubtitle:'Buscar y gestionar libros', smartSearch:'Buscar', searchPlaceholder:'Título, autor o descripción', all:'📚 Todos los libros', addBook:'+ Añadir libro', filterBtn:'Filtros', qrBtn:'▣ Escanear QR', comments:'Comentarios', copies:'Copias', send:'Enviar', close:'Cerrar', bookDetails:'Ficha del libro', bookAuthor:'Autor', bookStatus:'Estado', bookAdded:'Añadido', shown:'Mostrados', of:'de', availableCount:'Disponibles', copiesCount:'Ejemplares', copyAbbr:'ej.', openBook:'Abrir libro', unknownAuthor:'autor no indicado', deleteBook:'Eliminar', adminManage:'🛡️ Admin: gestionar libros', userManage:'👤 Usuario: consulta y comentarios', guestManage:'👀 Invitado: consulta, búsqueda y filtros', voiceSearch:'Búsqueda por voz' };
I18N_KEYS.zh = { ...I18N_KEYS.en, navHome:'首页', navStats:'统计', navAbout:'关于我们', profile:'个人资料', logout:'退出', heroTitle:'图书馆目录', heroText:'图书搜索、借阅和管理集中在一处。', openCatalog:'打开目录', viewStats:'查看统计', shelfTitle:'目录', shelfSubtitle:'搜索和管理图书', smartSearch:'搜索', searchPlaceholder:'书名、作者或描述', all:'📚 全部图书', addBook:'+ 添加图书', filterBtn:'筛选', qrBtn:'▣ 扫描二维码', comments:'评论', copies:'册数', send:'发送', close:'关闭', bookDetails:'图书卡片', bookAuthor:'作者', bookStatus:'状态', bookAdded:'添加日期', shown:'显示', of:'共', availableCount:'可借', copiesCount:'册数', copyAbbr:'册', openBook:'打开图书', unknownAuthor:'未注明作者', deleteBook:'删除', adminManage:'🛡️ 管理员：管理图书', userManage:'👤 用户：浏览和评论', guestManage:'👀 访客：浏览、搜索和筛选', voiceSearch:'语音搜索' };

function getLangPack(lang = localStorage.getItem(LANGUAGE_KEY) || 'ru') {
    return { ...(I18N_KEYS.ru || {}), ...(I18N_KEYS[lang] || {}), ...(I18N[lang] || {}) };
}
function tr(key) { return getLangPack()[key] || key; }
function setSmartText(selector, key) { const el = document.querySelector(selector); if (el) el.textContent = tr(key); }
function setSmartHTML(selector, key) { const el = document.querySelector(selector); if (el) el.innerHTML = escapeHtml(tr(key)).replace(/\\n/g, '<br>'); }
function setSmartPlaceholder(selector, key) { const el = document.querySelector(selector); if (el) el.placeholder = tr(key); }

// Задел под будущий сервер/облако: вместо локального словаря можно подключить endpoint.
async function translateViaProvider(key, lang) {
    const local = getLangPack(lang)[key];
    if (local) return local;
    // return fetch('/api/translate', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key, lang})}).then(r=>r.json()).then(d=>d.text);
    return key;
}

function applyLanguage(lang = localStorage.getItem(LANGUAGE_KEY) || 'ru') {
    if (!I18N[lang] && !I18N_KEYS[lang]) lang = 'ru';
    localStorage.setItem(LANGUAGE_KEY, lang);
    document.documentElement.lang = lang;
    const t = { ...(I18N[lang] || I18N.ru), ...getLangPack(lang) };

    setSmartText('nav a[href^="home.html"]', 'navHome');
    setSmartText('nav a[href^="stats.html"]', 'navStats');
    setSmartText('nav a[href^="about.html"]', 'navAbout');
    setSmartText('#logoutBtn', 'logout');
    setSmartText('.hero--info h2', 'heroWelcome');
    setSmartHTML('.hero--info h1', 'heroTitle');
    setSmartText('.hero--info p', 'heroText');
    setSmartText('.product-hero-primary', 'openCatalog');
    setSmartText('.product-hero-secondary', 'viewStats');
    setSmartText('#openAddBookBtnHero', 'addBook');
    setSmartText('.section-heading .eyebrow', 'readersEyebrow');
    setSmartText('.section-heading h2', 'readersTitle');
    setSmartText('.section-heading p', 'readersText');
    setSmartText('.title-section h1', 'shelfTitle');
    setSmartText('.title-section p', 'shelfSubtitle');
    setSmartText('#openModalBtn', 'addBook');
    setSmartText('.search-box label', 'smartSearch');
    setSmartPlaceholder('#searchInput', 'searchPlaceholder');
    setSmartText('#openSortModalBtn', 'filterBtn');
    setSmartText('#openQrScannerBtn', 'qrBtn');
    document.querySelectorAll('[data-filter="all"]').forEach(element => { element.textContent = tr('all'); });
    document.querySelectorAll('[data-filter="available"]').forEach(element => { element.textContent = tr('inStock'); });
    document.querySelectorAll('[data-filter="unavailable"]').forEach(element => { element.textContent = tr('outStock'); });
    const voiceButton = document.getElementById('voiceSearchBtn'); if (voiceButton) { voiceButton.title = tr('voiceSearch'); voiceButton.setAttribute('aria-label', tr('voiceSearch')); }
    const roleBanner = document.querySelector('.role-banner'); if (roleBanner) roleBanner.textContent = tr(roleBanner.classList.contains('admin') ? 'adminManage' : roleBanner.classList.contains('user') ? 'userManage' : 'guestManage');
    setSmartText('footer', 'footer');
    setSmartText('.voice-kicker', 'voiceKicker');
    setSmartText('#voiceStatus', 'voiceStatus');
    setSmartText('#voiceText', 'voiceText');
    setSmartText('.voice-hint', 'voiceHint');
    setSmartText('#qrModal h2', 'qrTitle');
    setSmartText('#qrModal .qr-modal-header p', 'qrText');
    setSmartText('#startQrBtn', 'qrStart');
    setSmartText('#stopQrBtn', 'qrStop');
    setSmartText('.qr-fallback label', 'qrManual');
    setSmartText('#applyQrTextBtn', 'qrFind');
    setSmartText('#viewModal .detail-kicker', 'bookDetails');
    setSmartText('#viewModal .book-author-label', 'bookAuthor');
    setSmartText('#viewModal .book-status-label', 'bookStatus');
    setSmartText('#viewModal .book-added-label', 'bookAdded');
    setSmartText('#viewModal .copies-label-text', 'copies');
    setSmartText('#viewModal .comments-title-text', 'comments');
    setSmartPlaceholder('#newCommentInput', 'commentPlaceholder');
    setSmartText('#addCommentBtn', 'send');
    setSmartText('#viewModal .reading-hint-title', 'readingHint');
    setSmartText('#viewModal .reading-hint-text', 'readingHintText');
    setSmartText('#bookModal .modal-title-text', 'modalAddTitle');
    setSmartText('#bookModal .submit-modal', 'saveBook');
    setSmartText('#bookModal .cancel-modal', 'cancel');
    setSmartText('#sortModal .filter-title-text', 'filterTitle');
    setSmartText('#sortModal .filter-hint-text', 'filterHint');
    setSmartText('#applyFilterModalBtn', 'applyFilters');
    setSmartText('#clearFiltersModalBtn', 'clearAll');
    setSmartText('#profileModal .profile-title-text', 'profileTitle');

    const opt = document.querySelector('#sortSelect option[value="relevance"]'); if (opt) opt.textContent = t.sort || tr('bestMatch');
    const current = document.getElementById('langCurrentCode'); if (current) current.textContent = LANG_META[lang]?.code || 'RU';
    document.querySelectorAll('.lang-option').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
    renderBooks();
}

function setupLanguageSwitcher() {
    const btn = document.getElementById('langToggleBtn');
    const menu = document.getElementById('langMenu');
    const wrap = document.getElementById('languageSwitcher');
    applyLanguage();
    if (window.BibliotechI18n) {
        window.addEventListener('bibliotech:languagechange', event => {
            applyLanguage(event.detail?.language || localStorage.getItem(LANGUAGE_KEY) || 'ru');
        });
        return;
    }
    btn?.addEventListener('click', (e) => { e.stopPropagation(); menu?.classList.toggle('active'); wrap?.classList.toggle('open'); });
    document.querySelectorAll('.lang-option').forEach(option => option.addEventListener('click', () => {
        applyLanguage(option.dataset.lang);
        menu?.classList.remove('active'); wrap?.classList.remove('open');
        const languageUpdatedMessages = {
            ru: 'Язык интерфейса обновлён',
            en: 'Interface language updated',
            uk: 'Мову інтерфейсу оновлено',
            de: 'Oberflächensprache aktualisiert',
            kk: 'Интерфейс тілі жаңартылды',
            es: 'Idioma de la interfaz actualizado',
            zh: '界面语言已更新'
        };
        notify(languageUpdatedMessages[option.dataset.lang] || languageUpdatedMessages.ru);
    }));
    document.addEventListener('click', (e) => { if (wrap && !wrap.contains(e.target)) { menu?.classList.remove('active'); wrap.classList.remove('open'); } });
}

let qrStream = null;
let qrLoopId = null;
function buildBookDeepLink(bookId) {
    const url = new URL('home.html', window.location.href);
    url.searchParams.set('book', String(bookId));
    return url.toString();
}

function parseBookIdFromQrPayload(text = '') {
    const value = String(text).trim();
    if (!value) return null;
    try {
        const url = new URL(value);
        const bookParam = url.searchParams.get('book');
        if (bookParam && Number.isFinite(Number(bookParam))) return Number(bookParam);
        if (url.protocol === 'bibliotech:' && url.hostname.toLowerCase() === 'book') {
            const id = url.pathname.split('/').filter(Boolean).pop();
            return Number.isFinite(Number(id)) ? Number(id) : null;
        }
    } catch {
        const bookMatch = value.match(/^bibliotech:\/\/book\/(\d+)/i) || value.match(/^book:(\d+)$/i);
        if (bookMatch) return Number(bookMatch[1]);
    }
    const codeMatch = value.match(/^BT0*(\d+)$/i);
    return codeMatch ? Number(codeMatch[1]) : null;
}

function parseQrPayload(text = '') {
    const value = String(text).trim();
    if (!value) return '';
    const bookId = parseBookIdFromQrPayload(value);
    if (bookId) return buildBookQrCode(bookId) || String(bookId);
    try {
        const url = new URL(value);
        const query = url.searchParams.get('q') || url.searchParams.get('title');
        if (query) return query;
        const hash = decodeURIComponent(url.hash.replace(/^#/, ''));
        if (hash) return hash;
        return url.pathname.split('/').filter(Boolean).pop() || value;
    } catch {
        return value.replace(/^bibliotech:\/\/search\//i, '').trim();
    }
}

function getBookFromQrPayload(rawText = '') {
    const bookId = parseBookIdFromQrPayload(rawText);
    if (bookId) {
        const byId = state.books.find(book => Number(book.id) === Number(bookId));
        if (byId) return byId;
    }
    const query = parseQrPayload(rawText);
    if (!query) return null;
    const normalized = normalizeText(query);
    return state.books.find(book => {
        const code = normalizeText(book.qrCode || book.qr_code || buildBookQrCode(book.id));
        const payload = normalizeText(book.qrPayload || book.qr_payload || buildBookDeepLink(book.id));
        return code === normalized || payload === normalized || String(book.id) === String(query);
    }) || null;
}
function applyQrResult(rawText) {
    const book = getBookFromQrPayload(rawText);
    if (book) {
        closeQrScanner();
        state.search = '';
        localStorage.removeItem('lastSearch');
        const input = document.getElementById('searchInput');
        if (input) input.value = '';
        renderBooks();
        openBook(book.id);
        notify('QR распознан: карточка открыта');
        return;
    }

    const query = parseQrPayload(rawText);
    if (!query) return;
    const input = document.getElementById('searchInput');
    if (input) input.value = query;
    state.search = query;
    localStorage.setItem('lastSearch', query);
    renderBooks();
    closeQrScanner();
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    notify('QR распознан: ' + query);
}

function getBookQrPayload(book) {
    return buildBookDeepLink(book.id);
}

function createBookQrDataUrl(payload) {
    if (typeof window.qrcode !== 'function') return '';

    try {
        const qr = window.qrcode(0, 'M');
        qr.addData(payload);
        qr.make();
        return qr.createDataURL(7, 2);
    } catch (error) {
        console.warn('QR generation failed:', error);
        return '';
    }
}

function renderBookQr(book) {
    const box = document.getElementById('bookQrCode');
    const input = document.getElementById('bookQrPayload');
    if (!box || !input) return;

    const payload = getBookQrPayload(book);
    input.value = payload;

    const dataUrl = createBookQrDataUrl(payload);
    if (!dataUrl) {
        box.innerHTML = '<span class="book-qr-unavailable">QR недоступен</span>';
        return;
    }

    box.innerHTML = `<img src="${dataUrl}" alt="QR: ${escapeHtml(book.title || 'BIBLIOTECH')}">`;
}

function getActiveBookForQr() {
    return state.books.find(book => book.id === Number(state.activeBookId)) || null;
}

function safeFileName(value = 'bibliotech-qr') {
    return String(value)
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-')
        .slice(0, 64) || 'bibliotech-qr';
}

function downloadActiveBookQr() {
    const book = getActiveBookForQr();
    const img = document.querySelector('#bookQrCode img');
    if (!book || !img) return notify('QR ещё не готов', 'error');

    const link = document.createElement('a');
    link.href = img.src;
    link.download = `${safeFileName(book.title)}-qr.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

async function copyActiveBookQrPayload() {
    const input = document.getElementById('bookQrPayload');
    const value = input?.value || '';
    if (!value) return notify('QR-ссылка ещё не готова', 'error');

    try {
        await navigator.clipboard.writeText(value);
    } catch {
        input.focus();
        input.select();
        document.execCommand('copy');
        input.blur();
    }

    notify('QR-ссылка скопирована');
}

function readInitialQrSearchFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const query = params.get('q') || params.get('title');
        if (query) return query;
        return '';
    } catch {
        return '';
    }
}

function readInitialBookPayloadFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get('book') ? window.location.href : '';
    } catch {
        return '';
    }
}

function openInitialBookFromUrl(payload) {
    if (!payload) return false;
    const book = getBookFromQrPayload(payload);
    if (!book) {
        const query = parseQrPayload(payload);
        if (query) {
            state.search = query;
            localStorage.setItem('lastSearch', query);
            const input = document.getElementById('searchInput');
            if (input) input.value = query;
            renderBooks();
            notify('Книга из QR не найдена, открыт поиск');
        }
        return false;
    }
    state.search = '';
    localStorage.removeItem('lastSearch');
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    renderBooks();
    openBook(book.id);
    notify('Карточка открыта по QR');
    return true;
}
async function startQrScanner() {
    const video = document.getElementById('qrVideo');
    const status = document.getElementById('qrStatus');
    const placeholder = document.getElementById('qrCameraPlaceholder');
    if (!video) return;
    if (!('BarcodeDetector' in window)) {
        if (status) status.textContent = 'В этом браузере нет встроенного QR-сканера. Вставьте текст QR вручную ниже.';
        return;
    }
    try {
        qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = qrStream;
        await video.play();
        placeholder?.classList.add('hidden');
        if (status) status.textContent = 'Камера включена. Наведите рамку на QR-код.';
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const scan = async () => {
            if (!qrStream) return;
            try {
                const codes = await detector.detect(video);
                if (codes.length) { applyQrResult(codes[0].rawValue); return; }
            } catch {}
            qrLoopId = requestAnimationFrame(scan);
        };
        scan();
    } catch (err) {
        if (status) status.textContent = 'Камера недоступна. Разрешите доступ или откройте сайт через localhost/HTTPS.';
        notify('Не удалось включить камеру', 'error');
    }
}
function stopQrScanner() {
    if (qrLoopId) cancelAnimationFrame(qrLoopId);
    qrLoopId = null;
    if (qrStream) qrStream.getTracks().forEach(track => track.stop());
    qrStream = null;
    const video = document.getElementById('qrVideo');
    if (video) video.srcObject = null;
    document.getElementById('qrCameraPlaceholder')?.classList.remove('hidden');
}
function closeQrScanner() { stopQrScanner(); closeModal('#qrModal'); }
function setupQrScanner() {
    document.getElementById('openQrScannerBtn')?.addEventListener('click', () => openModal('#qrModal'));
    document.getElementById('closeQrModalBtn')?.addEventListener('click', closeQrScanner);
    document.getElementById('qrModal')?.addEventListener('click', e => { if (e.target.id === 'qrModal') closeQrScanner(); });
    document.getElementById('startQrBtn')?.addEventListener('click', startQrScanner);
    document.getElementById('stopQrBtn')?.addEventListener('click', stopQrScanner);
    document.getElementById('applyQrTextBtn')?.addEventListener('click', () => applyQrResult(document.getElementById('qrManualInput')?.value));
    document.getElementById('qrManualInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyQrResult(e.target.value); });
}

let qrScanCanvas = null;
let qrScanContext = null;
let qrLastScanAt = 0;

function setQrStatus(message) {
    const status = document.getElementById('qrStatus');
    if (status) status.textContent = message;
}

function setQrPlaceholderVisible(isVisible) {
    document.getElementById('qrCameraPlaceholder')?.classList.toggle('hidden', !isVisible);
}

async function createNativeQrDetector() {
    if (!('BarcodeDetector' in window)) return null;

    try {
        if (typeof BarcodeDetector.getSupportedFormats === 'function') {
            const formats = await BarcodeDetector.getSupportedFormats();
            if (!formats.includes('qr_code')) return null;
        }
        return new BarcodeDetector({ formats: ['qr_code'] });
    } catch {
        return null;
    }
}

async function requestQrCameraStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('unsupported-camera');
    }

    const mainConstraints = {
        audio: false,
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    };

    try {
        return await navigator.mediaDevices.getUserMedia(mainConstraints);
    } catch (error) {
        if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') throw error;
        return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }
}

function readQrWithJsQr(video) {
    if (typeof window.jsQR !== 'function') return '';
    if (!video.videoWidth || !video.videoHeight) return '';

    const maxEdge = 900;
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.floor(video.videoWidth * scale));
    const height = Math.max(1, Math.floor(video.videoHeight * scale));

    if (!qrScanCanvas) qrScanCanvas = document.createElement('canvas');
    qrScanCanvas.width = width;
    qrScanCanvas.height = height;
    qrScanContext = qrScanCanvas.getContext('2d', { willReadFrequently: true }) || qrScanCanvas.getContext('2d');
    if (!qrScanContext) return '';

    qrScanContext.drawImage(video, 0, 0, width, height);
    const imageData = qrScanContext.getImageData(0, 0, width, height);
    const code = window.jsQR(imageData.data, width, height, { inversionAttempts: 'attemptBoth' });
    return code?.data || '';
}

async function readQrFrame(video, nativeDetector) {
    if (nativeDetector) {
        try {
            const codes = await nativeDetector.detect(video);
            if (codes?.length) return codes[0].rawValue || '';
        } catch {}
    }

    return readQrWithJsQr(video);
}

async function waitForVideoFrame(video) {
    if (video.readyState >= 2 && video.videoWidth) return;

    await new Promise(resolve => {
        const done = () => {
            video.removeEventListener('loadedmetadata', done);
            video.removeEventListener('canplay', done);
            resolve();
        };
        video.addEventListener('loadedmetadata', done, { once: true });
        video.addEventListener('canplay', done, { once: true });
        setTimeout(done, 1200);
    });
}

function explainQrCameraError(error) {
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        return 'На iPhone камера работает только через HTTPS. Откройте сайт по ссылке Render или через защищенный туннель.';
    }

    if (error?.name === 'NotAllowedError') {
        return 'iPhone не дал доступ к камере. Нажмите Aa в адресной строке Safari, откройте настройки сайта и разрешите камеру.';
    }

    if (error?.name === 'NotFoundError' || error?.message === 'unsupported-camera') {
        return 'Камера не найдена или браузер ее не поддерживает. Можно вставить текст QR вручную ниже.';
    }

    return 'Камеру не удалось включить. Проверьте разрешение камеры и откройте сайт через HTTPS.';
}

startQrScanner = async function startQrScanner() {
    const video = document.getElementById('qrVideo');
    if (!video) return;

    stopQrScanner();

    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        setQrStatus('На iPhone камера работает только через HTTPS. Откройте сайт по ссылке Render.');
        return;
    }

    try {
        setQrStatus('Запрашиваю доступ к камере...');
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.muted = true;

        qrStream = await requestQrCameraStream();
        video.srcObject = qrStream;
        await video.play();
        await waitForVideoFrame(video);

        setQrPlaceholderVisible(false);
        const nativeDetector = await createNativeQrDetector();
        setQrStatus(nativeDetector ? 'Камера включена. Наведите рамку на QR-код.' : 'Камера включена. iPhone-режим распознавания QR активен.');

        const scan = async (time = performance.now()) => {
            if (!qrStream) return;

            if (time - qrLastScanAt > 180) {
                qrLastScanAt = time;
                const value = await readQrFrame(video, nativeDetector);
                if (value) {
                    applyQrResult(value);
                    return;
                }
            }

            qrLoopId = requestAnimationFrame(scan);
        };

        scan();
    } catch (error) {
        setQrPlaceholderVisible(true);
        setQrStatus(explainQrCameraError(error));
        notify('Не удалось включить камеру', 'error');
    }
};

stopQrScanner = function stopQrScanner() {
    if (qrLoopId) cancelAnimationFrame(qrLoopId);
    qrLoopId = null;
    qrLastScanAt = 0;

    if (qrStream) qrStream.getTracks().forEach(track => track.stop());
    qrStream = null;

    const video = document.getElementById('qrVideo');
    if (video) {
        video.pause?.();
        video.srcObject = null;
    }

    setQrPlaceholderVisible(true);
};

closeQrScanner = function closeQrScanner() {
    stopQrScanner();
    closeModal('#qrModal');
};

function setupVoiceSearch() {
    const btn = $('#voiceSearchBtn');
    const modal = $('#voiceModal');
    const closeBtn = $('#voiceModalClose');
    const statusEl = $('#voiceStatus');
    const textEl = $('#voiceText');
    if (!btn) return;

    const closeVoiceModal = () => {
        modal?.classList.remove('active');
        btn.classList.remove('listening');
        if (statusEl) statusEl.textContent = 'Готов к прослушиванию';
    };

    closeBtn?.addEventListener('click', closeVoiceModal);
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeVoiceModal(); });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        btn.disabled = true;
        btn.title = 'Голосовой поиск не поддерживается в этом браузере';
        btn.style.opacity = '0.55';
        return;
    }

    btn.addEventListener('click', () => {
        const recognition = new SpeechRecognition();
        recognition.lang = 'ru-RU';
        recognition.interimResults = true;
        recognition.continuous = false;

        modal?.classList.add('active');
        btn.classList.add('listening');
        if (statusEl) statusEl.textContent = 'Слушаю вас…';
        if (textEl) textEl.textContent = 'Можно сказать: «Булгаков», «фантастика», «книга про приключения»';

        recognition.onresult = (event) => {
            const text = Array.from(event.results).map(result => result[0].transcript).join(' ').trim();
            if (textEl) textEl.textContent = text || 'Распознаю запрос…';
            if (event.results[event.results.length - 1].isFinal && text) {
                $('#searchInput').value = text;
                state.search = text;
                localStorage.setItem('lastSearch', text);
                renderBooks();
                if (statusEl) statusEl.textContent = 'Готово! Ищу по каталогу';
                setTimeout(closeVoiceModal, 950);
            }
        };

        recognition.onend = () => {
            btn.classList.remove('listening');
            if (modal?.classList.contains('active') && statusEl?.textContent === 'Слушаю вас…') {
                statusEl.textContent = 'Запрос не распознан';
                if (textEl) textEl.textContent = 'Попробуйте нажать микрофон ещё раз и сказать запрос чётче';
            }
        };

        recognition.onerror = () => {
            btn.classList.remove('listening');
            if (statusEl) statusEl.textContent = 'Не удалось включить микрофон';
            if (textEl) textEl.textContent = 'Проверьте разрешение браузера на использование микрофона';
            notify('Голосовой поиск не сработал', 'error');
        };

        recognition.start();
    });
}


function getProfileAvatarKey() {
    const session = getSession();
    const name = session?.username || (session?.guest ? 'guest' : 'user');
    return `bibliotech_avatar_${name}`;
}

function getStoredAvatar() {
    return localStorage.getItem(getProfileAvatarKey()) || '';
}

function applyProfileAvatar() {
    const avatar = getStoredAvatar();
    const profileAvatar = document.getElementById('profileAvatar');
    const pill = document.getElementById('currentUserPill');
    const session = getSession();
    const label = getRoleLabel();
    const defaultIcon = session?.guest ? '👀' : (isAdmin() ? '🛡️' : '👤');
    const icon = avatar || defaultIcon;
    if (profileAvatar) {
        if (icon.startsWith('data:image')) profileAvatar.innerHTML = `<img src="${icon}" alt="avatar">`;
        else profileAvatar.textContent = icon;
    }
    if (pill) {
        const visual = icon.startsWith('data:image') ? `<img src="${icon}" alt="avatar" class="pill-avatar-img">` : `<span class="pill-avatar-emoji">${icon}</span>`;
        pill.innerHTML = `${visual}<span>${label}</span>`;
    }
}

function updateActiveFiltersUI() {
    const bar = document.getElementById('activeFilterBar');
    const badge = document.getElementById('filterCountBadge');
    const labels = [];
    if (state.filter === 'available') labels.push(tr('inStock'));
    else if (state.filter === 'unavailable') labels.push(tr('outStock'));
    else labels.push(tr('all'));
    if (state.sort && state.sort !== 'relevance') {
        const sortNames = { 'title-asc':'Название А–Я', 'title-desc':'Название Я–А', 'author-asc':'Автор А–Я', 'date-newest':'Новые', 'date-oldest':'Старые', 'available-first':'Доступные первыми', 'copies-desc':'Больше копий', 'copies-asc':'Меньше копий' };
        labels.push('↕ ' + (sortNames[state.sort] || state.sort));
    }
    if (Number(state.minCopies) > 0) labels.push(`📘 от ${state.minCopies} экз.`);
    if (bar) bar.innerHTML = labels.map((text, i) => `<span class="filter-pill ${i===0?'active':''}">${escapeHtml(text)}</span>`).join('');
    if (badge) {
        const count = (state.filter !== 'all' ? 1 : 0) + (state.sort !== 'relevance' ? 1 : 0) + (Number(state.minCopies) > 0 ? 1 : 0);
        badge.textContent = count;
        badge.classList.toggle('is-zero', count === 0);
    }
    document.querySelectorAll('.filter-choice').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === state.filter));
    document.querySelectorAll('.sort-option-btn').forEach(btn => btn.classList.toggle('selected', btn.dataset.sort === state.sort));
    const min = document.getElementById('filterMinCopies');
    if (min) min.value = Number(state.minCopies || 0);
}

function setupDynamicHeader() {
    const header = document.querySelector('header');
    const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
}

function setupProfileModal() {
    const pill = document.getElementById('currentUserPill');
    const modal = document.getElementById('profileModal');
    const closeBtn = document.getElementById('closeProfileModalBtn');
    const logoutBtn = document.getElementById('profileLogoutBtn');
    const avatarInput = document.getElementById('profileAvatarInput');
    const presetGrid = document.getElementById('avatarPresetGrid');

    const refreshProfile = () => {
        let session = null;
        try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) {}
        const role = getRole();
        const name = session?.guest ? 'Гость' : (session?.username || 'Пользователь');
        const isGuestMode = role === 'guest';
        const books = Array.isArray(state.books) ? state.books : [];
        const available = books.filter(book => book.available).length;
        const comments = books.reduce((sum, book) => sum + (book.comments?.length || 0), 0);
        document.getElementById('profileName') && (document.getElementById('profileName').textContent = name);
        applyProfileAvatar();
        const badge = document.getElementById('profileModeBadge');
        if (badge) {
            badge.textContent = role === 'admin' ? 'Аккаунт администратора' : role === 'user' ? 'Аккаунт пользователя' : 'Гостевой режим';
            badge.classList.toggle('guest', isGuestMode);
            badge.classList.toggle('user', role === 'user');
        }
        const roleDetails = {
            admin: {
                icon: '🛡️',
                title: 'Админский доступ',
                note: 'Управление каталогом и карточками книг',
                permissions: ['Книги: управление', 'Комментарии: модерация', 'Темы: персонально']
            },
            user: {
                icon: '👤',
                title: 'Читательский доступ',
                note: 'Поиск книг и участие в обсуждениях',
                permissions: ['Каталог: просмотр', 'Комментарии: участие', 'Темы: персонально']
            },
            guest: {
                icon: '👀',
                title: 'Гостевой доступ',
                note: 'Быстрый просмотр каталога без аккаунта',
                permissions: ['Каталог: просмотр', 'Поиск: доступен', 'Комментарии: закрыты']
            }
        };
        const details = roleDetails[role] || roleDetails.user;
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        setText('profileRoleIcon', details.icon);
        setText('profileAccessTitle', details.title);
        setText('profileRoleNote', details.note);
        setText('profilePermissionOne', details.permissions[0]);
        setText('profilePermissionTwo', details.permissions[1]);
        setText('profilePermissionThree', details.permissions[2]);
        document.getElementById('profileBooksCount') && (document.getElementById('profileBooksCount').textContent = books.length);
        document.getElementById('profileAvailableCount') && (document.getElementById('profileAvailableCount').textContent = available);
        document.getElementById('profileCommentsCount') && (document.getElementById('profileCommentsCount').textContent = comments);
    };

    pill?.addEventListener('click', () => { refreshProfile(); openModal('#profileModal'); });
    closeBtn?.addEventListener('click', () => closeModal('#profileModal'));
    modal?.addEventListener('click', e => { if (e.target.id === 'profileModal') closeModal('#profileModal'); });
    logoutBtn?.addEventListener('click', () => { clearAuthSession(); window.location.href = 'index.html'; });
    avatarInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;
        try {
            const avatar = await compressImageFile(file, {
                maxWidth: 320,
                maxHeight: 320,
                quality: 0.8,
                maxDataLength: 600000
            });
            localStorage.setItem(getProfileAvatarKey(), avatar);
            applyProfileAvatar();
            notify('Аватар обновлён', 'success');
        } catch (error) {
            e.target.value = '';
            notify('Не удалось обработать аватар. Выберите изображение до 8 МБ.', 'error');
        }
    });
    presetGrid?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-avatar]');
        if (!btn) return;
        localStorage.setItem(getProfileAvatarKey(), btn.dataset.avatar);
        applyProfileAvatar();
    });
}



function updateThemeIcon(theme) {
    const allowed = ['light','dark','forest','ocean','sunset','violet','coffee','mono'];
    const iconFiles = {
        light: 'appicon-light.png',
        dark: 'appicon-dark.png',
        forest: 'appicon-forest.png',
        ocean: 'appicon-ocean.png',
        sunset: 'appicon-sunset.png',
        violet: 'appicon-violet.png',
        coffee: 'appicon-coffee.png',
        mono: 'appicon-mono.png'
    };
    const normalized = allowed.includes(theme) ? theme : 'light';
    const iconPath = `img/${iconFiles[normalized] || iconFiles.light}`;
    const setLink = (rel, attr, href = iconPath) => {
        let link = document.querySelector(`link[rel="${rel}"]`);
        if (!link) {
            link = document.createElement('link');
            link.rel = rel;
            document.head.appendChild(link);
        }
        link.href = href;
        if (attr) Object.entries(attr).forEach(([k,v]) => link.setAttribute(k,v));
    };
    setLink('icon', {'type':'image/png'});
    setLink('apple-touch-icon');
    setLink('manifest', {}, `/manifest.webmanifest?theme=${encodeURIComponent(normalized)}`);
    document.querySelectorAll('.brand-logo img, .auth-brand img, .logo-orb img, .about-logo-showcase img').forEach(img => {
        img.src = iconPath;
        img.removeAttribute('srcset');
    });
}

function applyTheme(theme) {
    const allowedThemes = ['light', 'dark', 'forest', 'ocean', 'sunset', 'violet', 'coffee', 'mono'];
    const normalized = allowedThemes.includes(theme) ? theme : 'light';
    const darkThemes = ['dark', 'forest', 'ocean', 'violet', 'mono'];
    const themeColors = {
        light: '#f9f6f0',
        dark: '#061712',
        forest: '#061f18',
        ocean: '#06192c',
        sunset: '#fff2df',
        violet: '#170921',
        coffee: '#f5eadb',
        mono: '#0d0d0d'
    };
    document.body.classList.remove('dark-theme', 'theme-light', 'theme-dark', 'theme-forest', 'theme-ocean', 'theme-sunset', 'theme-violet', 'theme-coffee', 'theme-mono');
    document.documentElement.classList.remove('dark-theme', 'theme-light', 'theme-dark', 'theme-forest', 'theme-ocean', 'theme-sunset', 'theme-violet', 'theme-coffee', 'theme-mono');
    document.body.classList.add(`theme-${normalized}`);
    document.documentElement.classList.add(`theme-${normalized}`);
    document.body.dataset.theme = normalized;
    document.documentElement.dataset.theme = normalized;
    if (darkThemes.includes(normalized)) {
        document.body.classList.add('dark-theme');
        document.documentElement.classList.add('dark-theme');
    }
    const floatingBtn = $('#floatingThemeToggle');
    if (floatingBtn) {
        floatingBtn.textContent = document.body.classList.contains('dark-theme') ? '☀️' : '🌙';
        floatingBtn.title = document.body.classList.contains('dark-theme') ? 'Светлая тема' : 'Тёмная тема';
    }
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
        metaTheme = document.createElement('meta');
        metaTheme.name = 'theme-color';
        document.head.appendChild(metaTheme);
    }
    metaTheme.content = themeColors[normalized] || themeColors.light;
    updateThemeIcon(normalized);
    document.querySelectorAll('.theme-preset').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === normalized));
}

function setupTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    const btn = $('#floatingThemeToggle');
    if (btn) {
        btn.addEventListener('click', () => {
            const current = localStorage.getItem('theme') || 'light';
            const next = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
            localStorage.setItem('theme', next);
            applyTheme(next);
            notify(next === 'dark' ? 'Включена тёмная тема' : 'Включена светлая тема', 'info');
        });
    }

    const themeGrid = $('#themePresetGrid');
    themeGrid?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-theme]');
        if (!btn) return;
        const theme = btn.dataset.theme;
        localStorage.setItem('theme', theme);
        applyTheme(theme);
        notify(`Тема изменена: ${btn.querySelector('b')?.textContent || theme}`, 'success');
    });
}

function setupGuestMode() {
    const role = getRole();
    document.body.classList.remove('guest-mode', 'role-guest', 'role-user', 'role-admin');
    document.body.classList.add(`role-${role}`);
    if (role === 'guest') document.body.classList.add('guest-mode');

    const manage = canManageBooks();
    ['#openModalBtn', '#openAddBookBtnHero'].forEach(selector => {
        const btn = $(selector);
        if (!btn) return;
        btn.hidden = !manage;
        btn.disabled = !manage;
        btn.classList.toggle('hidden', !manage);
        btn.setAttribute('aria-hidden', String(!manage));
    });
    $$('.admin-nav-item').forEach(item => item.classList.toggle('hidden', !manage));

    const header = $('.header-actions');
    const oldBanner = $('.role-banner, .guest-banner');
    oldBanner?.remove();
    const bannerText = tr(role === 'admin' ? 'adminManage' : role === 'user' ? 'userManage' : 'guestManage');
    if (header) header.insertAdjacentHTML('afterbegin', `<span class="role-banner ${role}">${bannerText}</span>`);
    updateAdminPanel();
}

function setupHeroWow() {
    const hero = document.getElementById('heroWow');
    const visual = document.querySelector('.hero-wow .hero-visual');
    if (!hero) return;
    let raf = null;
    hero.addEventListener('pointermove', (e) => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            const rect = hero.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            hero.style.setProperty('--mx', x + '%');
            hero.style.setProperty('--my', y + '%');
            if (visual) {
                const rx = (y - 50) / -24;
                const ry = (x - 50) / 20;
                visual.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
            }
        });
    });
    hero.addEventListener('pointerleave', () => {
        if (visual) visual.style.transform = '';
    });
}

function init() {
    const session = getSession();
    if (!session) {
        localStorage.setItem(POST_LOGIN_URL_KEY, window.location.href);
        window.location.href = 'index.html';
        return;
    }
    if (isGuest()) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        currentToken = null;
    }
    const pill = $('#currentUserPill');
    if (pill) pill.textContent = getRoleLabel();

    const token = localStorage.getItem('token');
    if (token && !isGuest()) currentToken = token;
    updateDashboard();
    setupGuestMode();
    setupTheme();
    setupDynamicHeader();
    applyProfileAvatar();
    setupLanguageSwitcher();
    setupProfileModal();
    setupVoiceSearch();
    setupQrScanner();
    setupHeroWow();

    const menu = $('#navMenu'), menuBtn = $('#menuIcon');
    const setMobileMenuOpen = (open) => {
        if (!menu || !menuBtn) return;
        menu.classList.toggle('active', open);
        menuBtn.classList.toggle('active', open);
        menuBtn.setAttribute('aria-expanded', String(open));
        menuBtn.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
        document.body.classList.toggle('lock', open);
    };
    menuBtn?.addEventListener('click', () => setMobileMenuOpen(!menu?.classList.contains('active')));
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !menu?.classList.contains('active')) return;
        setMobileMenuOpen(false);
        menuBtn?.focus();
    });

    $('#logoutBtn')?.addEventListener('click', (e) => { e.preventDefault(); clearAuthSession(); window.location.href = 'index.html'; });
    $('#openModalBtn')?.addEventListener('click', openAddBookModal);
    $('#openAddBookBtnHero')?.addEventListener('click', openAddBookModal);
    $('#adminAddBookBtn')?.addEventListener('click', openAddBookModal);
    $('#closeModalBtn')?.addEventListener('click', () => { closeModal('#bookModal'); resetBookForm(); });
    $('#bookModal')?.addEventListener('click', e => { if (e.target.id === 'bookModal') { closeModal('#bookModal'); resetBookForm(); } });
    $('#closeViewBtn')?.addEventListener('click', () => closeModal('#viewModal'));
    $('#viewModal')?.addEventListener('click', e => { if (e.target.id === 'viewModal') closeModal('#viewModal'); });
    $('#editBookBtn')?.addEventListener('click', () => openBookEditor(state.activeBookId));
    $('#bookForm')?.addEventListener('submit', addBook);

    $('#bookCoverInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const preview = $('#imagePreview');
        const clearCoverBtn = $('#clearBookCoverBtn');
        if (!file) {
            state.coverDataUrl = state.editingBookId ? state.coverDataUrl : null;
            clearCoverBtn?.classList.toggle('hidden', !state.coverDataUrl);
            if (preview && !state.coverDataUrl) preview.innerHTML = '🖼️ Обложка не выбрана';
            return;
        }
        try {
            state.coverDataUrl = await compressImageFile(file);
            clearCoverBtn?.classList.remove('hidden');
            if (preview) preview.innerHTML = `<img src="${state.coverDataUrl}" class="preview-img" alt="Предпросмотр обложки"><span>✅ Обложка оптимизирована</span>`;
        } catch (error) {
            e.target.value = '';
            notify(error.message === 'IMAGE_TOO_LARGE'
                ? 'Изображение слишком большое. Выберите файл до 8 МБ.'
                : 'Не удалось обработать изображение.', 'error');
        }
    });

    $('#clearBookCoverBtn')?.addEventListener('click', () => {
        state.coverDataUrl = '';
        const input = $('#bookCoverInput');
        if (input) input.value = '';
        const preview = $('#imagePreview');
        if (preview) preview.innerHTML = '🖼️ Обложка убрана';
        $('#clearBookCoverBtn')?.classList.add('hidden');
    });

    $('#bookAvailable')?.addEventListener('change', () => {
        if (!$('#bookAvailable').checked) $('#bookCopies').value = 0;
        else if (Number($('#bookCopies').value) === 0) $('#bookCopies').value = 1;
    });

    $('#addCopiesMinus')?.addEventListener('click', () => {
        const input = $('#bookCopies');
        input.value = Math.max(0, Number(input.value || 0) - 1);
        $('#bookAvailable').checked = Number(input.value) > 0;
    });

    $('#addCopiesPlus')?.addEventListener('click', () => {
        const input = $('#bookCopies');
        input.value = Math.min(999, Number(input.value || 0) + 1);
        $('#bookAvailable').checked = true;
    });

    $('#copiesMinusBtn')?.addEventListener('click', () => updateCopies(-1));
    $('#copiesPlusBtn')?.addEventListener('click', () => updateCopies(1));
    $('#downloadBookQrBtn')?.addEventListener('click', downloadActiveBookQr);
    $('#copyBookQrBtn')?.addEventListener('click', copyActiveBookQrPayload);
    $('#rentBookBtn')?.addEventListener('click', toggleBookRental);

    $('#searchInput')?.addEventListener('input', (e) => {
        state.search = e.target.value;
        localStorage.setItem('lastSearch', state.search);
        renderBooks({ updateDashboard: false });
    });

    $('#clearSearchBtn')?.addEventListener('click', () => {
        $('#searchInput').value = '';
        state.search = '';
        localStorage.removeItem('lastSearch');
        renderBooks({ updateDashboard: false });
        $('#searchInput').focus();
    });

    $('#sortSelect')?.addEventListener('change', e => {
        state.sort = e.target.value;
        updateActiveFiltersUI();
        loadBooks(); 
    });

    $$('.filter-choice').forEach(btn => btn.addEventListener('click', () => {
        state.filter = btn.dataset.filter;
        updateActiveFiltersUI();
        loadBooks(); 
    }));

    $$('.sort-option-btn').forEach(btn => btn.addEventListener('click', () => {
        state.sort = btn.dataset.sort;
        if ($('#sortSelect')) $('#sortSelect').value = state.sort;
        updateActiveFiltersUI();
        loadBooks(); 
    }));

    $('#filterCopiesMinus')?.addEventListener('click', () => {
        state.minCopies = Math.max(0, Number(state.minCopies || 0) - 1);
        updateActiveFiltersUI();
        loadBooks(); 
    });

    $('#filterCopiesPlus')?.addEventListener('click', () => {
        state.minCopies = Math.min(999, Number(state.minCopies || 0) + 1);
        updateActiveFiltersUI();
        loadBooks(); 
    });

    $('#filterMinCopies')?.addEventListener('input', e => {
        state.minCopies = Math.max(0, Math.min(999, Number(e.target.value || 0)));
        updateActiveFiltersUI();
        loadBooks(); 
    });

    $('#openSortModalBtn')?.addEventListener('click', () => openModal('#sortModal'));
    $('#closeSortModalBtn')?.addEventListener('click', () => closeModal('#sortModal'));

    $('#applySortBtn')?.addEventListener('click', () => {
        closeModal('#sortModal');
        updateActiveFiltersUI();
        loadBooks(); 
    });

    $('#clearSortRulesBtn')?.addEventListener('click', () => {
        state.filter = 'all';
        state.sort = 'relevance';
        state.minCopies = 0;
        if ($('#sortSelect')) $('#sortSelect').value = 'relevance';
        updateActiveFiltersUI();
        loadBooks(); 
    });

    $('#booksContainer')?.addEventListener('click', (e) => {
        const del = e.target.closest('.delete-btn');
        if (del) {
            e.stopPropagation();
            deleteBook(del.dataset.id);
            return;
        }
        const card = e.target.closest('.book-card');
        if (card) openBook(card.dataset.id);
    });

    $('#booksContainer')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target.closest('.book-card');
        if (!card || event.target !== card) return;
        event.preventDefault();
        openBook(card.dataset.id);
    });

    $('#commentsList')?.addEventListener('click', (e) => {
        const del = e.target.closest('.delete-comment-btn');
        if (del) deleteComment(del.dataset.idx);
    });

    $('#addCommentBtn')?.addEventListener('click', addComment);
    $('#newCommentInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') addComment();
    });

    const initialBookPayload = readInitialBookPayloadFromUrl();
    const initialQrSearch = initialBookPayload ? '' : readInitialQrSearchFromUrl();
    const lastSearch = initialQrSearch || localStorage.getItem('lastSearch') || '';
    state.search = lastSearch;
    if (initialQrSearch) localStorage.setItem('lastSearch', initialQrSearch);
    if ($('#searchInput')) $('#searchInput').value = lastSearch;
    updateActiveFiltersUI();
    loadStorageLocations().then(loadBooks).then(() => {
        if (initialBookPayload) openInitialBookFromUrl(initialBookPayload);
    });
}

document.addEventListener('DOMContentLoaded', init);
