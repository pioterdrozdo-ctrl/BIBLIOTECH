(function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const MAP_WIDTH = 1400;
    const MAP_HEIGHT = 980;
    const VIEWS = {
        overview: {
            title: 'Общий вид первого этажа',
            description: 'Реконструированная схема показывает взаимное расположение корпусов, переходов и прилегающих дорог.',
            focus: { x: 0, y: 0, width: 1400, height: 980 }
        },
        north: {
            title: 'Северное крыло',
            description: 'Три продольных корпуса и центральный учебный блок восстановлены по общему и северному видам.',
            focus: { x: 220, y: 35, width: 790, height: 610 }
        },
        south: {
            title: 'Южное крыло и главный вход',
            description: 'Горизонтальный корпус, входная группа, закруглённый переход и остановка собраны в единую схему.',
            focus: { x: 125, y: 650, width: 1190, height: 300 }
        },
        room125: {
            title: 'Крыло с кабинетом 125',
            description: 'Кабинет 125 находится в восточном продольном крыле; помещение выделено цветом текущей темы опасности.',
            focus: { x: 995, y: 525, width: 390, height: 330 }
        }
    };

    const viewport = document.getElementById('exactFloorViewport');
    const plan = document.getElementById('exactFloorPlan');
    const svg = document.getElementById('semanticFloorSvg');
    const zoomValue = document.getElementById('exactFloorZoomValue');
    if (!viewport || !plan || !svg) return;

    const viewButtons = [...document.querySelectorAll('[data-floor-view]')];
    const viewTitle = document.getElementById('exactFloorViewTitle');
    const viewDescription = document.getElementById('exactFloorViewDescription');
    const viewCounter = document.getElementById('exactFloorViewCounter');
    let scale = 1;
    let activeView = 'overview';
    let dragState = null;

    function svgElement(name, attributes = {}, text = '') {
        const element = document.createElementNS(SVG_NS, name);
        Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
        if (text) element.textContent = text;
        return element;
    }

    function append(parent, name, attributes = {}, text = '') {
        const element = svgElement(name, attributes, text);
        parent.appendChild(element);
        return element;
    }

    function drawRoom(parent, { x, y, width, height, label, target = false }) {
        const group = append(parent, 'g', {
            class: `semantic-room${target ? ' semantic-room--target' : ''}`,
            'data-room': label
        });
        append(group, 'rect', { x, y, width, height, rx: 2, class: 'semantic-room-shape' });
        if (width >= 24 && height >= 20) {
            append(group, 'text', {
                x: x + width / 2,
                y: y + height / 2 + 1,
                class: 'semantic-room-number'
            }, label);
        }
        return group;
    }

    function drawStair(parent, x, y, width, height) {
        const group = append(parent, 'g', { class: 'semantic-stair', 'aria-label': 'Лестница' });
        const count = 6;
        for (let index = 1; index < count; index += 1) {
            const lineY = y + (height / count) * index;
            append(group, 'line', { x1: x + 4, y1: lineY, x2: x + width - 4, y2: lineY });
        }
        return group;
    }

    function drawEntrance(parent, x, y, direction = 'down') {
        const points = direction === 'down'
            ? `${x - 9},${y - 5} ${x + 9},${y - 5} ${x},${y + 9}`
            : `${x - 5},${y - 9} ${x - 5},${y + 9} ${x + 9},${y}`;
        append(parent, 'polygon', { points, class: 'semantic-entrance' });
    }

    function drawVerticalWing(parent, { id, label, x, y, width, height, leftLabels, rightLabels }) {
        const group = append(parent, 'g', { id, 'data-building': label });
        append(group, 'rect', { x, y, width, height, rx: 4, class: 'semantic-building-shell' });
        const corridorWidth = Math.max(28, width * 0.2);
        const corridorX = x + (width - corridorWidth) / 2;
        append(group, 'rect', {
            x: corridorX,
            y: y + 7,
            width: corridorWidth,
            height: height - 14,
            class: 'semantic-corridor'
        });
        const roomMargin = 8;
        const leftWidth = corridorX - x - roomMargin;
        const rightX = corridorX + corridorWidth;
        const rightWidth = x + width - rightX - roomMargin;
        const leftHeight = (height - 16) / leftLabels.length;
        const rightHeight = (height - 16) / rightLabels.length;
        leftLabels.forEach((roomLabel, index) => drawRoom(group, {
            x: x + roomMargin,
            y: y + 8 + leftHeight * index,
            width: leftWidth,
            height: leftHeight,
            label: roomLabel
        }));
        rightLabels.forEach((roomLabel, index) => drawRoom(group, {
            x: rightX,
            y: y + 8 + rightHeight * index,
            width: rightWidth,
            height: rightHeight,
            label: roomLabel
        }));
        drawEntrance(group, x + width / 2, y + height + 2);
        append(group, 'text', {
            x: x + width / 2,
            y: y - 14,
            class: 'semantic-building-label'
        }, label);
        return group;
    }

    function drawBus(parent, x, y) {
        const group = append(parent, 'g', { transform: `translate(${x} ${y})`, 'aria-label': 'Остановка' });
        append(group, 'rect', { x: -18, y: -13, width: 36, height: 24, rx: 5, class: 'semantic-bus' });
        append(group, 'rect', { x: -12, y: -8, width: 10, height: 7, rx: 1, class: 'semantic-bus-detail' });
        append(group, 'rect', { x: 2, y: -8, width: 10, height: 7, rx: 1, class: 'semantic-bus-detail' });
        append(group, 'circle', { cx: -10, cy: 12, r: 4, class: 'semantic-bus-detail' });
        append(group, 'circle', { cx: 10, cy: 12, r: 4, class: 'semantic-bus-detail' });
    }

    function renderSemanticMap() {
        svg.replaceChildren();
        append(svg, 'title', { id: 'semanticFloorTitle' }, 'Реконструированный план первого этажа Тушинского комплекса');
        append(svg, 'desc', { id: 'semanticFloorDescription' }, 'Семантическая SVG-карта корпусов, комнат, коридоров, дорог и кабинета 125, восстановленная по предоставленным изображениям.');
        append(svg, 'rect', { width: MAP_WIDTH, height: MAP_HEIGHT, class: 'semantic-map-ground' });

        const landscape = append(svg, 'g', { 'aria-label': 'Территория комплекса' });
        append(landscape, 'path', {
            d: 'M60 710 C230 610 390 615 530 685 C660 750 795 760 910 700 C1040 630 1190 620 1360 700 L1360 940 L60 940 Z',
            class: 'semantic-map-lawn'
        });
        append(landscape, 'path', { d: 'M45 720 C260 585 430 600 575 700 C720 800 900 770 1010 655 C1110 555 1250 585 1365 680', class: 'semantic-map-road semantic-map-road--main' });
        append(landscape, 'path', { d: 'M120 55 V675 M375 25 V680 M735 20 V665 M980 30 V690 M1330 20 V900', class: 'semantic-map-road semantic-map-road--service' });
        append(landscape, 'path', { d: 'M85 650 H1325 M80 920 H1340', class: 'semantic-map-road semantic-map-road--service' });
        append(landscape, 'text', { x: 1080, y: 950, class: 'semantic-map-label' }, 'ул. Героев Панфиловцев');
        drawBus(landscape, 620, 690);
        drawBus(landscape, 1040, 890);

        const buildings = append(svg, 'g', { 'aria-label': 'Корпуса первого этажа' });
        drawVerticalWing(buildings, {
            id: 'west-wing-upper',
            label: 'ЗАПАДНОЕ КРЫЛО',
            x: 55,
            y: 255,
            width: 150,
            height: 175,
            leftLabels: ['158', '157', '156', '155'],
            rightLabels: ['138', '139', '140', '141']
        });
        drawVerticalWing(buildings, {
            id: 'west-wing-center',
            label: 'ЗАПАДНЫЙ БЛОК 2',
            x: 55,
            y: 455,
            width: 150,
            height: 175,
            leftLabels: ['129', '130', '131', '132'],
            rightLabels: ['142', '143', '144', '145']
        });
        drawVerticalWing(buildings, {
            id: 'west-wing-lower',
            label: 'ЗАПАДНЫЙ БЛОК 3',
            x: 55,
            y: 655,
            width: 150,
            height: 175,
            leftLabels: ['128', '127', '126', '124'],
            rightLabels: ['146', '147', '150', '151']
        });
        append(buildings, 'rect', { x: 110, y: 430, width: 38, height: 25, class: 'semantic-corridor' });
        append(buildings, 'rect', { x: 110, y: 630, width: 38, height: 25, class: 'semantic-corridor' });
        drawVerticalWing(buildings, {
            id: 'north-west-wing',
            label: 'СЕВЕРО-ЗАПАДНОЕ КРЫЛО',
            x: 250,
            y: 70,
            width: 190,
            height: 520,
            leftLabels: ['135', '134', '133', '132', '124', '123', '122', '121', '120', '119', '118', '117', '116'],
            rightLabels: ['138', '139', '140', '141', '142', '143', '144', '145', '146', '147', '150', '151', '154']
        });
        drawVerticalWing(buildings, {
            id: 'north-center-wing',
            label: 'СЕВЕРНОЕ КРЫЛО',
            x: 775,
            y: 95,
            width: 185,
            height: 515,
            leftLabels: ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '112'],
            rightLabels: ['114', '115', '116', '117', '118', '119', '120', '121', '122', '123', '124', '126']
        });

        const center = append(buildings, 'g', { id: 'central-block', 'data-building': 'Центральный блок', transform: 'translate(50 0)' });
        append(center, 'rect', { x: 420, y: 230, width: 265, height: 285, rx: 4, class: 'semantic-building-shell' });
        append(center, 'rect', { x: 540, y: 238, width: 34, height: 269, class: 'semantic-corridor' });
        append(center, 'rect', { x: 428, y: 365, width: 249, height: 30, class: 'semantic-corridor' });
        drawRoom(center, { x: 430, y: 240, width: 105, height: 120, label: '2' });
        drawRoom(center, { x: 579, y: 240, width: 96, height: 120, label: '3' });
        drawRoom(center, { x: 430, y: 400, width: 105, height: 105, label: '1' });
        drawRoom(center, { x: 579, y: 400, width: 96, height: 105, label: '4' });
        drawRoom(center, { x: 430, y: 365, width: 105, height: 30, label: '5' });
        drawRoom(center, { x: 579, y: 365, width: 96, height: 30, label: '6' });
        drawStair(center, 535, 245, 44, 58);
        drawStair(center, 535, 438, 44, 58);
        drawEntrance(center, 500, 518);
        drawEntrance(center, 610, 518);
        append(center, 'text', { x: 552, y: 210, class: 'semantic-building-label' }, 'ЦЕНТРАЛЬНЫЙ БЛОК');

        const south = append(buildings, 'g', { id: 'south-wing', 'data-building': 'Южное крыло' });
        append(south, 'path', {
            d: 'M170 725 H770 L860 655 H1020 L1085 710 H1170 Q1270 710 1310 785 Q1345 850 1270 905 L1160 950 H790 L710 915 H170 Z',
            class: 'semantic-building-shell'
        });
        append(south, 'path', { d: 'M205 790 H790 L880 720 H1020 L1090 775 H1190 Q1240 775 1260 815 Q1270 845 1230 865 L1140 900 H800 L710 865 H205 Z', class: 'semantic-corridor' });
        const topSouthLabels = ['146', '147', '147а', '1', '2', '3', '11', '4', '5', '6', '154'];
        topSouthLabels.forEach((label, index) => drawRoom(south, { x: 205 + index * 52, y: 735, width: 52, height: 55, label }));
        const bottomSouthLabels = ['129', '128', '155', '130', '151', '132', '133', '134', '149', '150', '151'];
        bottomSouthLabels.forEach((label, index) => drawRoom(south, { x: 205 + index * 54, y: 860, width: 54, height: 48, label }));
        drawRoom(south, { x: 205, y: 795, width: 110, height: 62, label: '158' });
        drawRoom(south, { x: 315, y: 795, width: 100, height: 62, label: '157' });
        drawRoom(south, { x: 415, y: 795, width: 100, height: 62, label: '138' });
        drawRoom(south, { x: 515, y: 795, width: 90, height: 62, label: '144' });
        drawStair(south, 165, 782, 40, 70);
        drawEntrance(south, 1010, 712, 'right');
        append(south, 'text', { x: 520, y: 705, class: 'semantic-building-label' }, 'ЮЖНОЕ КРЫЛО');

        const east = append(buildings, 'g', { id: 'room-125-wing', 'data-building': 'Восточное крыло' });
        const eastTop = 145;
        append(east, 'rect', { x: 1025, y: eastTop, width: 275, height: 755, rx: 5, class: 'semantic-building-shell' });
        append(east, 'rect', { x: 1115, y: eastTop + 10, width: 42, height: 735, class: 'semantic-corridor' });
        const leftRooms = [
            ['192', 34], ['145', 30], ['116', 30], ['115', 45], ['114', 35], ['113', 62], ['112', 58], ['111', 48], ['Л', 28], ['110', 30], ['109', 30], ['108', 30], ['107', 30], ['106', 36], ['105', 34], ['104', 34], ['101', 36]
        ];
        let leftY = eastTop + 10;
        leftRooms.forEach(([label, height]) => {
            if (label === 'Л') drawStair(east, 1035, leftY, 80, height);
            else drawRoom(east, { x: 1035, y: leftY, width: 80, height, label });
            leftY += height;
        });
        const rightRooms = [
            ['148', 36], ['Л', 32], ['1', 26], ['117', 80], ['118', 70], ['119', 42, 154], ['120', 40, 154], ['121', 26], ['122', 26], ['123', 65, 154], ['124', 38], ['125', 70, 154, true], ['126', 28], ['127', 28], ['193', 28], ['1', 30], ['Л', 30]
        ];
        let rightY = eastTop + 10;
        rightRooms.forEach(([label, height, width = 133, target = false]) => {
            if (label === 'Л') drawStair(east, 1157, rightY, width, height);
            else drawRoom(east, { x: 1157, y: rightY, width, height, label, target });
            rightY += height;
        });
        drawEntrance(east, 1136, 905);
        append(east, 'text', { x: 1162, y: eastTop - 20, class: 'semantic-building-label' }, 'ВОСТОЧНОЕ КРЫЛО');

        const targetRoom = svg.querySelector('.semantic-room--target[data-room="125"]');
        targetRoom?.setAttribute('aria-label', 'Кабинет 125 — физический фонд BIBLIOTECH');
    }

    const clamp = value => Math.min(3.2, Math.max(0.24, value));

    function updatePlanSize() {
        plan.style.width = `${Math.round(MAP_WIDTH * scale)}px`;
        plan.style.height = `${Math.round(MAP_HEIGHT * scale)}px`;
        if (zoomValue) zoomValue.textContent = `${Math.round(scale * 100)}%`;
    }

    function setScale(nextScale, centerX, centerY) {
        const oldWidth = MAP_WIDTH * scale;
        const oldHeight = MAP_HEIGHT * scale;
        const focusX = centerX ?? viewport.scrollLeft + viewport.clientWidth / 2;
        const focusY = centerY ?? viewport.scrollTop + viewport.clientHeight / 2;
        const relativeX = oldWidth ? focusX / oldWidth : 0.5;
        const relativeY = oldHeight ? focusY / oldHeight : 0.5;
        scale = clamp(nextScale);
        updatePlanSize();
        requestAnimationFrame(() => {
            viewport.scrollLeft = relativeX * MAP_WIDTH * scale - viewport.clientWidth / 2;
            viewport.scrollTop = relativeY * MAP_HEIGHT * scale - viewport.clientHeight / 2;
        });
    }

    function focusRegion(region) {
        const horizontal = Math.max(1, viewport.clientWidth - 28) / region.width;
        const vertical = Math.max(1, viewport.clientHeight - 28) / region.height;
        scale = clamp(Math.min(horizontal, vertical));
        updatePlanSize();
        requestAnimationFrame(() => {
            viewport.scrollTo({
                left: (region.x + region.width / 2) * scale - viewport.clientWidth / 2,
                top: (region.y + region.height / 2) * scale - viewport.clientHeight / 2,
                behavior: 'smooth'
            });
        });
    }

    function selectView(viewId, { focus = true, moveFocus = true } = {}) {
        if (!VIEWS[viewId]) return;
        activeView = viewId;
        plan.dataset.activeView = viewId;
        viewButtons.forEach(button => {
            const selected = button.dataset.floorView === viewId;
            button.classList.toggle('is-active', selected);
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
        });
        if (viewTitle) viewTitle.textContent = VIEWS[viewId].title;
        if (viewDescription) viewDescription.textContent = VIEWS[viewId].description;
        if (viewCounter) viewCounter.textContent = `Область ${Object.keys(VIEWS).indexOf(viewId) + 1} из ${Object.keys(VIEWS).length}`;
        if (focus) focusRegion(VIEWS[viewId].focus);
        if (moveFocus) viewport.focus({ preventScroll: true });
    }

    function focusRoom125() {
        selectView('room125', { moveFocus: false });
        const marker = document.getElementById('room125ExactMarker');
        marker?.classList.remove('is-active');
        requestAnimationFrame(() => marker?.classList.add('is-active'));
    }

    renderSemanticMap();
    document.getElementById('exactFloorZoomIn')?.addEventListener('click', () => setScale(scale * 1.25));
    document.getElementById('exactFloorZoomOut')?.addEventListener('click', () => setScale(scale / 1.25));
    document.getElementById('exactFloorFit')?.addEventListener('click', () => selectView('overview'));
    document.getElementById('exactFloorRoom125')?.addEventListener('click', focusRoom125);
    document.getElementById('room125ExactMarker')?.addEventListener('click', focusRoom125);
    viewButtons.forEach((button, index) => {
        button.addEventListener('click', () => selectView(button.dataset.floorView));
        button.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const nextIndex = event.key === 'Home'
                ? 0
                : event.key === 'End'
                    ? viewButtons.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + viewButtons.length) % viewButtons.length;
            viewButtons[nextIndex].focus();
            selectView(viewButtons[nextIndex].dataset.floorView, { moveFocus: false });
        });
    });

    viewport.addEventListener('wheel', event => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const bounds = viewport.getBoundingClientRect();
        setScale(
            scale * (event.deltaY > 0 ? 0.88 : 1.12),
            viewport.scrollLeft + event.clientX - bounds.left,
            viewport.scrollTop + event.clientY - bounds.top
        );
    }, { passive: false });

    viewport.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('button')) return;
        dragState = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: viewport.scrollLeft,
            top: viewport.scrollTop
        };
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add('is-dragging');
    });
    viewport.addEventListener('pointermove', event => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        viewport.scrollLeft = dragState.left - (event.clientX - dragState.x);
        viewport.scrollTop = dragState.top - (event.clientY - dragState.y);
    });
    const stopDragging = event => {
        if (!dragState || (event && dragState.pointerId !== event.pointerId)) return;
        dragState = null;
        viewport.classList.remove('is-dragging');
    };
    viewport.addEventListener('pointerup', stopDragging);
    viewport.addEventListener('pointercancel', stopDragging);
    viewport.addEventListener('keydown', event => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            event.preventDefault();
            const distance = 70;
            viewport.scrollBy({
                left: event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0,
                top: event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0,
                behavior: 'smooth'
            });
            return;
        }
        if (!['+', '=', '-', '0'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === '0') selectView('overview', { moveFocus: false });
        else setScale(scale * (event.key === '-' ? 0.8 : 1.25));
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => focusRegion(VIEWS[activeView].focus), 120);
    });

    window.BibliotechExactFloorMap = {
        selectView,
        focusRoom125,
        fitWholeFloor: () => selectView('overview'),
        getState: () => ({ activeView, scale, semantic: true })
    };
    selectView('overview', { moveFocus: false });

    const requestedBookId = new URLSearchParams(window.location.search).get('book');
    if (/^\d+$/.test(requestedBookId || '')) {
        const message = document.getElementById('targetBookMessage');
        const storageLink = document.getElementById('room125StorageLink');
        if (message) {
            message.hidden = false;
            message.textContent = `Книга №${requestedBookId} находится в фонде кабинета 125. Точное место хранения указано в её карточке.`;
        }
        if (storageLink) {
            storageLink.href = `map-lite.html?book=${encodeURIComponent(requestedBookId)}`;
            storageLink.textContent = 'Показать точное место книги →';
        }
        window.setTimeout(focusRoom125, 0);
    }
})();
