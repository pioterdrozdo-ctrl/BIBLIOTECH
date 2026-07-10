(function () {
    'use strict';

    const SESSION_KEY = 'bibliotech_current_user';
    const CUSTOMIZATION_PREFIX = 'bibliotech_profile_customization_';
    const DB_NAME = 'bibliotech-profile-assets';
    const STORE_NAME = 'profile-banners';
    const DB_VERSION = 1;
    const BANNER_SENTINEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

    let pendingMode = '';
    let pendingBannerPromise = null;

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

    function openDatabase() {
        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                reject(new Error('indexeddb-unavailable'));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error || new Error('indexeddb-open-failed'));
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
        });
    }

    async function withStore(mode, action) {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, mode);
            const store = transaction.objectStore(STORE_NAME);
            let request;

            try { request = action(store); }
            catch (error) {
                database.close();
                reject(error);
                return;
            }

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('indexeddb-request-failed'));
            transaction.oncomplete = () => database.close();
            transaction.onerror = () => {
                database.close();
                reject(transaction.error || new Error('indexeddb-transaction-failed'));
            };
        });
    }

    function readBanner() {
        return withStore('readonly', store => store.get(getUserKey()));
    }

    function writeBanner(dataUrl) {
        return withStore('readwrite', store => store.put(dataUrl, getUserKey()));
    }

    function deleteBanner() {
        return withStore('readwrite', store => store.delete(getUserKey())).catch(() => null);
    }

    function readCustomization() {
        try { return JSON.parse(localStorage.getItem(getCustomizationKey()) || '{}'); }
        catch { return {}; }
    }

    function writeCustomMetadata() {
        const saved = readCustomization();
        const bioInput = document.getElementById('profileBioInput');
        const next = {
            ...saved,
            bio: String(bioInput?.value ?? saved.bio ?? '').trim().slice(0, 160),
            banner: 'custom',
            customBanner: BANNER_SENTINEL
        };

        localStorage.removeItem(getCustomizationKey());
        localStorage.setItem(getCustomizationKey(), JSON.stringify(next));
        return next;
    }

    function bannerCss(dataUrl) {
        return `linear-gradient(rgba(0,0,0,.08), rgba(0,0,0,.2)), url("${dataUrl}") center / cover no-repeat`;
    }

    function applyBanner(dataUrl, metadata = readCustomization()) {
        if (!dataUrl) return;
        const css = bannerCss(dataUrl);
        const modal = document.getElementById('profileModal');
        const top = document.querySelector('#profileModal .profile-modal-top');
        const preview = document.querySelector('#profileCustomizeModal .profile-customize-preview');
        const bio = document.getElementById('profileBio');

        if (modal) modal.dataset.profileBanner = 'custom';
        if (top) top.style.setProperty('--profile-banner-background', css);
        if (preview) preview.style.setProperty('--customize-preview-banner', css);
        if (bio) {
            bio.textContent = metadata.bio || '';
            bio.hidden = !metadata.bio;
        }

        document.dispatchEvent(new CustomEvent('bibliotech:profile-customization-change', {
            detail: { bio: metadata.bio || '', banner: 'custom' }
        }));
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
        if (file.size > 12 * 1024 * 1024) throw new Error('image-too-large');

        const image = await loadImage(file);
        const maxWidth = 1400;
        const maxHeight = 560;
        const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas-unavailable');
        context.drawImage(image, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', 0.76);
    }

    function notify(message, type = 'info') {
        if (typeof window.notify === 'function') window.notify(message, type);
        else console[type === 'error' ? 'error' : 'log'](message);
    }

    async function restoreStoredBanner() {
        const metadata = readCustomization();
        if (metadata.banner !== 'custom') return;

        let storedBanner = '';
        const inlineBanner = String(metadata.customBanner || '');

        if (inlineBanner.startsWith('data:image/') && inlineBanner !== BANNER_SENTINEL) {
            storedBanner = inlineBanner;
            try {
                await writeBanner(storedBanner);
                writeCustomMetadata();
            } catch (error) {
                console.warn('[BIBLIOTECH] Could not migrate profile banner', error);
            }
        } else {
            storedBanner = await readBanner().catch(() => '');
        }

        if (storedBanner) applyBanner(storedBanner, readCustomization());
    }

    async function savePendingCustomBanner(event) {
        if (pendingMode !== 'custom' || !pendingBannerPromise) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const saveButton = event.target.closest('#profileCustomizeSaveBtn');
        if (saveButton) saveButton.disabled = true;

        try {
            const dataUrl = await pendingBannerPromise;
            await writeBanner(dataUrl);
            const metadata = writeCustomMetadata();
            applyBanner(dataUrl, metadata);

            const theme = window.BibliotechTheme?.getState?.();
            if (theme && window.BibliotechTheme?.apply) {
                window.BibliotechTheme.apply(theme.theme, theme.mode, { persist: true });
            }

            pendingMode = '';
            pendingBannerPromise = null;
            window.BibliotechProfileCustomize?.close?.({ restore: false });
            notify('Картинка профиля сохранена', 'success');
        } catch (error) {
            console.error('[BIBLIOTECH] Profile banner save failed', error);
            notify(error?.message === 'image-too-large'
                ? 'Картинка должна быть меньше 12 МБ'
                : 'Не удалось сохранить картинку профиля', 'error');
        } finally {
            if (saveButton?.isConnected) saveButton.disabled = false;
        }
    }

    document.addEventListener('change', event => {
        if (event.target?.id !== 'profileBannerInput') return;
        const file = event.target.files?.[0];
        if (!file) return;
        pendingMode = 'custom';
        pendingBannerPromise = compressBanner(file);
    }, true);

    document.addEventListener('click', event => {
        if (event.target.closest('[data-profile-banner], #profileBannerResetBtn')) {
            pendingMode = 'preset';
            pendingBannerPromise = null;
            return;
        }

        if (event.target.closest('#profileCustomizeSaveBtn')) {
            savePendingCustomBanner(event);
        }
    }, true);

    document.addEventListener('click', event => {
        if (!event.target.closest('#profileCustomizeSaveBtn')) return;
        window.setTimeout(() => {
            const metadata = readCustomization();
            if (metadata.banner !== 'custom') deleteBanner();
            else restoreStoredBanner();
        }, 0);
    });

    if ('MutationObserver' in window) {
        const observer = new MutationObserver(records => {
            if (records.some(record => record.type === 'childList' || record.attributeName === 'class')) {
                restoreStoredBanner();
            }
        });

        const startObserver = () => {
            if (!document.body) return;
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startObserver, { once: true });
        } else {
            startObserver();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', restoreStoredBanner, { once: true });
    } else {
        restoreStoredBanner();
    }
    window.addEventListener('load', restoreStoredBanner);
})();