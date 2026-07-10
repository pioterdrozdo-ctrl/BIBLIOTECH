(function () {
    'use strict';

    const SESSION_KEY = 'bibliotech_current_user';
    const CUSTOMIZATION_PREFIX = 'bibliotech_profile_customization_';
    const MAX_FILE_SIZE = 8 * 1024 * 1024;
    const MAX_BIO_LENGTH = 160;

    let pendingBanner = '';
    let pendingJob = null;
    let generation = 0;

    function getSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
        catch { return null; }
    }

    function getUserKey() {
        const session = getSession();
        return String(session?.username || (session?.guest ? 'guest' : 'user')).trim().toLowerCase();
    }

    function getCustomizationKey() {
        return CUSTOMIZATION_PREFIX + getUserKey();
    }

    function readCustomization() {
        try { return JSON.parse(localStorage.getItem(getCustomizationKey()) || '{}'); }
        catch { return {}; }
    }

    function notify(message, type = 'info') {
        if (typeof window.notify === 'function') window.notify(message, type);
        else console[type === 'error' ? 'error' : 'log'](message);
    }

    function injectStyleFix() {
        if (document.getElementById('profileBannerSaveFixStyles')) return;
        const style = document.createElement('style');
        style.id = 'profileBannerSaveFixStyles';
        style.textContent = `
            #profileModal .profile-modal-top::before {
                background: var(--profile-banner-background,
                    radial-gradient(circle at 16% 18%, color-mix(in srgb, var(--gold) 48%, transparent), transparent 32%),
                    radial-gradient(circle at 78% 24%, color-mix(in srgb, var(--accent-strong) 48%, transparent), transparent 34%),
                    linear-gradient(135deg, color-mix(in srgb, var(--accent) 84%, #0c1812), color-mix(in srgb, var(--bg-soft) 66%, #050b08))) !important;
            }
        `;
        document.head.appendChild(style);
    }

    function bannerCss(dataUrl) {
        return `linear-gradient(rgba(0,0,0,.08), rgba(0,0,0,.2)), url("${dataUrl}") center / cover no-repeat`;
    }

    function applyBanner(dataUrl) {
        if (!dataUrl) return;
        const css = bannerCss(dataUrl);
        const modal = document.getElementById('profileModal');
        const top = document.querySelector('#profileModal .profile-modal-top');
        const preview = document.querySelector('#profileCustomizeModal .profile-customize-preview');
        if (modal) modal.dataset.profileBanner = 'custom';
        if (top) top.style.setProperty('--profile-banner-background', css);
        if (preview) preview.style.setProperty('--customize-preview-banner', css);
    }

    function restoreSavedBanner() {
        const saved = readCustomization();
        if (saved.banner === 'custom' && String(saved.customBanner || '').startsWith('data:image/')) {
            applyBanner(saved.customBanner);
        }
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error || new Error('file-read-failed'));
            reader.onload = () => {
                const image = new Image();
                image.onerror = () => reject(new Error('image-load-failed'));
                image.onload = () => resolve(image);
                image.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    async function compressBanner(file) {
        if (!file?.type?.startsWith('image/')) throw new Error('invalid-image');
        if (file.size > MAX_FILE_SIZE) throw new Error('image-too-large');

        const image = await loadImage(file);
        const maxWidth = 1000;
        const maxHeight = 400;
        const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas-unavailable');
        context.drawImage(image, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', 0.68);
    }

    function setSaveBusy(busy) {
        const button = document.getElementById('profileCustomizeSaveBtn');
        if (!button) return;
        button.disabled = busy;
        if (busy) {
            button.dataset.originalLabel = button.textContent;
            button.textContent = 'Обработка изображения…';
        } else if (button.dataset.originalLabel) {
            button.textContent = button.dataset.originalLabel;
            delete button.dataset.originalLabel;
        }
    }

    function clearPending() {
        generation += 1;
        pendingBanner = '';
        pendingJob = null;
        setSaveBusy(false);
    }

    async function saveCustomBanner(event) {
        if (!pendingBanner && !pendingJob) return false;

        event.preventDefault();
        event.stopImmediatePropagation();
        setSaveBusy(true);

        try {
            const dataUrl = pendingBanner || await pendingJob;
            if (!dataUrl) throw new Error('empty-banner');

            const previous = readCustomization();
            const bioInput = document.getElementById('profileBioInput');
            const normalized = {
                bio: String(bioInput?.value ?? previous.bio ?? '').trim().slice(0, MAX_BIO_LENGTH),
                banner: 'custom',
                customBanner: dataUrl
            };

            localStorage.setItem(getCustomizationKey(), JSON.stringify(normalized));
            applyBanner(dataUrl);

            const theme = window.BibliotechTheme?.getState?.();
            if (theme && window.BibliotechTheme?.apply) {
                window.BibliotechTheme.apply(theme.theme, theme.mode, { persist: true });
            }

            pendingBanner = '';
            pendingJob = null;
            window.BibliotechProfileCustomize?.close?.({ restore: false });
            notify('Картинка профиля сохранена', 'success');
            return true;
        } catch (error) {
            console.error('[BIBLIOTECH] Failed to save profile banner', error);
            notify(error?.name === 'QuotaExceededError'
                ? 'В браузере недостаточно места для этой картинки'
                : error?.message === 'image-too-large'
                    ? 'Картинка должна быть меньше 8 МБ'
                    : 'Не удалось сохранить картинку профиля', 'error');
            return false;
        } finally {
            setSaveBusy(false);
        }
    }

    document.addEventListener('change', event => {
        if (event.target?.id !== 'profileBannerInput') return;
        const file = event.target.files?.[0];
        if (!file) return;

        event.stopImmediatePropagation();
        const currentGeneration = ++generation;
        pendingBanner = '';
        setSaveBusy(true);

        pendingJob = compressBanner(file)
            .then(dataUrl => {
                if (currentGeneration !== generation) return '';
                pendingBanner = dataUrl;
                applyBanner(dataUrl);
                return dataUrl;
            })
            .catch(error => {
                if (currentGeneration !== generation) return '';
                console.error('[BIBLIOTECH] Failed to process profile banner', error);
                notify(error?.message === 'image-too-large'
                    ? 'Картинка должна быть меньше 8 МБ'
                    : 'Не удалось обработать картинку', 'error');
                pendingJob = null;
                pendingBanner = '';
                return '';
            })
            .finally(() => {
                if (currentGeneration === generation) setSaveBusy(false);
            });

        event.target.value = '';
    }, true);

    document.addEventListener('click', event => {
        if (event.target.closest('[data-profile-banner], #profileBannerResetBtn, #profileCustomizeCancelBtn, #profileCustomizeCloseBtn')) {
            clearPending();
            return;
        }
        if (event.target.closest('#profileCustomizeSaveBtn')) saveCustomBanner(event);
    }, true);

    function init() {
        injectStyleFix();
        restoreSavedBanner();
        [100, 400, 900, 1600].forEach(delay => setTimeout(restoreSavedBanner, delay));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
    window.addEventListener('load', restoreSavedBanner);
})();
