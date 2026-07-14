'use strict';

(() => {
    // На админской странице перевод пользовательского содержимого создаёт лишнюю
    // нагрузку: таблицы постоянно меняются, а переводчик повторно обходит DOM.
    // Перевод самого интерфейса остаётся в interface-language.js.
    document.querySelector('script[src*="content-translation.js"]')?.remove();

    const originalFetch = window.fetch.bind(window);
    const pendingRequests = new Map();
    const releasedAreas = new Set();
    const sharedGets = new Map();

    function requestUrl(input) {
        try {
            const raw = typeof input === 'string' ? input : input?.url;
            return new URL(raw, window.location.href);
        } catch {
            return null;
        }
    }

    function requestMethod(input, init = {}) {
        return String(init.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
    }

    function gatedArea(url, method) {
        if (method !== 'GET' || !url || url.origin !== window.location.origin) return null;
        if (url.pathname === '/api/auth/users') return 'users';
        if (url.pathname === '/api/rentals') return 'rentals';
        if (url.pathname === '/api/inventory') return 'inventory';
        return null;
    }

    function releaseArea(area) {
        if (!area || releasedAreas.has(area)) return;
        releasedAreas.add(area);
        const queue = pendingRequests.get(area) || [];
        pendingRequests.delete(area);
        queue.forEach(start => start());
    }

    function delayedFetch(area, input, init) {
        return new Promise((resolve, reject) => {
            const start = () => originalFetch(input, init).then(resolve, reject);
            const queue = pendingRequests.get(area) || [];
            queue.push(start);
            pendingRequests.set(area, queue);
        });
    }

    function sharedGet(key, input, init) {
        const active = sharedGets.get(key);
        if (active) return active.then(response => response.clone());

        const request = originalFetch(input, init)
            .then(response => {
                window.setTimeout(() => sharedGets.delete(key), 250);
                return response;
            })
            .catch(error => {
                sharedGets.delete(key);
                throw error;
            });
        sharedGets.set(key, request);
        return request.then(response => response.clone());
    }

    window.fetch = function bibliotechAdminFetch(input, init = {}) {
        const url = requestUrl(input);
        const method = requestMethod(input, init);
        const area = gatedArea(url, method);
        if (area && !releasedAreas.has(area)) return delayedFetch(area, input, init);

        if (method === 'GET' && url?.origin === window.location.origin && url.pathname === '/api/storage-locations') {
            return sharedGet(url.href, input, init);
        }
        return originalFetch(input, init);
    };

    const sectionButtons = [...document.querySelectorAll('[data-admin-section-target]')];
    const sections = [...document.querySelectorAll('[data-admin-section]')];
    const modals = [...document.querySelectorAll('.admin-workspace-modal')];
    const sectionNames = new Set(sections.map(section => section.dataset.adminSection));
    let returnFocus = null;

    function rememberSection(name) {
        try { sessionStorage.setItem('bibliotech-admin-section', name); } catch { /* Storage can be unavailable. */ }
    }

    function showSection(name, shouldScroll = false) {
        const selected = sectionNames.has(name) ? name : 'overview';
        sections.forEach(section => { section.hidden = section.dataset.adminSection !== selected; });
        sectionButtons.forEach(button => {
            const active = button.dataset.adminSectionTarget === selected;
            button.classList.toggle('is-active', active && button.closest('.admin-section-nav'));
            if (button.closest('.admin-section-nav')) button.setAttribute('aria-selected', String(active));
        });
        rememberSection(selected);
        releaseArea(selected);
        window.dispatchEvent(new CustomEvent('bibliotech:adminsectionchange', { detail: { section: selected } }));
        if (shouldScroll) {
            const target = sections.find(section => section.dataset.adminSection === selected);
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function openModal(id, opener) {
        const modal = document.getElementById(id);
        if (!modal?.classList.contains('admin-workspace-modal')) return;
        if (id === 'inventoryWorkspaceModal') releaseArea('inventory');
        returnFocus = opener || document.activeElement;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('admin-workspace-locked');
        requestAnimationFrame(() => modal.querySelector('[data-admin-close-modal]')?.focus());
    }

    function closeModal(modal) {
        if (!modal?.classList.contains('is-open')) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        if (!modals.some(item => item.classList.contains('is-open'))) document.body.classList.remove('admin-workspace-locked');
        const focusTarget = returnFocus;
        returnFocus = null;
        focusTarget?.focus?.();
    }

    sectionButtons.forEach(button => button.addEventListener('click', () => {
        showSection(button.dataset.adminSectionTarget, !button.closest('.admin-section-nav'));
    }));

    document.querySelectorAll('[data-admin-open-modal]').forEach(button => {
        button.addEventListener('click', () => openModal(button.dataset.adminOpenModal, button));
    });

    modals.forEach(modal => {
        modal.querySelectorAll('[data-admin-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(modal)));
        modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal); });
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (document.getElementById('inventoryCameraModal')?.classList.contains('active')) return;
        closeModal(modals.find(modal => modal.classList.contains('is-open')));
    });

    let initialSection = 'overview';
    try { initialSection = sessionStorage.getItem('bibliotech-admin-section') || initialSection; } catch { /* Use overview. */ }
    showSection(initialSection);
})();
