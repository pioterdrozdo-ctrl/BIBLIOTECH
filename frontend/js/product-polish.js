(function () {
    'use strict';

    const SESSION_KEY = 'bibliotech_current_user';
    const PROFILE_OPEN_KEY = 'bibliotech_open_profile';
    const WELCOME_PREFIX = 'bibliotech_product_welcome_v1_';
    const PROFILE_CUSTOMIZATION_PREFIX = 'bibliotech_profile_customization_';

    function getSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
        catch { return null; }
    }

    function getUserKey() {
        const session = getSession();
        return String(session?.username || (session?.guest ? 'guest' : 'anonymous')).trim().toLowerCase();
    }

    function isHomePage() {
        return /(^|\/)home\.html$/.test(window.location.pathname || '');
    }

    function isAuthPage() {
        const path = window.location.pathname || '';
        return document.body.classList.contains('auth-page') || path === '/' || /(^|\/)index\.html$/.test(path);
    }

    function isProtectedSecondaryPage() {
        const path = window.location.pathname || '';
        return /(^|\/)(stats|about|admin)\.html$/.test(path);
    }

    function isQuotaError(error) {
        return error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014;
    }

    function clearRecoverableCatalogCache(storage) {
        const keys = [];
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key && /^book_catalog_/.test(key)) keys.push(key);
        }
        keys.forEach(key => storage.removeItem(key));
    }

    function installProfileStorageRecovery() {
        const prototype = window.Storage?.prototype;
        if (!prototype || prototype.__bibliotechProfileStorageRecovery) return;

        const originalSetItem = prototype.setItem;
        Object.defineProperty(prototype, '__bibliotechProfileStorageRecovery', {
            value: true,
            configurable: false,
            enumerable: false,
            writable: false
        });

        prototype.setItem = function (key, value) {
            try {
                return originalSetItem.call(this, key, value);
            } catch (error) {
                const profileWrite = this === window.localStorage
                    && String(key || '').startsWith(PROFILE_CUSTOMIZATION_PREFIX);
                if (!profileWrite || !isQuotaError(error)) throw error;

                // Каталог является локальным кэшем и при необходимости загрузится с сервера заново.
                // Освобождаем его место, чтобы пользовательская обложка профиля не терялась.
                clearRecoverableCatalogCache(this);
                return originalSetItem.call(this, key, value);
            }
        };
    }

    function reapplyProfileCustomization() {
        if (!isHomePage()) return;
        window.BibliotechProfileCustomize?.apply?.();
    }

    function installProfilePersistenceRefresh() {
        if (!isHomePage() || document.documentElement.dataset.profilePersistenceRefresh === 'ready') return;
        document.documentElement.dataset.profilePersistenceRefresh = 'ready';

        window.addEventListener('pageshow', () => setTimeout(reapplyProfileCustomization, 0));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') setTimeout(reapplyProfileCustomization, 0);
        });
        document.addEventListener('click', event => {
            if (event.target.closest('#currentUserPill, #profileCustomizeSaveBtn')) {
                setTimeout(reapplyProfileCustomization, 80);
            }
        }, true);

        const modal = document.getElementById('profileModal');
        if (modal && 'MutationObserver' in window) {
            new MutationObserver(() => {
                if (modal.classList.contains('active')) setTimeout(reapplyProfileCustomization, 0);
            }).observe(modal, { attributes: true, attributeFilter: ['class'] });
        }

        setTimeout(reapplyProfileCustomization, 0);
        setTimeout(reapplyProfileCustomization, 300);
    }

    function enhanceAuthAccessibility() {
        if (!isAuthPage()) return;
        const tabList = document.querySelector('.tabs[role="tablist"]');
        const tabs = Array.from(tabList?.querySelectorAll('[role="tab"]') || []);
        if (!tabList || !tabs.length || tabList.dataset.accessibilityReady === 'true') return;
        tabList.dataset.accessibilityReady = 'true';

        const syncTabs = () => {
            tabs.forEach(tab => {
                const selected = tab.classList.contains('active');
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
            });
        };

        tabs.forEach(tab => {
            new MutationObserver(syncTabs).observe(tab, { attributes: true, attributeFilter: ['class'] });
        });
        tabList.addEventListener('keydown', event => {
            const currentIndex = tabs.indexOf(event.target);
            if (currentIndex < 0) return;
            let nextIndex = currentIndex;
            if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = tabs.length - 1;
            else return;
            event.preventDefault();
            tabs[nextIndex].click();
            tabs[nextIndex].focus();
        });
        syncTabs();
    }

    function enhanceAuthPage() {
        if (!isAuthPage()) return;
        const container = document.querySelector('.auth-container');
        if (!container || container.closest('.auth-product-shell')) return;

        const shell = document.createElement('main');
        shell.className = 'auth-product-shell';
        shell.setAttribute('aria-label', 'Вход в BIBLIOTECH');

        const story = document.createElement('section');
        story.className = 'auth-product-story';
        story.innerHTML = `
            <div>
                <div class="auth-product-brand">
                    <img src="img/appicon-system-v2.png" alt="" aria-hidden="true">
                    <span>BIBLIOTECH</span>
                </div>
                <h2>Ваша библиотека. Всегда под рукой.</h2>
                <p>Каталог, поиск, аренда, QR-коды, отзывы и аналитика собраны в одном спокойном и понятном пространстве.</p>
                <div class="auth-value-grid">
                    <article class="auth-value-card"><span>⌕</span><div><b>Находите за секунды</b><small>По названию, автору, описанию и QR-коду</small></div></article>
                    <article class="auth-value-card"><span>▣</span><div><b>Контролируйте выдачу</b><small>Наличие, аренда и места хранения</small></div></article>
                    <article class="auth-value-card"><span>✦</span><div><b>Работайте удобно</b><small>Личный профиль, темы и мобильное PWA</small></div></article>
                </div>
            </div>
            <div class="auth-product-footnote">
                <span>8 цветовых тем</span>
                <span>Светлый и тёмный режим</span>
                <span>Работает на телефоне</span>
            </div>`;

        container.parentNode.insertBefore(shell, container);
        shell.append(story, container);
        document.body.dataset.productPolished = 'true';
    }

    function enhanceHomeHero() {
        if (!isHomePage()) return;
        const info = document.querySelector('.hero-wow .hero--info');
        if (!info || info.dataset.productHeroReady === 'true') return;
        info.dataset.productHeroReady = 'true';

        const kicker = info.querySelector('h2');
        const title = info.querySelector('h1');
        const copy = info.querySelector('p');
        const legacyButton = document.getElementById('openAddBookBtnHero');

        if (kicker) kicker.textContent = 'BIBLIOTECH';
        if (title) title.textContent = 'Каталог библиотеки';
        if (copy) copy.textContent = 'Поиск, выдача и учёт книг в одном месте.';
        legacyButton?.remove();
        info.querySelector('.product-hero-actions')?.remove();
        info.querySelector('.product-proof-strip')?.remove();

        const actions = document.createElement('div');
        actions.className = 'product-hero-actions';
        actions.innerHTML = `
            <a class="product-hero-primary" href="#catalog">Открыть каталог</a>
            <a class="product-hero-secondary" href="stats.html">Посмотреть статистику</a>`;
        info.append(actions);

        const visual = document.querySelector('.hero-wow .hero-visual');
        if (visual && visual.dataset.productCommandReady !== 'true') {
            visual.dataset.productCommandReady = 'true';
            visual.innerHTML = `
                <div class="product-command-card" aria-hidden="true">
                    <div class="product-command-head">
                        <span class="product-command-status"><i></i>Каталог онлайн</span>
                        <span class="product-command-mark">BIBLIOTECH</span>
                    </div>
                    <div class="product-command-search">
                        <span>⌕</span>
                        <span>Название, автор или ISBN</span>
                        <kbd>⌘ K</kbd>
                    </div>
                    <div class="product-command-metrics">
                        <article><span>Книг</span><b id="heroTotalBooks">0</b><small>в едином каталоге</small></article>
                        <article><span>Экземпляров</span><b id="heroTotalCopies">0</b><small>с учётом наличия</small></article>
                    </div>
                    <div class="product-command-footer">
                        <span>QR-поиск</span><span>Бронирование</span><span>Аналитика</span>
                    </div>
                </div>`;
        }

        const catalogTitle = document.querySelector('#catalog .title-section h1');
        const catalogCopy = document.querySelector('#catalog .title-section p');
        const searchLabel = document.querySelector('#catalog .premium-search-box > label');
        const searchInput = document.getElementById('searchInput');
        if (catalogTitle) catalogTitle.textContent = 'Каталог';
        if (catalogCopy) catalogCopy.textContent = 'Поиск и управление книгами';
        if (searchLabel) searchLabel.textContent = 'Поиск';
        if (searchInput) searchInput.placeholder = 'Название, автор или описание';
    }

    function removeLegacySecondaryProfile() {
        if (!isProtectedSecondaryPage()) return;
        const legacyModal = document.getElementById('profileModal');
        if (legacyModal) legacyModal.remove();

        const pill = document.getElementById('currentUserPill');
        if (!pill || pill.dataset.productProfileLinkReady === 'true') return;
        pill.dataset.productProfileLinkReady = 'true';
        pill.title = 'Открыть полноценный профиль';
        pill.addEventListener('click', event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            try { localStorage.setItem(PROFILE_OPEN_KEY, '1'); } catch {}
            window.location.href = 'home.html#profile';
        }, true);
    }

    function welcomeSeenKey() {
        return WELCOME_PREFIX + getUserKey();
    }

    function markWelcomeSeen() {
        try { localStorage.setItem(welcomeSeenKey(), '1'); } catch {}
    }

    function hasSeenWelcome() {
        try { return localStorage.getItem(welcomeSeenKey()) === '1'; }
        catch { return true; }
    }

    function createWelcomeModal() {
        let modal = document.getElementById('productWelcomeModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'productWelcomeModal';
        modal.className = 'product-welcome-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <section class="product-welcome-card" role="dialog" aria-modal="true" aria-labelledby="productWelcomeTitle">
                <div class="product-welcome-visual"><span>ДОБРО ПОЖАЛОВАТЬ В BIBLIOTECH</span></div>
                <div class="product-welcome-copy">
                    <h2 id="productWelcomeTitle">Начните с того, что действительно полезно</h2>
                    <p>Здесь не нужно разбираться в сложной системе. Три главных сценария доступны сразу.</p>
                    <div class="product-welcome-grid">
                        <article class="product-welcome-item"><span>⌕</span><b>Найти книгу</b><small>Введите название, автора или тему</small></article>
                        <article class="product-welcome-item"><span>▣</span><b>Сканировать QR</b><small>Откройте карточку книги камерой</small></article>
                        <article class="product-welcome-item"><span>👤</span><b>Настроить профиль</b><small>Аватар, обложка, безопасность и списки</small></article>
                    </div>
                    <div class="product-welcome-actions">
                        <button class="product-welcome-skip" id="productWelcomeSkip" type="button">Посмотреть самому</button>
                        <button class="product-welcome-start" id="productWelcomeStart" type="button">Открыть каталог</button>
                    </div>
                </div>
            </section>`;
        document.body.appendChild(modal);

        const close = (focusCatalog = false) => {
            markWelcomeSeen();
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('product-welcome-open');
            if (focusCatalog) {
                document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setTimeout(() => document.getElementById('searchInput')?.focus(), 450);
            }
        };

        modal.querySelector('#productWelcomeSkip')?.addEventListener('click', () => close(false));
        modal.querySelector('#productWelcomeStart')?.addEventListener('click', () => close(true));
        modal.addEventListener('click', event => {
            if (event.target === modal) close(false);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && modal.classList.contains('active')) close(false);
        });
        return modal;
    }

    function maybeShowWelcome() {
        if (!isHomePage() || hasSeenWelcome()) return;
        const session = getSession();
        if (!session) return;
        const modal = createWelcomeModal();
        window.setTimeout(() => {
            if (document.querySelector('.modal.active, .profile-customize-modal.active, .account-settings-modal.active')) return;
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('product-welcome-open');
            modal.querySelector('#productWelcomeStart')?.focus();
        }, 850);
    }

    function refineFooter() {
        // Only the page-level footer is product copy. Modal footers contain controls and must remain untouched.
        document.querySelectorAll('.wrapper > footer').forEach(footer => {
            if (footer.dataset.productFooterReady === 'true') return;
            footer.dataset.productFooterReady = 'true';
            footer.innerHTML = '<b>BIBLIOTECH</b> · цифровой каталог библиотеки · 2026';
        });
    }

    function init() {
        installProfileStorageRecovery();
        enhanceAuthAccessibility();
        enhanceAuthPage();
        enhanceHomeHero();
        removeLegacySecondaryProfile();
        refineFooter();
        maybeShowWelcome();
        installProfilePersistenceRefresh();
        document.documentElement.dataset.productPolish = 'ready';
    }

    window.BibliotechProductPolish = {
        init,
        showWelcome() {
            const modal = createWelcomeModal();
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
