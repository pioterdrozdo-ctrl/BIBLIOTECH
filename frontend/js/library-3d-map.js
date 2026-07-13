import { createLibraryMapAdmin } from './library-map-admin.js';

const ROOM_CODE = '125';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = window.matchMedia('(pointer: coarse)');
const elements = {
    floorLevel: document.getElementById('floorLevel'),
    roomLevel: document.getElementById('roomLevel'),
    sceneShell: document.getElementById('mapSceneShell'),
    canvasHost: document.getElementById('mapCanvasHost'),
    labelLayer: document.getElementById('mapLabelLayer'),
    fallback: document.getElementById('map2dFallback'),
    loading: document.getElementById('mapLoading'),
    error: document.getElementById('mapError'),
    locationList: document.getElementById('mapLocationList'),
    selectionPanel: document.getElementById('mapSelectionPanel'),
    targetMessage: document.getElementById('targetBookMessage'),
    search: document.getElementById('mapSearchInput'),
    searchResult: document.getElementById('mapSearchResult')
};

const state = {
    data: null,
    filter: 'all',
    query: '',
    level: 'floor',
    selectedObjectId: null,
    targetBookId: readPositiveQueryId('book'),
    targetBook: null,
    matchingLocationIds: new Set(),
    three: null,
    OrbitControls: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    raycaster: null,
    pointer: null,
    resizeObserver: null,
    renderRequested: false,
    meshes: new Map(),
    labels: new Map(),
    geometryCache: new Map(),
    materialCache: new Map(),
    disposed: false,
    webgl: null,
    pointerStart: null,
    themeObserver: null
};

