function readSession() {
    try { return JSON.parse(localStorage.getItem('bibliotech_current_user') || 'null'); }
    catch (error) { return null; }
}

async function adminRequest(path, options = {}) {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/library-map${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {})
        }
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'Не удалось сохранить схему');
    return payload;
}

export function createLibraryMapAdmin({ onPreview, onSaved, onReset, onSelectObject }) {
    const panel = document.getElementById('mapAdminPanel');
    const toggleButton = document.getElementById('toggleMapEditButton');
    const form = document.getElementById('mapObjectForm');
    const hint = document.getElementById('mapEditHint');
    const status = document.getElementById('mapAdminStatus');
    const cancelButton = document.getElementById('cancelMapEditButton');
    const resetButton = document.getElementById('resetRoomMapButton');
    const objectSelect = document.getElementById('mapAdminObjectSelect');
    const inputs = Array.from(form?.querySelectorAll('[data-map-field]') || []);
    const isAdmin = readSession()?.role === 'admin';
    let editing = false;
    let selected = null;
    let original = null;

    if (!isAdmin || !panel || !form) return { setObjects() {}, setSelectedObject() {}, destroy() {}, get editing() { return false; } };
    panel.classList.remove('hidden');

    function setStatus(message, isError = false) {
        status.textContent = message || '';
        status.style.color = isError ? '#c54848' : '';
    }

    function fillForm(object) {
        inputs.forEach(input => { input.value = object ? Number(object[input.dataset.mapField]) : ''; });
        inputs.forEach(input => { input.disabled = !object; });
        hint.textContent = object ? `Объект: ${object.label} (${object.code})` : 'Выберите объект на схеме или в списке.';
    }

    function setSelectedObject(object) {
        selected = object || null;
        original = object ? { ...object } : null;
        if (objectSelect) objectSelect.value = object ? String(object.id) : '';
        if (editing) fillForm(selected);
    }

    function setObjects(objects = []) {
        if (!objectSelect) return;
        const currentId = selected?.id ? String(selected.id) : '';
        objectSelect.replaceChildren(new Option('Выберите объект', ''));
        objects.forEach(object => objectSelect.appendChild(new Option(`${object.label} (${object.code})`, String(object.id))));
        objectSelect.value = currentId;
    }

    function toggleEditing(force) {
        editing = typeof force === 'boolean' ? force : !editing;
        toggleButton.setAttribute('aria-expanded', String(editing));
        toggleButton.textContent = editing ? 'Закрыть редактор' : 'Редактировать расположение';
        form.classList.toggle('hidden', !editing);
        fillForm(selected);
        setStatus('');
    }

    function readDraft() {
        if (!selected) return null;
        const draft = { ...selected };
        inputs.forEach(input => { draft[input.dataset.mapField] = Number(input.value); });
        return draft;
    }

    function previewDraft() {
        const draft = readDraft();
        if (!draft || inputs.some(input => !input.checkValidity())) return;
        selected = draft;
        onPreview?.(draft);
    }

    toggleButton.addEventListener('click', () => toggleEditing());
    objectSelect?.addEventListener('change', () => {
        const id = Number(objectSelect.value);
        if (Number.isSafeInteger(id) && id > 0) onSelectObject?.(id);
    });
    inputs.forEach(input => input.addEventListener('input', previewDraft));
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const draft = readDraft();
        if (!draft || !form.reportValidity()) return;
        setStatus('Сохраняем…');
        try {
            const saved = await adminRequest(`/objects/${encodeURIComponent(draft.id)}`, { method: 'PUT', body: JSON.stringify(draft) });
            selected = saved;
            original = { ...saved };
            fillForm(saved);
            onSaved?.(saved);
            setStatus('Изменения сохранены.');
        } catch (error) { setStatus(error.message, true); }
    });
    cancelButton.addEventListener('click', () => {
        if (!original) return;
        selected = { ...original };
        fillForm(selected);
        onPreview?.(selected);
        setStatus('Несохранённые изменения отменены.');
    });
    resetButton.addEventListener('click', async () => {
        if (!window.confirm('Сбросить кабинет 125 к начальной навигационной схеме?')) return;
        setStatus('Сбрасываем схему…');
        try {
            const data = await adminRequest('/reset-room-125', { method: 'POST', body: '{}' });
            selected = null;
            original = null;
            fillForm(null);
            await onReset?.(data);
            setStatus('Начальная схема восстановлена.');
        } catch (error) { setStatus(error.message, true); }
    });

    return { setObjects, setSelectedObject, destroy() {}, get editing() { return editing; } };
}
