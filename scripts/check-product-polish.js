'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'frontend/css/product-polish.css'), 'utf8');
const homeCss = fs.readFileSync(path.join(root, 'frontend/css/home-minimal.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'frontend/js/product-polish.js'), 'utf8');
const pwa = fs.readFileSync(path.join(root, 'frontend/js/pwa.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'frontend/sw.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');

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
assert.ok(css.includes('.auth-product-shell'), 'auth product layout is missing');
assert.ok(css.includes('.product-hero-actions'), 'home hero actions are not styled');
assert.ok(css.includes('.product-welcome-modal'), 'first-run experience is not styled');
assert.ok(css.includes('.admin-users-table'), 'admin interface is not covered by the design system');
assert.ok(css.includes('.book-card'), 'catalog cards are not covered by the design system');
assert.ok(css.includes('@media (max-width: 560px)'), 'phone polish is missing');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion support is missing');

assert.ok(homeCss.includes('.hero-wow .hero-content'), 'minimal hero layout is missing');
assert.ok(homeCss.includes('.product-proof-strip'), 'marketing chip suppression is missing');
assert.ok(homeCss.includes('#openAddBookBtnHero'), 'duplicate hero add-book suppression is missing');
assert.ok(homeCss.includes('@media (max-width: 700px)'), 'minimal mobile hero layout is missing');

assert.ok(js.includes('enhanceAuthPage'), 'auth first impression is missing');
assert.ok(js.includes('enhanceHomeHero'), 'home refinement is missing');
assert.ok(js.includes("title.textContent = 'Каталог библиотеки'"), 'minimal hero title is missing');
assert.ok(js.includes("copy.textContent = 'Поиск, выдача и учёт книг в одном месте.'"), 'direct hero description is missing');
assert.ok(js.includes('legacyButton?.remove()'), 'duplicate add-book action is not removed');
assert.ok(js.includes('Перейти к книгам'), 'single catalog action is missing');
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
assert.ok(pwa.indexOf('product-polish.css') < pwa.indexOf('home-minimal.css'), 'minimal home CSS must load after global product polish');

assert.ok(server.includes("'/css/home-minimal.css?v=20260710-home-minimal-1'"), 'server does not preload minimal home CSS');
assert.ok(server.includes("'/js/product-polish.js?v=20260710-product-polish-2'"), 'server does not preload updated product polish JavaScript');
assert.ok(server.includes('<h1>Каталог библиотеки</h1>'), 'server does not replace the old hero title before first paint');
assert.ok(server.includes('critical-ui-8'), 'initial HTML cache-busting was not updated');

assert.ok(sw.includes("CACHE_NAME = 'bibliotech-pwa-v24'"), 'PWA cache was not invalidated');
assert.ok(sw.includes("'/css/home-minimal.css'"), 'PWA shell does not cache minimal home CSS');
assert.ok(sw.includes("'/js/product-polish.js'"), 'PWA shell does not cache product polish JavaScript');

console.log('Product polish check OK: minimal home, auth, first-run, catalog, admin, modal footers, mobile and PWA integration validated.');
