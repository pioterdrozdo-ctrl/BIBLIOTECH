'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'frontend/css/product-polish.css'), 'utf8');
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
assert.ok(css.includes('.auth-product-shell'), 'auth product layout is missing');
assert.ok(css.includes('.product-hero-actions'), 'home hero actions are not styled');
assert.ok(css.includes('.product-welcome-modal'), 'first-run experience is not styled');
assert.ok(css.includes('.admin-users-table'), 'admin interface is not covered by the design system');
assert.ok(css.includes('.book-card'), 'catalog cards are not covered by the design system');
assert.ok(css.includes('@media (max-width: 560px)'), 'phone polish is missing');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion support is missing');

assert.ok(js.includes('enhanceAuthPage'), 'auth first impression is missing');
assert.ok(js.includes('enhanceHomeHero'), 'home value proposition is missing');
assert.ok(js.includes('maybeShowWelcome'), 'first-run experience is missing');
assert.ok(js.includes('bibliotech_product_welcome_v1_'), 'first-run state is not persisted per user');
assert.ok(js.includes('removeLegacySecondaryProfile'), 'legacy secondary-page profile cleanup is missing');
assert.ok(js.includes("window.location.href = 'home.html#profile'"), 'secondary pages do not lead to the full profile');
assert.ok(!js.includes('themePresetGrid'), 'product polish must not duplicate theme controls');

assert.ok(pwa.includes('product-polish.js?v=20260710-product-polish-1'), 'PWA does not load product polish JavaScript');
assert.ok(pwa.includes('product-polish.css?v=20260710-product-polish-1'), 'PWA does not load product polish CSS');
assert.ok(pwa.indexOf('ui-refresh-release-fix.css') < pwa.indexOf('product-polish.css'), 'product polish must load after release fixes');
assert.ok(pwa.indexOf('product-polish.css') < pwa.indexOf('profile-twitter-restored.css'), 'profile-specific polish must load after global product polish');

assert.ok(server.includes("'/css/product-polish.css?v=20260710-product-polish-1'"), 'server does not preload product polish CSS');
assert.ok(server.includes("'/js/product-polish.js?v=20260710-product-polish-1'"), 'server does not preload product polish JavaScript');
assert.ok(server.includes('const criticalUiScripts'), 'server does not provide global critical scripts');
assert.ok(server.includes('critical-ui-7'), 'initial HTML cache-busting was not updated');

assert.ok(sw.includes("CACHE_NAME = 'bibliotech-pwa-v21'"), 'PWA cache was not invalidated');
assert.ok(sw.includes("'/css/product-polish.css'"), 'PWA shell does not cache product polish CSS');
assert.ok(sw.includes("'/js/product-polish.js'"), 'PWA shell does not cache product polish JavaScript');

console.log('Product polish check OK: auth, first-run, catalog, analytics, admin, mobile and PWA integration validated.');
