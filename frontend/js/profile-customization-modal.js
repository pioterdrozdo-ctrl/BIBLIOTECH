(function () {
    'use strict';

    const SESSION_KEY = 'bibliotech_current_user';
    const CUSTOMIZATION_PREFIX = 'bibliotech_profile_customization_';
    const MAX_BIO_LENGTH = 160;
    const BANNERS = {
        aurora: {
            label: 'Аврора',
            icon: '✦',
            css: 'radial-gradient(circle at 16% 18%, color-mix(in srgb, var(--gold) 48%, transparent), transparent 32%), radial-gradient(circle at 78% 24%, color-mix(in srgb, var(--accent-strong) 48%, transparent), transparent 34%), linear-gradient(135deg, color-mix(in srgb, var(--accent) 84%, #0c1812), color-mix(in srgb, var(--bg-soft) 66%, #050b08))'
        },
        library: {
            label: 'Библиотека',
            icon: '▤',
            css: 'linear-gradient(115deg, rgba(0,0,0,.24), transparent 54%), repeating-linear-gradient(90deg, color-mix(in srgb, var(--accent) 70%, #18261f) 0 54px, color-mix(in srgb, var(--gold) 52%, #352719) 54px 64px, color-mix(in srgb, var(--accent-strong) 72%, #101a16) 64px 116px)'
        },
        waves: {
            label: 'Волны',
            icon: '≈',
            css: 'radial-gradient(ellipse at 20% 115%, rgba(255,255,255,.22) 0 22%, transparent 23%), radial-gradient(ellipse at 70% 115%, rgba(255,255,255,.13) 0 28%, transparent 29%), linear-gradient(135deg, #075985, #0f766e 55%, #164e63)'
        },
        sunset: {
            label: 'Закат',
            icon: '◐',
            css: 'radial-gradient(circle at 72% 28%, rgba(255,240,184,.74), transparent 18%), linear-gradient(135deg, #7c2d12, #db2777 54%, #4c1d95)'
        },
        paper: {
            label: 'Бумага',
            icon: '⌁',
            css: 'linear-gradient(rgba(255,255,255,.13) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(135deg, #8b6f47, #5b4630)'
        },
        mono: {
            label: 'Моно',
            icon: '◒',
            css: 'radial-gradient(circle at 78% 20%, rgba(255,255,255,.18), transparent 24%), linear-gradient(135deg, #27272a, #09090b 70%)'
        }
    };

    let snapshot = null;
    let draft = null;

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

    function getAvatarKey() {
        const session = getSession();
        const name = session?.username || (session?.guest ? 'guest' : 'user');
        return `bibliotech_avatar_${name}`;
    }

    function readCustomization() {
        try {
            const saved = JSON.parse(localStorage.getItem(getCustomizationKey()) || '{}');
            return {
                bio: String(saved.bio || '').slice(0, MAX_BIO_LENGTH),
                banner: BANNERS[saved.banner] ? saved.banner : (saved.customBanner ? 'custom' : 'aurora'),
                customBanner: String(saved.customBanner || '')
            };
        } catch {
            return { bio: '', banner: 'aurora', customBanner: '' };
        }
    }

    function writeCustomization(value) {
        const normalized = {
            bio: String(value.bio || '').trim().slice(0, MAX_BIO_LENGTH),
            banner: BANNERS[value.banner] ? value.banner : (value.customBanner ? 'custom' : 'aurora'),
            customBanner: String(value.customBanner || '')
        };
        localStorage.setItem(getCustomizationKey(), JSON.stringify(normalized));
        return normalized;
    }

    function notify(message, type = 'info') {
        if (typeof window.notify === 'function') window.notify(message, type);
        else console[type === 'error' ? 'error' : 'log'](message);
    }

    function bannerCss(value) {
        if (value?.banner === 'custom' && value.customBanner) {
            return `linear-gradient(rgba(0,0,0,.08), rgba(0,0,0,.2)), url("${value.customBanner}") center / cover no-repeat`;
        }
        return BANNERS[value?.banner]?.css || BANNERS.aurora.css;
    }

    function ensureProfileBio() {
        const identity = document.querySelector('#profileModal .profile-identity');
        const roleNote = document.getElementById('profileRoleNote');
        if (!identity) return null;
        let bio = document.getElementById('profileBio');
        if (!bio) {
            bio = document.createElement('p');
            bio.id = 'profileBio';
            bio.className = 'profile-bio';
            bio.hidden = true;
            if (roleNote) roleNote.insertAdjacentElement('afterend', bio);
            else identity.appendChild(bio);
        }
        return bio;
    }

    function applyCustomization(value = readCustomization()) {
        const profileModal = document.getElementById('profileModal');
        const profileTop = document.querySelector('#profileModal .profile-modal-top');
        const bio = ensureProfileBio();
        const css = bannerCss(value);

        if (profileModal) profileModal.dataset.profileBanner = value.banner || 'aurora';
        if (profileTop) profileTop.style.setProperty('--profile-banner-background', css);
        if (bio) {
            bio.textContent = value.bio || '';
            bio.hidden = !value.bio;
        }

        document.dispatchEvent(new CustomEvent('bibliotech:profile-customization-change', {
            detail: { bio: value.bio || '', banner: value.banner || 'aurora' }
        }));
        return value;
    }

    function syncPreviewAvatar() {
        const source = document.getElementById('profileAvatar');
        const target = document.getElementById('profileCustomizePreviewAvatar');
        if (!target) return;
        target.innerHTML = source?.innerHTML || '👤';
    }

    function syncPreview() {
        const modal = document.getElementById('profileCustomizeModal');
        if (!modal || !draft) return;
        const preview = modal.querySelector('.profile-customize-preview');
        const bio = document.getElementById('profileBioInput');
        const counter = document.getElementById('profileBioCounter');
        const previewBio = document.getElementById('profileCustomizePreviewBio');
        const session = getSession();
        const previewName = document.getElementById('profileCustomizePreviewName');

        if (preview) preview.style.setProperty('--customize-preview-banner', bannerCss(draft));
        if (bio && bio.value !== draft.bio) bio.value = draft.bio;
        if (counter) counter.textContent = `${draft.bio.length}/${MAX_BIO_LENGTH}`;
        if (previewBio) {
            previewBio.textContent = draft.bio || 'Добавьте пару слов о себе и своих книжных интересах.';
            previewBio.classList.toggle('is-placeholder', !draft.bio);
        }
        if (previewName) previewName.textContent = session?.guest ? 'Гость' : (session?.username || 'Пользователь');

        modal.querySelectorAll('[data-profile-banner]').forEach(button => {
            const active = button.dataset.profileBanner === draft.banner;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        syncPreviewAvatar();
    }

    function moveAvatarEditor(modal) {
        const mount = modal.querySelector('#profileCustomizeAvatarMount');
        const editor = document.querySelector('#profileModal .avatar-settings') || document.querySelector('#profileCustomizeModal .avatar-settings');
        if (mount && editor && editor.parentElement !== mount) mount.appendChild(editor);

        const duplicatedPalette = document.querySelector('#profileModal .theme-settings');
        if (duplicatedPalette) duplicatedPalette.remove();
    }

    function modalMarkup() {
        const bannerButtons = Object.entries(BANNERS).map(([id, banner]) => `
            <button class="profile-banner-choice" type="button" data-profile-banner="${id}" aria-pressed="false">
                <span class="profile-banner-choice-preview" style="--choice-banner:${banner.css}"></span>
                <span><b>${banner.icon} ${banner.label}</b><small>Обложка профиля</small></span>
            </button>`).join('');

        return `
            <div class="profile-customize-dialog" role="dialog" aria-modal="true" aria-labelledby="profileCustomizeTitle">
                <header class="profile-customize-header">
                    <div>
                        <p class="profile-customize-kicker">BIBLIOTECH PROFILE</p>
                        <h2 id="profileCustomizeTitle">Оформление профиля</h2>
                        <p>Меняйте только личный профиль. Палитра всего сайта остаётся в кнопке темы в шапке.</p>
                    </div>
                    <button class="profile-customize-close" id="profileCustomizeCloseBtn" type="button" aria-label="Закрыть">×</button>
                </header>
                <main class="profile-customize-content">
                    <section class="profile-customize-preview" aria-label="Предпросмотр профиля">
                        <div class="profile-customize-preview-banner"></div>
                        <div class="profile-customize-preview-avatar" id="profileCustomizePreviewAvatar">👤</div>
                        <div class="profile-customize-preview-copy">
                            <b id="profileCustomizePreviewName">Пользователь</b>
                            <span id="profileCustomizePreviewBio" class="is-placeholder">Добавьте пару слов о себе и своих книжных интересах.</span>
                        </div>
                    </section>

                    <section class="profile-customize-section">
                        <div class="profile-customize-section-head">
                            <div><span class="profile-customize-step">01</span><h3>Фото профиля</h3></div>
                            <p>Ваш текущий загрузчик и готовые символы перенесены сюда без дублирования.</p>
                        </div>
                        <div id="profileCustomizeAvatarMount"></div>
                    </section>

                    <section class="profile-customize-section">
                        <div class="profile-customize-section-head">
                            <div><span class="profile-customize-step">02</span><h3>Короткое описание</h3></div>
                            <p>Расскажите, что читаете, изучаете или ищете в библиотеке.</p>
                        </div>
                        <label class="profile-bio-field" for="profileBioInput">
                            <textarea id="profileBioInput" maxlength="${MAX_BIO_LENGTH}" rows="3" placeholder="Например: изучаю программирование и собираю хорошую техническую литературу"></textarea>
                            <span id="profileBioCounter">0/${MAX_BIO_LENGTH}</span>
                        </label>
                    </section>

                    <section class="profile-customize-section">
                        <div class="profile-customize-section-head">
                            <div><span class="profile-customize-step">03</span><h3>Обложка профиля</h3></div>
                            <p>Выберите готовую композицию или загрузите собственное изображение.</p>
                        </div>
                        <div class="profile-banner-grid">${bannerButtons}</div>
                        <div class="profile-banner-upload-row">
                            <label class="profile-customize-secondary" for="profileBannerInput">🖼 Загрузить свою</label>
                            <input id="profileBannerInput" type="file" accept="image/png,image/jpeg,image/webp" hidden>
                            <button class="profile-customize-secondary" id="profileBannerResetBtn" type="button">Сбросить обложку</button>
                        </div>
                    </section>
                </main>
                <footer class="profile-customize-footer">
                    <button class="profile-customize-secondary" id="profileCustomizeCancelBtn" type="button">Отмена</button>
                    <button class="profile-customize-save" id="profileCustomizeSaveBtn" type="button">Сохранить профиль</button>
                </footer>
            </div>`;
    }

    function ensureModal() {
        let modal = document.getElementById('profileCustomizeModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'profileCustomizeModal';
            modal.className = 'profile-customize-modal';
            modal.setAttribute('aria-hidden', 'true');
            modal.innerHTML = modalMarkup();
            document.body.appendChild(modal);
            wireModal(modal);
        }
        moveAvatarEditor(modal);
        return modal;
    }

    function restoreAvatar() {
        if (!snapshot) return;
        if (snapshot.avatar) localStorage.setItem(getAvatarKey(), snapshot.avatar);
        else localStorage.removeItem(getAvatarKey());
        if (typeof window.applyProfileAvatar === 'function') window.applyProfileAvatar();
        else document.getElementById('currentUserPill')?.click();
    }

    function close(options = {}) {
        const modal = document.getElementById('profileCustomizeModal');
        if (!modal) return;
        if (options.restore !== false) restoreAvatar();
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('profile-customize-modal-open');
        snapshot = null;
        draft = null;
    }

    function open(trigger = null) {
        const modal = ensureModal();
        snapshot = {
            customization: readCustomization(),
            avatar: localStorage.getItem(getAvatarKey()) || '',
            trigger: trigger || document.activeElement
        };
        draft = { ...snapshot.customization };

        window.BibliotechSettings?.close?.({ restoreFocus: false });
        document.getElementById('profileModal')?.classList.remove('active');
        syncPreview();
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('profile-customize-modal-open');
        setTimeout(() => document.getElementById('profileCustomizeCloseBtn')?.focus(), 0);
    }

    function save() {
        if (!draft) return;
        try {
            const saved = writeCustomization(draft);
            applyCustomization(saved);
            const modal = document.getElementById('profileCustomizeModal');
            modal?.classList.remove('active');
            modal?.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('profile-customize-modal-open');
            snapshot = null;
            draft = null;
            notify('Профиль обновлён', 'success');
        } catch (error) {
            notify(error?.name === 'QuotaExceededError' ? 'Изображение слишком большое для сохранения' : 'Не удалось сохранить профиль', 'error');
        }
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => {
                const image = new Image();
                image.onerror = reject;
                image.onload = () => resolve(image);
                image.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    async function compressBanner(file) {
        if (!file?.type?.startsWith('image/')) throw new Error('invalid-image');
        if (file.size > 8 * 1024 * 1024) throw new Error('image-too-large');
        const image = await loadImage(file);
        const maxWidth = 1200;
        const maxHeight = 480;
        const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', 0.78);
    }

    function wireModal(modal) {
        if (modal.dataset.customizeReady === 'true') return;
        modal.dataset.customizeReady = 'true';

        modal.addEventListener('click', event => {
            if (event.target === modal) {
                close();
                return;
            }
            const banner = event.target.closest('[data-profile-banner]');
            if (banner && draft) {
                draft.banner = banner.dataset.profileBanner;
                draft.customBanner = '';
                syncPreview();
            }
        });

        modal.querySelector('#profileBioInput')?.addEventListener('input', event => {
            if (!draft) return;
            draft.bio = event.target.value.slice(0, MAX_BIO_LENGTH);
            syncPreview();
        });

        modal.querySelector('#profileBannerInput')?.addEventListener('change', async event => {
            const file = event.target.files?.[0];
            if (!file || !draft) return;
            try {
                draft.customBanner = await compressBanner(file);
                draft.banner = 'custom';
                syncPreview();
            } catch (error) {
                notify(error.message === 'image-too-large' ? 'Файл обложки должен быть меньше 8 МБ' : 'Не удалось обработать изображение', 'error');
            } finally {
                event.target.value = '';
            }
        });

        modal.querySelector('#profileBannerResetBtn')?.addEventListener('click', () => {
            if (!draft) return;
            draft.banner = 'aurora';
            draft.customBanner = '';
            syncPreview();
        });

        modal.querySelector('#profileCustomizeSaveBtn')?.addEventListener('click', save);
        modal.querySelector('#profileCustomizeCancelBtn')?.addEventListener('click', () => close());
        modal.querySelector('#profileCustomizeCloseBtn')?.addEventListener('click', () => close());

        modal.addEventListener('click', event => {
            if (event.target.closest('#profileCustomizeAvatarMount [data-avatar]')) setTimeout(syncPreviewAvatar, 0);
        }, true);
        modal.addEventListener('change', event => {
            if (event.target.id === 'profileAvatarInput') setTimeout(syncPreviewAvatar, 120);
        }, true);
    }

    function init() {
        const modal = ensureModal();
        applyCustomization();
        document.addEventListener('click', event => {
            const trigger = event.target.closest('#profileEditBtn, [data-open-profile-customize]');
            if (!trigger || modal.contains(trigger)) return;
            event.preventDefault();
            event.stopPropagation();
            open(trigger);
        }, true);
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !modal.classList.contains('active')) return;
            event.preventDefault();
            close();
        });
    }

    window.BibliotechProfileCustomize = {
        ensure: ensureModal,
        open,
        close,
        save,
        apply: applyCustomization,
        get: readCustomization
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
