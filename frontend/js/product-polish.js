(function () {
    'use strict';

    const SESSION_KEY = 'bibliotech_current_user';
    const PROFILE_OPEN_KEY = 'bibliotech_open_profile';
    const WELCOME_PREFIX = 'bibliotech_product_welcome_v1_';

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
                    <img src="img/appicon.png" alt="" aria-hidden="true">
                    <span>BIBLIOTECH</span>
                </div>
                <h2>Библиотека, в которой ничего не теряется</h2>
                <p>Каталог, поиск, аренда, QR-коды, отзывы и аналитика работают как единый продукт — без таблиц, хаоса и лишних действий.</p>
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

        if (kicker) kicker.textContent = 'ЦИФРОВАЯ БИБЛИОТЕКА';
        if (title) title.innerHTML = 'Книги под контролем.<br>Чтение без хаоса.';
        if (copy) copy.textContent = 'BIBLIOTECH объединяет умный поиск, выдачу книг, QR-коды, комментарии и статистику. Всё нужное читателю и библиотекарю находится в одном понятном интерфейсе.';
        if (legacyButton) legacyButton.hidden = true;

        const actions = document.createElement('div');
        actions.className = 'product-hero-actions';
        actions.innerHTML = `
            <a class="product-hero-primary" href="#catalog"><span aria-hidden="true">⌕</span> Открыть каталог</a>
            <button class="product-hero-secondary" id="productHeroQrBtn" type="button"><span aria-hidden="true">▣</span> Сканировать QR</button>`;

        const proof = document.createElement('div');
        proof.className = 'product-proof-strip';
        proof.setAttribute('aria-label', 'Основные возможности');
        proof.innerHTML = `
            <span class="product-proof-chip"><b>Умный поиск</b> без точного совпадения</span>
            <span class="product-proof-chip"><b>Аренда</b> и наличие книг</span>
            <span class="product-proof-chip"><b>QR</b> для быстрого доступа</span>
            <span class="product-proof-chip"><b>Статистика</b> в реальном времени</span>`;

        info.append(actions, proof);
        actions.querySelector('#productHeroQrBtn')?.addEventListener('click', () => {
            document.getElementById('openQrScannerBtn')?.click();
        });
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
        document.querySelectorAll('footer').forEach(footer => {
            if (footer.dataset.productFooterReady === 'true') return;
            footer.dataset.productFooterReady = 'true';
            footer.innerHTML = '<b>BIBLIOTECH</b> · цифровой каталог библиотеки · 2026';
        });
    }

    function init() {
        enhanceAuthPage();
        enhanceHomeHero();
        removeLegacySecondaryProfile();
        refineFooter();
        maybeShowWelcome();
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
