'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'frontend/css/product-polish.css'), 'utf8');
const homeCss = fs.readFileSync(path.join(root, 'frontend/css/home-minimal.css'), 'utf8');
const reservationCss = fs.readFileSync(path.join(root, 'frontend/css/reservation-queue.css'), 'utf8');
const commercialCss = fs.readFileSync(path.join(root, 'frontend/css/commercial-polish.css'), 'utf8');
const appleCss = fs.readFileSync(path.join(root, 'frontend/css/apple-polish.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'frontend/js/product-polish.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'frontend/js/script.js'), 'utf8');
const pwa = fs.readFileSync(path.join(root, 'frontend/js/pwa.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'frontend/sw.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
const catalogRoute = fs.readFileSync(path.join(root, 'backend/routes/catalogList.js'), 'utf8');
const catalogFix = fs.readFileSync(path.join(root, 'frontend/js/catalog-fix.js'), 'utf8');
const authRoute = fs.readFileSync(path.join(root, 'backend/routes/auth.js'), 'utf8');
const resetEmailRoute = fs.readFileSync(path.join(root, 'backend/routes/passwordResetEmail.js'), 'utf8');
const localStore = fs.readFileSync(path.join(root, 'backend/services/localStore.js'), 'utf8');

function assertBalancedCss(source, filename) {
    const stripped = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
    let balance = 0;
    for (const char of stripped) {
        if (char === '{') balance += 1;
        if (char === '}') balance -= 1;
        assert.ok(balance >= 0, `${filename}: unexpected closing brace`);
    }
    assert.equal(balance, 0, `${filename}: unbalanced braces`);
}

assertBalancedCss(css, 'product-polish.css');
assertBalancedCss(homeCss, 'home-minimal.css');
assertBalancedCss(reservationCss, 'reservation-queue.css');
assertBalancedCss(commercialCss, 'commercial-polish.css');
assertBalancedCss(appleCss, 'apple-polish.css');
assert.ok(css.includes('.auth-product-shell'), 'auth product layout is missing');
assert.ok(css.includes('.product-hero-actions'), 'home hero actions are not styled');
assert.ok(css.includes('.product-welcome-modal'), 'first-run experience is not styled');
assert.ok(css.includes('.admin-users-table'), 'admin interface is not covered by the design system');
assert.ok(css.includes('.book-card'), 'catalog cards are not covered by the design system');
assert.ok(css.includes('@media (max-width: 560px)'), 'phone polish is missing');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion support is missing');
assert.ok(reservationCss.includes('.reservation-queue-badge'), 'reservation badge styling is missing');
assert.ok(reservationCss.includes('.profile-reservations-panel'), 'profile reservation styling is missing');
assert.ok(reservationCss.includes('@media (max-width: 560px)'), 'reservation mobile layout is missing');

assert.ok(homeCss.includes('.hero-wow .hero-content'), 'minimal hero layout is missing');
assert.ok(homeCss.includes('.product-proof-strip'), 'marketing chip suppression is missing');
assert.ok(homeCss.includes('#openAddBookBtnHero'), 'duplicate hero add-book suppression is missing');
assert.ok(homeCss.includes('@media (max-width: 700px)'), 'minimal mobile hero layout is missing');

assert.ok(js.includes('enhanceAuthPage'), 'auth first impression is missing');
assert.ok(js.includes('enhanceHomeHero'), 'home refinement is missing');
assert.ok(js.includes("title.textContent = 'Каталог библиотеки'"), 'minimal hero title is missing');
assert.ok(js.includes("copy.textContent = 'Поиск, выдача и учёт книг в одном месте.'"), 'direct hero description is missing');
assert.ok(js.includes('legacyButton?.remove()'), 'duplicate add-book action is not removed');
assert.ok(js.includes('Открыть каталог'), 'primary catalog action is missing');
assert.ok(js.includes('Посмотреть статистику'), 'secondary analytics action is missing');
assert.ok(js.includes('product-command-card'), 'commercial hero dashboard is missing');
assert.ok(!js.includes('Книги под контролем'), 'old marketing slogan remained in the controller');
assert.ok(!js.includes('product-proof-chip'), 'marketing proof chips remained in the controller');
assert.ok(js.includes('maybeShowWelcome'), 'first-run experience is missing');
assert.ok(js.includes('bibliotech_product_welcome_v1_'), 'first-run state is not persisted per user');
assert.ok(js.includes('removeLegacySecondaryProfile'), 'legacy secondary-page profile cleanup is missing');
assert.ok(js.includes("window.location.href = 'home.html#profile'"), 'secondary pages do not lead to the full profile');
assert.ok(js.includes("document.querySelectorAll('.wrapper > footer')"), 'footer polish must target only the page footer');
assert.ok(!js.includes("document.querySelectorAll('footer')"), 'global footer selector would destroy modal action bars');
assert.ok(!js.includes('themePresetGrid'), 'product polish must not duplicate theme controls');

assert.ok(pwa.includes('product-polish.js?v=20260710-product-polish-2'), 'PWA does not load updated product polish JavaScript');
assert.ok(pwa.includes('product-polish.css?v=20260710-product-polish-1'), 'PWA does not load product polish CSS');
assert.ok(pwa.includes('home-minimal.css?v=20260710-home-minimal-1'), 'PWA does not load minimal home CSS');
assert.ok(pwa.includes('commercial-polish.css?v=20260710-commercial-polish-1'), 'PWA does not load final commercial CSS');
assert.ok(pwa.includes('apple-polish.css?v=20260711-apple-polish-4'), 'PWA does not load final Apple CSS');
assert.ok(!pwa.includes('hero-empty-space.css'), 'obsolete empty hero patch is still loaded');
assert.ok(!pwa.includes('profile-hide-theme-badge.css'), 'theme status is still hidden by an obsolete patch');
assert.ok(pwa.includes('book-metadata.js?v=20260713-book-metadata-3'), 'PWA does not load ISBN metadata JavaScript');
assert.ok(pwa.includes('book-metadata.css?v=20260713-book-metadata-3'), 'PWA does not load ISBN metadata CSS');
assert.ok(pwa.includes('reservation-queue.js?v=20260710-reservation-queue-1'), 'PWA does not load reservation JavaScript');
assert.ok(pwa.includes('reservation-queue.css?v=20260710-reservation-queue-1'), 'PWA does not load reservation CSS');
assert.ok(pwa.indexOf('reservation-queue.js') < pwa.indexOf('card-rent-safe.js'), 'reservation controller must load before card actions');
assert.ok(pwa.indexOf('profile-rentals.js') < pwa.indexOf('profile-reservations.js'), 'profile reservations must load after rental profile');
assert.ok(pwa.indexOf('product-polish.css') < pwa.indexOf('home-minimal.css'), 'minimal home CSS must load after global product polish');
assert.ok(pwa.indexOf('liquid-theme-toggle.css') < pwa.indexOf('commercial-polish.css'), 'commercial CSS must be loaded last');
assert.ok(pwa.indexOf('commercial-polish.css') < pwa.indexOf('apple-polish.css'), 'Apple CSS must load after commercial CSS');

assert.ok(server.includes("'/css/home-minimal.css?v=20260710-home-minimal-1'"), 'server does not preload minimal home CSS');
assert.ok(server.includes("'/css/commercial-polish.css?v=20260710-commercial-polish-1'"), 'server does not preload commercial CSS');
assert.ok(server.includes("'/css/apple-polish.css?v=20260711-apple-polish-4'"), 'server does not preload Apple CSS');
assert.ok(server.includes("'/css/book-metadata.css?v=20260713-book-metadata-3'"), 'server does not preload ISBN metadata CSS');
assert.ok(server.includes("'/css/reservation-queue.css?v=20260710-reservation-queue-1'"), 'server does not preload reservation CSS');
assert.ok(server.includes("'/js/reservation-queue.js?v=20260710-reservation-queue-1'"), 'server does not preload reservation JavaScript');
assert.ok(server.includes("'/js/profile-reservations.js?v=20260710-profile-reservations-1'"), 'server does not preload profile reservations');
assert.ok(server.includes("'/js/product-polish.js?v=20260710-product-polish-2'"), 'server does not preload updated product polish JavaScript');
assert.ok(server.includes('<h1>Каталог библиотеки</h1>'), 'server does not replace the old hero title before first paint');
assert.ok(server.includes('critical-ui-11'), 'initial HTML cache-busting was not updated');

assert.ok(catalogRoute.includes('b.cover_data_url'), 'catalog list must return book covers');
assert.ok(catalogRoute.includes('c.text ILIKE'), 'catalog search must include comment text');
assert.ok(!catalogRoute.includes('isDemoBook'), 'server catalog must not hide real books by demo-like titles');
assert.ok(!catalogRoute.includes('.filter(book => !isDemoBook(book))'), 'catalog and statistics can diverge because server books are filtered');
assert.ok(!catalogFix.includes('removeHomeAdminPanel'), 'catalog compatibility controller must preserve the admin dashboard');
assert.ok(!catalogFix.includes('books.filter(book => !isDemo(book))'), 'catalog compatibility controller must not remove API books');
assert.ok(catalogFix.includes('requestBookCover'), 'legacy lazy cover fallback is missing');
assert.ok(catalogFix.includes("img.loading = 'lazy'"), 'catalog cover compatibility must preserve lazy loading');

const resetRequestCount = [authRoute, resetEmailRoute]
    .reduce((total, source) => total + (source.match(/router\.post\('\/password-reset\/request'/g) || []).length, 0);
assert.equal(resetRequestCount, 1, 'password reset request route is shadowed by a duplicate handler');
assert.ok(server.indexOf("app.use('/api/auth', authRoutes)") < server.indexOf("app.use('/api/auth', passwordResetEmailRoutes)"), 'password reset route mount order is ambiguous');
assert.ok(resetEmailRoute.includes("process.env.NODE_ENV !== 'production'"), 'development password reset fallback is missing');
assert.ok(resetEmailRoute.includes('devCode: code'), 'configured-database development reset code is not returned');
assert.ok(resetEmailRoute.includes('devCode: fallback ? fallback.code : undefined'), 'JSON fallback development reset code is not returned');
assert.ok(authRoute.includes('session_version = COALESCE(session_version, 1) + 1'), 'PostgreSQL password reset does not revoke existing sessions');
assert.ok(localStore.includes('user.session_version = Number(user.session_version || 1) + 1'), 'JSON password reset does not revoke existing sessions');

assert.match(sw, /const CACHE_NAME = 'bibliotech-pwa-v\d[^']*'/, 'PWA cache has no versioned name');
assert.ok(sw.includes("'/css/home-minimal.css'"), 'PWA shell does not cache minimal home CSS');
assert.ok(sw.includes("'/css/reservation-queue.css'"), 'PWA shell does not cache reservation CSS');
assert.ok(sw.includes("'/js/reservation-queue.js'"), 'PWA shell does not cache reservation JavaScript');
assert.ok(sw.includes("'/js/profile-reservations.js'"), 'PWA shell does not cache profile reservations');
assert.ok(sw.includes("'/js/product-polish.js'"), 'PWA shell does not cache product polish JavaScript');
assert.ok(sw.includes("'/css/commercial-polish.css'"), 'PWA shell does not cache commercial CSS');
assert.ok(sw.includes("'/css/apple-polish.css'"), 'PWA shell does not cache Apple CSS');
assert.ok(sw.includes("cache.match(request, { ignoreSearch: true })"), 'versioned offline assets are not matched safely');
assert.ok(sw.includes('return Response.error()'), 'offline asset failures still return HTML to scripts or styles');

assert.ok(appJs.includes('function authToken()'), 'API requests do not refresh rotated auth tokens');
assert.ok(!appJs.includes("params.append('search', state.search)"), 'server exact search still disables client fuzzy matching');
assert.ok(appJs.includes('renderBooks({ updateDashboard: false })'), 'instant client search is missing');
assert.ok(appJs.includes('compressImageFile'), 'image optimization is missing');
assert.ok(appJs.includes('изменения не применены'), 'failed writes still look successful offline');

console.log('Product polish check OK: product UI, complete catalog, password reset, session revocation, mobile and PWA contracts validated.');
