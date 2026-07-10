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

    function readThemeState() {
        const state = window.BibliotechTheme?.getState?.();
        const theme = state?.theme || localStorage.getItem('theme') || 'forest';
        const fallbackMode = ['dark', 'forest', 'ocean', 'violet', 'mono'].includes(theme) ? 'dark' : 'light';
        return {
            theme,
            mode: state?.mode || localStorage.getItem('bibliotech_theme_mode') || fallbackMode
        };
    }

    function syncThemeControls(value = draft || readThemeState()) {
        const modal = document.getElementById('profileCustomizeModal');
        if (!modal || !value) return;
        const theme = value.theme || 'forest';
        const mode = value.mode === 'dark' ? 'dark' : 'light';
        const meta = window.BibliotechTheme?.meta?.[theme];

        modal.querySelectorAll('[data-profile-theme-mode]').forEach(button => {
            const active = button.dataset.profileThemeMode === mode;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        modal.querySelectorAll('#profileCustomizeThemeMount .theme-preset[data-theme]').forEach(button => {
            const active = button.dataset.theme === theme;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
            if (active) button.dataset.activeMode = mode;
            else delete button.dataset.activeMode;
        });

        const status = document.getElementById('profileThemeModeStatus');
        if (status) status.textContent = `${meta?.name || theme} · ${mode === 'dark' ? 'тёмный' : 'светлый'} режим`;
    }

    function applyThemeState(value, { persist = false } = {}) {
        if (!value || !window.BibliotechTheme?.apply) return null;
        const next = window.BibliotechTheme.apply(value.theme, value.mode, { persist });
        syncThemeControls(next);
        return next;
    }

    function previewThemeDraft() {
        if (!draft) return;
        applyThemeState({ theme: draft.theme, mode: draft.mode }, { persist: false });
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
        syncThemeControls(draft);
        syncPreviewAvatar();
    }

    function moveProfileEditors(modal) {
        const avatarMount = modal.querySelector('#profileCustomizeAvatarMount');
        const editor = document.querySelector('#profileModal .avatar-settings') || document.querySelector('#profileCustomizeModal .avatar-settings');
        if (avatarMount && editor && editor.parentElement !== avatarMount) avatarMount.appendChild(editor);

        const themeMount = modal.querySelector('#profileCustomizeThemeMount');
        const palette = document.querySelector('#profileModal .theme-settings') || themeMount?.querySelector('.theme-settings');
        if (themeMount && palette && palette.parentElement !== themeMount) themeMount.appendChild(palette);
        if (palette) {
            palette.setAttribute('aria-label', 'Выбор палитры интерфейса');
            const title = palette.querySelector('.theme-settings-head h3');
            const copy = palette.querySelector('.theme-settings-head p');
            if (title) title.textContent = 'Палитра';
            if (copy) copy.textContent = 'Выберите цвет интерфейса. Яркость настраивается отдельно.';
        }

        window.BibliotechTheme?.bindControls?.();
        syncThemeControls();
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
                        <p>Настройте фото, описание, обложку профиля и палитру всего интерфейса.</p>
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

                    <section class="profile-customize-section profile-customize-theme-section">
                        <div class="profile-customize-section-head">
                            <div><span class="profile-customize-step">04</span><h3>Интерфейс сайта</h3></div>
                            <p>Выберите палитру и её светлую или тёмную версию. Изменения сохранятся вместе с профилем.</p>
                        </div>
                        <div class="profile-theme-mode-row">
                            <div class="profile-theme-mode-copy">
                                <b>Яркость</b>
                                <span id="profileThemeModeStatus">Текущий режим</span>
                            </div>
                            <div class="profile-theme-mode-control" role="group" aria-label="Яркость темы">
                                <button class="profile-theme-mode-button" type="button" data-profile-theme-mode="light" aria-pressed="false">
                                    <span aria-hidden="true">☀</span> Светлая
                                </button>
                                <button class="profile-theme-mode-button" type="button" data-profile-theme-mode="dark" aria-pressed="false">
                                    <span aria-hidden="true">☾</span> Тёмная
                                </button>
                            </div>
                        </div>
                        <div id="profileCustomizeThemeMount"></div>
                    </section>
                </main>
                <footer class="profile-customize-footer">
                    <button class="profile-customize-secondary" id="profileCustomizeCancelBtn" type="button">Отмена</button>
                    <button class="profile-customize-save" id="profileCustomizeSaveBtn" type="button">Сохранить оформление</button>
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
        moveProfileEditors(modal);
        return modal;
    }

    function restoreAvatar(source = snapshot) {
        if (!source) return;
        if (source.avatar) localStorage.setItem(getAvatarKey(), source.avatar);
        else localStorage.removeItem(getAvatarKey());
        if (typeof window.applyProfileAvatar === 'function') window.applyProfileAvatar();
        else document.getElementById('currentUserPill')?.click();
    }

    function restoreTriggerFocus(source) {
        const trigger = source?.trigger;
        if (!trigger?.isConnected) {
            setTimeout(() => document.getElementById('currentUserPill')?.focus({ preventScroll: true }), 0);
            return;
        }

        const profileModal = trigger.closest?.('#profileModal');
        const settingsModal = trigger.closest?.('#accountSettingsModal');
        if (profileModal && !profileModal.classList.contains('active')) {
            window.BibliotechProfile?.openOverview?.();
        } else if (settingsModal && !settingsModal.classList.contains('active')) {
            window.BibliotechSettings?.open?.(source.settingsSection || 'account', trigger);
        }

        setTimeout(() => trigger.focus({ preventScroll: true }), 0);
    }

    function close(options = {}) {
        const modal = document.getElementById('profileCustomizeModal');
        if (!modal) return;
        const activeSnapshot = snapshot;
        if (options.restore !== false) {
            restoreAvatar(activeSnapshot);
            applyThemeState(activeSnapshot?.theme, { persist: false });
        }
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('profile-customize-modal-open');
        snapshot = null;
        draft = null;
        if (options.restoreFocus !== false) restoreTriggerFocus(activeSnapshot);
    }

    function open(trigger = null) {
        const modal = ensureModal();
        const theme = readThemeState();
        const sourceTrigger = trigger || document.activeElement;
        const sourceSettings = sourceTrigger?.closest?.('#accountSettingsModal');
        snapshot = {
            customization: readCustomization(),
            avatar: localStorage.getItem(getAvatarKey()) || '',
            theme: { ...theme },
            trigger: sourceTrigger,
            settingsSection: sourceSettings?.dataset.settingsSection || 'account'
        };
        draft = { ...snapshot.customization, theme: theme.theme, mode: theme.mode };

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
            applyThemeState({ theme: draft.theme, mode: draft.mode }, { persist: true });
            close({ restore: false });
            notify('Оформление сохранено', 'success');
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
            const themeButton = event.target.closest('#profileCustomizeThemeMount .theme-preset[data-theme]');
            const modeButton = event.target.closest('[data-profile-theme-mode]');
            if ((!themeButton && !modeButton) || !draft) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (themeButton) draft.theme = themeButton.dataset.theme;
            if (modeButton) draft.mode = modeButton.dataset.profileThemeMode;
            previewThemeDraft();
        }, true);

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
