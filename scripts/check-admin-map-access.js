'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const mapPage = read('frontend/map.html');
const mapLitePage = read('frontend/map-lite.html');
const homePage = read('frontend/home.html');
const accessGuard = read('frontend/js/admin-map-access.js');
const pwa = read('frontend/js/pwa.js');
const launcher = read('frontend/js/library-map-launcher.js');
const mapLite = read('frontend/js/library-map-lite.js');
const mapRoute = read('backend/routes/libraryMap.js');
const serviceWorker = read('frontend/sw.js');

for (const [label, source] of [['vector map', mapPage], ['storage map', mapLitePage]]) {
    assert.ok(source.includes('data-admin-map-access="pending"'), `${label} is visible before access verification`);
    assert.ok(source.includes('admin-map-access.js?v=20260713-admin-map-1'), `${label} does not load the admin access guard`);
}

assert.ok(homePage.includes('admin-map-nav-item hidden'), 'map navigation is visible by default');
assert.ok(pwa.includes('syncAdminMapLinks'), 'navigation does not react to the signed-in role');
assert.ok(launcher.includes('hasAdminMapAccess'), 'book card can expose the map to regular users');
assert.ok(accessGuard.includes("fetch('/api/library-map/access'"), 'page guard trusts only local browser role data');
assert.ok(accessGuard.includes('Authorization: `Bearer ${token}`'), 'page guard does not send the admin token');
assert.ok(mapLite.includes('Authorization: `Bearer ${token}`'), 'storage map does not authenticate data requests');
assert.match(mapRoute, /router\.get\('\/access', authMiddleware, isAdmin,/);
assert.match(mapRoute, /router\.get\('\/', authMiddleware, isAdmin,/);
assert.match(mapRoute, /router\.get\('\/room\/:roomCode', authMiddleware, isAdmin,/);
assert.match(mapRoute, /router\.get\('\/location\/:locationId', authMiddleware, isAdmin,/);
assert.ok(!serviceWorker.includes("'/map.html'"), 'admin map is still pre-cached in the public app shell');
assert.ok(!serviceWorker.includes("'/map-lite.html'"), 'admin storage map is still pre-cached in the public app shell');

console.log('Admin map access check OK: navigation, pages, launchers, API and public cache are restricted to administrators.');
