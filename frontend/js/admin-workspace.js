'use strict';

(() => {
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
        if (shouldScroll) {
            const target = sections.find(section => section.dataset.adminSection === selected);
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function openModal(id, opener) {
        const modal = document.getElementById(id);
        if (!modal?.classList.contains('admin-workspace-modal')) return;
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