function readPositiveQueryId(name) {
    const raw = new URLSearchParams(window.location.search).get(name);
    const value = Number(raw);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function safeSession() {
    try { return JSON.parse(localStorage.getItem('bibliotech_current_user') || 'null'); }
    catch (error) { return null; }
}

function normalize(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru');
}

function matchesFilter(book) {
    if (state.filter === 'available') return Boolean(book.available) && Number(book.copies || 0) > 0;
    if (state.filter === 'unavailable') return !book.available || Number(book.copies || 0) <= 0;
    return true;
}

function booksForLocation(locationId) {
    return (state.data?.books || []).filter(book => Number(book.location_id) === Number(locationId));
}

function locationForObject(object) {
    return state.data?.locations.find(location => Number(location.id) === Number(object?.storage_location_id)) || null;
}

function objectForLocation(locationId) {
    return state.data?.objects.find(object => Number(object.storage_location_id) === Number(locationId)) || null;
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function showError(message) {
    elements.loading.classList.add('hidden');
    elements.error.textContent = message;
    elements.error.classList.remove('hidden');
}

async function fetchMapData() {
    const token = localStorage.getItem('token') || '';
    const response = await fetch(`/api/library-map/room/${ROOM_CODE}`, {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`
        }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить карту библиотеки');
    return payload;
}

function applyPayload(payload) {
    state.data = payload;
    state.targetBook = state.targetBookId
        ? payload.books.find(book => Number(book.id) === Number(state.targetBookId)) || null
        : null;
    admin.setObjects(payload.objects);
    renderLocationList();
    renderTargetMessage();
    if (state.scene) rebuildSceneObjects();
    else render2dFallback();
    if (state.targetBookId) focusTargetBook();
}

function showLevel(level) {
    state.level = level === 'room' ? 'room' : 'floor';
    elements.floorLevel.classList.toggle('hidden', state.level !== 'floor');
    elements.roomLevel.classList.toggle('hidden', state.level !== 'room');
    document.querySelectorAll('[data-map-level]').forEach(button => {
        const active = button.dataset.mapLevel === state.level;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    if (state.level === 'room') {
        requestRender();
        window.setTimeout(() => state.resizeObserver?.observe(elements.sceneShell), 0);
    }
}

function renderTargetMessage() {
    if (!state.targetBookId) {
        elements.targetMessage.classList.add('hidden');
        return;
    }
    elements.targetMessage.classList.remove('hidden');
    if (!state.targetBook) {
        elements.targetMessage.textContent = 'Книга с таким идентификатором не найдена.';
    } else if (!state.targetBook.location_id) {
        elements.targetMessage.textContent = `«${state.targetBook.title}»: у этой книги пока не указано место хранения.`;
    } else {
        elements.targetMessage.textContent = `Искомая книга: «${state.targetBook.title}». Место подсвечено на схеме.`;
    }
}

function locationMatchesSearch(location) {
    if (!state.query) return true;
    const object = objectForLocation(location.id);
    const locationText = normalize([
        location.shelf_code, location.place_code, location.note, object?.code, object?.label
    ].join(' '));
    if (locationText.includes(state.query)) return true;
    return booksForLocation(location.id).some(book => normalize(`${book.title} ${book.author}`).includes(state.query));
}

function locationMatchesFilter(location) {
    if (state.filter === 'all') return true;
    return booksForLocation(location.id).some(matchesFilter);
}

function renderLocationList() {
    elements.locationList.replaceChildren();
    if (!state.data) return;
    const storageObjects = state.data.objects.filter(object => object.object_type === 'storage' && object.storage_location_id);
    const locations = storageObjects
        .map(object => locationForObject(object))
        .filter(Boolean)
        .sort((a, b) => String(a.place_code).localeCompare(String(b.place_code), 'ru'));
    locations.forEach(location => {
        const books = booksForLocation(location.id);
        const button = createElement('button', 'map-location-button');
        button.type = 'button';
        button.dataset.locationId = location.id;
        button.hidden = !locationMatchesSearch(location) || !locationMatchesFilter(location);
        button.classList.toggle('selected', Number(state.selectedObjectId) === Number(objectForLocation(location.id)?.id));
        button.classList.toggle('target', Number(state.targetBook?.location_id) === Number(location.id));
        const number = createElement('span', 'place-number', String(location.place_code).padStart(2, '0'));
        const copy = createElement('span');
        copy.append(createElement('b', '', `${location.shelf_code} · место ${location.place_code}`));
        copy.append(createElement('small', '', location.note || 'Без примечания'));
        const count = createElement('span', 'place-count', `${books.length} книг`);
        button.append(number, copy, count);
        button.addEventListener('click', () => selectLocation(location.id, true));
        elements.locationList.appendChild(button);
    });
}

function renderSelectionPanel() {
    const object = state.data?.objects.find(item => Number(item.id) === Number(state.selectedObjectId));
    const location = locationForObject(object);
    elements.selectionPanel.replaceChildren();
    if (object && object.object_type !== 'storage') {
        elements.selectionPanel.append(createElement('h3', '', object.label));
        elements.selectionPanel.append(createElement('p', '', 'Выбран конструктивный объект схемы. Его координаты доступны в режиме администратора.'));
        return;
    }
    if (!object || !location) {
        elements.selectionPanel.append(createElement('h3', '', 'Выберите место 09 или 12'));
        elements.selectionPanel.append(createElement('p', '', 'Откроется список находящихся там книг.'));
        return;
    }

    const heading = createElement('div', 'map-selected-location');
    heading.append(createElement('h3', '', `${location.shelf_code} · место ${location.place_code}`));
    heading.append(createElement('small', '', `${location.note || 'Без примечания'} · кабинет 125`));
    elements.selectionPanel.appendChild(heading);
    const allBooks = booksForLocation(location.id);
    const books = allBooks.filter(matchesFilter);
    if (!books.length) {
        elements.selectionPanel.append(createElement('p', '', state.filter === 'all' ? 'В этом месте книги пока не указаны.' : 'Нет книг, подходящих под выбранный фильтр.'));
        return;
    }
    const list = createElement('ul', 'map-book-list');
    books.forEach(book => {
        const row = createElement('li', 'map-book-row');
        row.append(createElement('b', '', book.title));
        row.append(createElement('span', '', book.author || 'Автор не указан'));
        const availability = book.available && Number(book.copies || 0) > 0 ? 'В наличии' : 'Выдана';
        row.append(createElement('small', '', `${availability} · ${Number(book.copies || 0)} экз.`));
        const link = createElement('a', 'map-book-link', 'Открыть карточку');
        link.href = `home.html?book=${encodeURIComponent(book.id)}`;
        row.appendChild(link);
        if (Number(book.id) === Number(state.targetBookId)) row.classList.add('target-book-row');
        list.appendChild(row);
    });
    elements.selectionPanel.appendChild(list);
}

function selectLocation(locationId, focus = false) {
    const object = objectForLocation(locationId);
    if (!object) return;
    selectObject(object, focus);
}

function selectObject(object, focus = false) {
    if (!object || (object.object_type !== 'storage' && !admin.editing)) return;
    state.selectedObjectId = Number(object.id);
    renderLocationList();
    renderSelectionPanel();
    updateSceneStyles();
    render2dFallback();
    admin.setSelectedObject(object);
    if (focus) focusCameraOn(object);
}

function focusTargetBook() {
    showLevel('room');
    if (!state.targetBook?.location_id) return;
    const object = objectForLocation(state.targetBook.location_id);
    if (object) selectObject(object, true);
}

function runSearch() {
    state.query = normalize(elements.search.value);
    state.matchingLocationIds.clear();
    const matchingBooks = [];
    if (state.query) {
        state.data.locations.forEach(location => {
            const locationBooks = booksForLocation(location.id).filter(book => {
                const matches = normalize(`${book.title} ${book.author}`).includes(state.query);
                if (matches) matchingBooks.push(book);
                return matches;
            });
            if (locationBooks.length || locationMatchesSearch(location)) state.matchingLocationIds.add(Number(location.id));
        });
        elements.searchResult.textContent = `${matchingBooks.length} книг`;
        const firstLocationId = state.matchingLocationIds.values().next().value;
        if (firstLocationId) {
            showLevel('room');
            selectLocation(firstLocationId, true);
        }
    } else {
        elements.searchResult.textContent = '';
    }
    renderLocationList();
    updateSceneStyles();
    render2dFallback();
}

function getCssColor(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

function geometryFor(object) {
    const THREE = state.three;
    const plane = object.object_type === 'floor' || object.object_type === 'aisle';
    const key = `${plane ? 'plane' : 'box'}:${object.width}:${object.height}:${object.depth}`;
    if (!state.geometryCache.has(key)) {
        state.geometryCache.set(key, plane
            ? new THREE.PlaneGeometry(Number(object.width), Number(object.depth))
            : new THREE.BoxGeometry(Number(object.width), Number(object.height), Number(object.depth)));
    }
    return state.geometryCache.get(key);
}

function materialKeyFor(object) {
    if (object.object_type !== 'storage') return object.object_type;
    const location = locationForObject(object);
    const available = booksForLocation(location?.id).some(book => book.available && Number(book.copies || 0) > 0);
    const filtered = location && (!locationMatchesFilter(location) || !locationMatchesSearch(location));
    if (Number(state.targetBook?.location_id) === Number(location?.id)) return 'storage-target';
    if (Number(state.selectedObjectId) === Number(object.id)) return 'storage-selected';
    if (filtered || (state.query && !state.matchingLocationIds.has(Number(location?.id)))) return 'storage-dim';
    return available ? 'storage-available' : 'storage-unavailable';
}

function materialFor(object) {
    const THREE = state.three;
    const key = materialKeyFor(object);
    if (state.materialCache.has(key)) return state.materialCache.get(key);
    const accent = getCssColor('--accent', '#4f8f70');
    const accentStrong = getCssColor('--accent-strong', accent);
    const surfaceMuted = getCssColor('--surface-muted', '#d7dfda');
    const muted = getCssColor('--muted', '#727b78');
    const materials = {
        floor: () => new THREE.MeshLambertMaterial({ color: surfaceMuted, side: THREE.DoubleSide }),
        wall: () => new THREE.MeshLambertMaterial({ color: muted, transparent: true, opacity: .7 }),
        entrance: () => new THREE.MeshLambertMaterial({ color: accentStrong }),
        aisle: () => new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: .25, side: THREE.DoubleSide }),
        'storage-available': () => new THREE.MeshLambertMaterial({ color: accent }),
        'storage-unavailable': () => new THREE.MeshLambertMaterial({ color: muted }),
        'storage-selected': () => new THREE.MeshLambertMaterial({ color: '#d99535', emissive: '#4b2807' }),
        'storage-target': () => new THREE.MeshLambertMaterial({ color: '#c54848', emissive: '#4a0808' }),
        'storage-dim': () => new THREE.MeshLambertMaterial({ color: muted, transparent: true, opacity: .26 })
    };
    const material = (materials[key] || materials.wall)();
    state.materialCache.set(key, material);
    return material;
}

function applyObjectTransform(object) {
    const mesh = state.meshes.get(Number(object.id));
    if (!mesh) return;
    mesh.geometry = geometryFor(object);
    mesh.position.set(Number(object.x), Number(object.y), Number(object.z));
    if (object.object_type === 'floor' || object.object_type === 'aisle') {
        mesh.rotation.set(-Math.PI / 2, 0, Number(object.rotation_y));
    } else {
        mesh.rotation.set(0, Number(object.rotation_y), 0);
    }
    mesh.userData.objectId = Number(object.id);
    requestRender();
}

function updateSceneStyles() {
    if (!state.scene) return;
    state.data.objects.forEach(object => {
        const mesh = state.meshes.get(Number(object.id));
        if (mesh) mesh.material = materialFor(object);
        const label = state.labels.get(Number(object.id));
        if (label) label.dataset.state = materialKeyFor(object).replace('storage-', '');
    });
    requestRender();
}

function clearSceneObjects() {
    state.meshes.forEach(mesh => state.scene?.remove(mesh));
    state.meshes.clear();
    state.labels.forEach(label => label.remove());
    state.labels.clear();
}

function rebuildSceneObjects() {
    if (!state.scene || !state.data) return;
    clearSceneObjects();
    state.data.objects.forEach(object => {
        const mesh = new state.three.Mesh(geometryFor(object), materialFor(object));
        applyMeshMetadata(mesh, object);
        state.scene.add(mesh);
        state.meshes.set(Number(object.id), mesh);
        applyObjectTransform(object);
        if (object.object_type === 'storage') {
            const label = createElement('span', 'map-object-label', object.label);
            label.dataset.state = materialKeyFor(object).replace('storage-', '');
            elements.labelLayer.appendChild(label);
            state.labels.set(Number(object.id), label);
        }
    });
    requestRender();
}

function applyMeshMetadata(mesh, object) {
    mesh.userData.objectId = Number(object.id);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
}

function updateLabels() {
    if (!state.camera || !state.three) return;
    const width = elements.sceneShell.clientWidth;
    const height = elements.sceneShell.clientHeight;
    state.labels.forEach((label, objectId) => {
        const mesh = state.meshes.get(objectId);
        if (!mesh) return;
        const point = mesh.position.clone();
        point.y += Number(state.data.objects.find(object => Number(object.id) === objectId)?.height || 1) / 2 + .16;
        point.project(state.camera);
        const visible = point.z > -1 && point.z < 1;
        label.hidden = !visible;
        if (visible) {
            label.style.left = `${(point.x * .5 + .5) * width}px`;
            label.style.top = `${(-point.y * .5 + .5) * height}px`;
        }
    });
}

function requestRender() {
    if (!state.renderer || state.renderRequested || state.disposed || document.hidden) return;
    state.renderRequested = true;
    requestAnimationFrame(() => {
        state.renderRequested = false;
        if (!state.renderer || state.disposed || document.hidden) return;
        state.renderer.render(state.scene, state.camera);
        updateLabels();
    });
}

function clampControls() {
    if (!state.controls) return;
    state.controls.target.x = Math.max(-6, Math.min(6, state.controls.target.x));
    state.controls.target.y = Math.max(0, Math.min(3, state.controls.target.y));
    state.controls.target.z = Math.max(-5, Math.min(5, state.controls.target.z));
}

function resizeScene() {
    if (!state.renderer || !state.camera) return;
    const width = Math.max(1, elements.sceneShell.clientWidth);
    const height = Math.max(1, elements.sceneShell.clientHeight);
    state.renderer.setSize(width, height, false);
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
    requestRender();
}

function resetCamera(top = false) {
    if (!state.camera || !state.controls) return;
    state.camera.position.set(top ? 0 : 10.5, top ? 13 : 9, top ? .01 : 11.5);
    state.controls.target.set(0, 0.5, 0);
    state.camera.lookAt(state.controls.target);
    state.controls.update();
    requestRender();
}

function tweenCamera(endPosition, endTarget) {
    if (!state.camera || !state.controls) return;
    if (reducedMotion.matches) {
        state.camera.position.copy(endPosition);
        state.controls.target.copy(endTarget);
        state.controls.update();
        requestRender();
        return;
    }
    const startPosition = state.camera.position.clone();
    const startTarget = state.controls.target.clone();
    const startedAt = performance.now();
    const duration = 360;
    function step(now) {
        if (state.disposed) return;
        const raw = Math.min(1, (now - startedAt) / duration);
        const t = 1 - Math.pow(1 - raw, 3);
        state.camera.position.lerpVectors(startPosition, endPosition, t);
        state.controls.target.lerpVectors(startTarget, endTarget, t);
        state.controls.update();
        requestRender();
        if (raw < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function focusCameraOn(object) {
    if (!state.camera || !state.controls || !state.three) return;
    const target = new state.three.Vector3(Number(object.x), Math.max(.5, Number(object.y)), Number(object.z));
    const end = target.clone().add(new state.three.Vector3(4.8, 3.8, 5.2));
    tweenCamera(end, target);
}

function zoomCamera(factor) {
    if (!state.camera || !state.controls) return;
    const offset = state.camera.position.clone().sub(state.controls.target).multiplyScalar(factor);
    const distance = Math.max(state.controls.minDistance, Math.min(state.controls.maxDistance, offset.length()));
    offset.setLength(distance);
    state.camera.position.copy(state.controls.target).add(offset);
    requestRender();
}

function handlePointerDown(event) {
    state.pointerStart = { x: event.clientX, y: event.clientY };
}

function handlePointerUp(event) {
    if (!state.pointerStart || !state.raycaster || !state.camera) return;
    const moved = Math.hypot(event.clientX - state.pointerStart.x, event.clientY - state.pointerStart.y);
    state.pointerStart = null;
    if (moved > 8) return;
    const rect = state.renderer.domElement.getBoundingClientRect();
    state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    state.raycaster.setFromCamera(state.pointer, state.camera);
    const selectableMeshes = Array.from(state.meshes.values()).filter(mesh => {
        const object = state.data.objects.find(item => Number(item.id) === Number(mesh.userData.objectId));
        if (admin.editing) return object && !['floor', 'aisle'].includes(object.object_type);
        return object?.object_type === 'storage';
    });
    const hit = state.raycaster.intersectObjects(selectableMeshes, false)[0];
    const object = hit && state.data.objects.find(item => Number(item.id) === Number(hit.object.userData.objectId));
    if (object) selectObject(object, true);
}

async function create3dScene() {
    try {
        const THREE = await import('three');
        const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
        state.three = THREE;
        state.OrbitControls = OrbitControls;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(getCssColor('--bg-soft', '#eef2ef'));
        const camera = new THREE.PerspectiveCamera(46, 1, .1, 80);
        const renderer = new THREE.WebGLRenderer({
            antialias: !coarsePointer.matches && window.innerWidth > 780,
            alpha: false,
            powerPreference: 'low-power'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 600 ? 1 : 1.5));
        renderer.shadowMap.enabled = false;
        renderer.domElement.tabIndex = 0;
        renderer.domElement.setAttribute('aria-label', 'Интерактивная 3D-схема кабинета 125. Используйте мышь, касания или список мест рядом.');
        elements.canvasHost.replaceChildren(renderer.domElement);

        const ambient = new THREE.HemisphereLight('#ffffff', '#66736d', 1.7);
        const directional = new THREE.DirectionalLight('#ffffff', .95);
        directional.position.set(5, 9, 7);
        scene.add(ambient, directional);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false;
        controls.enablePan = true;
        controls.minDistance = 4;
        controls.maxDistance = 26;
        controls.minPolarAngle = .12;
        controls.maxPolarAngle = Math.PI / 2.05;
        controls.screenSpacePanning = false;
        controls.addEventListener('change', () => { clampControls(); requestRender(); });

        state.scene = scene;
        state.camera = camera;
        state.renderer = renderer;
        state.controls = controls;
        state.raycaster = new THREE.Raycaster();
        state.pointer = new THREE.Vector2();
        state.webgl = true;
        state.resizeObserver = new ResizeObserver(resizeScene);
        state.resizeObserver.observe(elements.sceneShell);
        renderer.domElement.addEventListener('pointerdown', handlePointerDown);
        renderer.domElement.addEventListener('pointerup', handlePointerUp);
        rebuildSceneObjects();
        resetCamera(false);
        elements.loading.classList.add('hidden');
        elements.fallback.classList.add('hidden');
        state.themeObserver = new MutationObserver(() => {
            state.scene.background.set(getCssColor('--bg-soft', '#eef2ef'));
            state.materialCache.forEach(material => material.dispose());
            state.materialCache.clear();
            updateSceneStyles();
        });
        state.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-theme-mode'] });
    } catch (error) {
        console.warn('[LIBRARY MAP] WebGL unavailable, using SVG fallback:', error);
        state.webgl = false;
        elements.loading.classList.add('hidden');
        elements.canvasHost.classList.add('hidden');
        elements.labelLayer.classList.add('hidden');
        elements.fallback.classList.remove('hidden');
        render2dFallback();
    }
}

function svgElement(name, attributes = {}) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
}

function render2dFallback() {
    if (!state.data || !elements.fallback) return;
    elements.fallback.replaceChildren();
    const title = svgElement('title');
    title.textContent = 'Двухмерная навигационная схема кабинета 125';
    elements.fallback.appendChild(title);
    elements.fallback.appendChild(svgElement('rect', { x: 55, y: 45, width: 690, height: 420, rx: 18, class: 'fallback-floor' }));
    elements.fallback.appendChild(svgElement('rect', { x: 130, y: 240, width: 520, height: 75, rx: 12, class: 'fallback-aisle' }));
    const aisleText = svgElement('text', { x: 390, y: 285, 'text-anchor': 'middle' });
    aisleText.textContent = 'Основной проход';
    elements.fallback.appendChild(aisleText);
    state.data.objects.filter(object => object.object_type === 'storage').forEach(object => {
        const location = locationForObject(object);
        const x = 400 + Number(object.x) * 52 - Number(object.width) * 26;
        const y = 255 + Number(object.z) * 52 - Number(object.depth) * 26;
        const rect = svgElement('rect', {
            x, y, width: Math.max(70, Number(object.width) * 52), height: Math.max(56, Number(object.depth) * 52), rx: 12,
            class: `fallback-storage ${Number(state.selectedObjectId) === Number(object.id) ? 'selected' : ''} ${Number(state.targetBook?.location_id) === Number(location?.id) ? 'target' : ''}`,
            tabindex: 0, role: 'button', 'aria-label': object.label
        });
        rect.addEventListener('click', () => selectObject(object, false));
        rect.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectObject(object, false); }
        });
        const label = svgElement('text', { x: x + Math.max(70, Number(object.width) * 52) / 2, y: y + Math.max(56, Number(object.depth) * 52) / 2 + 6, 'text-anchor': 'middle' });
        label.textContent = `Место ${location?.place_code || '?'}`;
        elements.fallback.append(rect, label);
    });
    const entrance = svgElement('text', { x: 78, y: 405 });
    entrance.textContent = 'Вход →';
    elements.fallback.appendChild(entrance);
}

function handleAdminPreview(draft) {
    const index = state.data.objects.findIndex(object => Number(object.id) === Number(draft.id));
    if (index < 0) return;
    state.data.objects[index] = { ...draft };
    applyObjectTransform(draft);
    render2dFallback();
}

function handleAdminSaved(saved) {
    handleAdminPreview(saved);
    state.selectedObjectId = Number(saved.id);
    renderLocationList();
    renderSelectionPanel();
    updateSceneStyles();
}

async function handleAdminReset(payload) {
    state.selectedObjectId = null;
    applyPayload(payload);
    resetCamera(false);
}

function handleAdminSelect(objectId) {
    const object = state.data?.objects.find(item => Number(item.id) === Number(objectId));
    if (object) selectObject(object, true);
}

const admin = createLibraryMapAdmin({
    onPreview: handleAdminPreview,
    onSaved: handleAdminSaved,
    onReset: handleAdminReset,
    onSelectObject: handleAdminSelect
});

function bindUi() {
    document.querySelectorAll('[data-map-level]').forEach(button => button.addEventListener('click', () => showLevel(button.dataset.mapLevel)));
    document.querySelectorAll('[data-map-filter]').forEach(button => button.addEventListener('click', () => {
        state.filter = button.dataset.mapFilter;
        document.querySelectorAll('[data-map-filter]').forEach(item => {
            const active = item === button;
            item.classList.toggle('active', active);
            item.setAttribute('aria-pressed', String(active));
        });
        renderLocationList();
        renderSelectionPanel();
        updateSceneStyles();
    }));
    document.getElementById('enterRoomButton')?.addEventListener('click', () => showLevel('room'));
    document.getElementById('floorRoom125')?.addEventListener('click', () => showLevel('room'));
    document.getElementById('zoomInButton')?.addEventListener('click', () => zoomCamera(.82));
    document.getElementById('zoomOutButton')?.addEventListener('click', () => zoomCamera(1.22));
    document.getElementById('topViewButton')?.addEventListener('click', () => resetCamera(true));
    document.getElementById('resetCameraButton')?.addEventListener('click', () => resetCamera(false));
    document.getElementById('openLocationListButton')?.addEventListener('click', () => elements.locationList.querySelector('button:not([hidden])')?.focus());
    elements.search.addEventListener('input', runSearch);
    document.getElementById('mapMenuButton')?.addEventListener('click', event => {
        const nav = document.getElementById('mapNav');
        const active = nav.classList.toggle('active');
        event.currentTarget.setAttribute('aria-expanded', String(active));
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) requestRender(); });
    window.addEventListener('beforeunload', disposeScene, { once: true });
}

function disposeScene() {
    state.disposed = true;
    state.resizeObserver?.disconnect();
    state.themeObserver?.disconnect();
    state.controls?.dispose();
    state.renderer?.domElement.removeEventListener('pointerdown', handlePointerDown);
    state.renderer?.domElement.removeEventListener('pointerup', handlePointerUp);
    state.geometryCache.forEach(geometry => geometry.dispose());
    state.materialCache.forEach(material => material.dispose());
    state.renderer?.dispose();
    state.labels.forEach(label => label.remove());
    state.meshes.clear();
    state.labels.clear();
    admin.destroy();
}

async function init() {
    bindUi();
    try {
        const payload = await fetchMapData();
        applyPayload(payload);
        await create3dScene();
        if (state.targetBookId) focusTargetBook();
        else showLevel('floor');
    } catch (error) {
        console.error(error);
        showError(error.message || 'Не удалось открыть карту библиотеки.');
    }
}

init();
