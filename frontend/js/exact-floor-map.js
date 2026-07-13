(function () {
    'use strict';

    const MAP_WIDTH = 691;
    const MAP_HEIGHT = 1103;
    const viewport = document.getElementById('exactFloorViewport');
    const plan = document.getElementById('exactFloorPlan');
    const zoomValue = document.getElementById('exactFloorZoomValue');

    if (!viewport || !plan) return;

    let scale = 1;
    const clamp = value => Math.min(3.2, Math.max(0.22, value));

    function setScale(nextScale, centerX, centerY) {
        const oldWidth = MAP_WIDTH * scale;
        const oldHeight = MAP_HEIGHT * scale;
        const focusX = centerX ?? viewport.scrollLeft + viewport.clientWidth / 2;
        const focusY = centerY ?? viewport.scrollTop + viewport.clientHeight / 2;
        const relativeX = oldWidth ? focusX / oldWidth : 0.5;
        const relativeY = oldHeight ? focusY / oldHeight : 0.5;

        scale = clamp(nextScale);
        plan.style.width = `${Math.round(MAP_WIDTH * scale)}px`;
        plan.style.height = `${Math.round(MAP_HEIGHT * scale)}px`;

        requestAnimationFrame(() => {
            viewport.scrollLeft = relativeX * MAP_WIDTH * scale - viewport.clientWidth / 2;
            viewport.scrollTop = relativeY * MAP_HEIGHT * scale - viewport.clientHeight / 2;
        });

        if (zoomValue) zoomValue.textContent = `${Math.round(scale * 100)}%`;
    }

    function fitWholeFloor() {
        const horizontal = Math.max(1, viewport.clientWidth - 18) / MAP_WIDTH;
        const vertical = Math.max(1, viewport.clientHeight - 18) / MAP_HEIGHT;
        scale = clamp(Math.min(horizontal, vertical));
        plan.style.width = `${Math.round(MAP_WIDTH * scale)}px`;
        plan.style.height = `${Math.round(MAP_HEIGHT * scale)}px`;
        if (zoomValue) zoomValue.textContent = `${Math.round(scale * 100)}%`;
        requestAnimationFrame(() => {
            viewport.scrollLeft = Math.max(0, (plan.offsetWidth - viewport.clientWidth) / 2);
            viewport.scrollTop = Math.max(0, (plan.offsetHeight - viewport.clientHeight) / 2);
        });
    }

    function focusRoom125() {
        const requiredScale = Math.max(scale, Math.min(2.2, viewport.clientWidth / 330));
        scale = clamp(requiredScale);
        plan.style.width = `${Math.round(MAP_WIDTH * scale)}px`;
        plan.style.height = `${Math.round(MAP_HEIGHT * scale)}px`;
        if (zoomValue) zoomValue.textContent = `${Math.round(scale * 100)}%`;

        requestAnimationFrame(() => {
            const roomCenterX = 638 / MAP_WIDTH;
            const roomCenterY = 575 / MAP_HEIGHT;
            viewport.scrollTo({
                left: roomCenterX * plan.offsetWidth - viewport.clientWidth / 2,
                top: roomCenterY * plan.offsetHeight - viewport.clientHeight / 2,
                behavior: 'smooth'
            });
            document.getElementById('room125ExactMarker')?.classList.add('is-active');
            window.setTimeout(() => document.getElementById('room125ExactMarker')?.classList.remove('is-active'), 900);
        });
    }

    document.getElementById('exactFloorZoomIn')?.addEventListener('click', () => setScale(scale * 1.25));
    document.getElementById('exactFloorZoomOut')?.addEventListener('click', () => setScale(scale / 1.25));
    document.getElementById('exactFloorFit')?.addEventListener('click', fitWholeFloor);
    document.getElementById('exactFloorRoom125')?.addEventListener('click', focusRoom125);
    document.getElementById('room125ExactMarker')?.addEventListener('click', focusRoom125);

    viewport.addEventListener('wheel', event => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        setScale(
            scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12),
            viewport.scrollLeft + event.clientX - rect.left,
            viewport.scrollTop + event.clientY - rect.top
        );
    }, { passive: false });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(fitWholeFloor, 120);
    });

    fitWholeFloor();
})();
