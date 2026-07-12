'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
let adminToken = '';

async function setSession(page, role = 'admin') {
    await page.addInitScript(({ role, token }) => {
        const session = { id: 1, username: role === 'admin' ? 'Map Admin' : 'Map Reader', role, guest: false };
        localStorage.setItem('bibliotech_current_user', JSON.stringify(session));
        if (token) localStorage.setItem('token', token);
        localStorage.setItem(`bibliotech_product_welcome_v1_${session.username.toLowerCase()}`, '1');
        const nativeRaf = window.requestAnimationFrame.bind(window);
        window.__mapSmokeRafCount = 0;
        window.requestAnimationFrame = callback => {
            window.__mapSmokeRafCount += 1;
            return nativeRaf(callback);
        };
    }, { role, token: adminToken });
}

async function authenticateSmokeAdmin() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'GreenScreen' })
    });
    assert.equal(response.status, 200, 'Smoke admin login failed');
    const payload = await response.json();
    assert.ok(payload.token, 'Smoke admin token is missing');
    adminToken = payload.token;
}

function collectErrors(page, label, errors) {
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
    });
}

async function waitForMap(page) {
    await page.waitForFunction(() => {
        const loading = document.getElementById('mapLoading');
        const canvas = document.querySelector('#mapCanvasHost canvas');
        const fallback = document.getElementById('map2dFallback');
        return loading?.classList.contains('hidden') && (canvas || !fallback?.classList.contains('hidden'));
    }, null, { timeout: 15000 });
}

async function checkDesktop(browser, errors) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    collectErrors(page, 'desktop', errors);
    await setSession(page);
    const response = await page.goto(`${baseUrl}/map.html`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200);
    await waitForMap(page);
    assert.equal(await page.locator('#mapCanvasHost canvas').count(), 1, '3D canvas is missing');
    assert.equal(await page.locator('.map-location-button').count(), 2, 'Room 125 must contain two storage controls');
    assert.equal(await page.locator('#mapAdminPanel:not(.hidden)').count(), 1, 'Admin map panel is not integrated');

    await page.locator('#enterRoomButton').click();
    await page.locator('.map-location-button[data-location-id="1"]').click();
    assert.equal(await page.locator('#mapSelectionPanel .map-book-row').count(), 3, 'Storage place books did not open');
    await page.locator('#mapSearchInput').fill('1984');
    assert.equal(await page.locator('#mapSearchResult').textContent(), '1 книг', 'Local book search did not find the expected book');
    assert.equal(await page.locator('.map-location-button:not([hidden])').count(), 1, 'Search did not narrow storage places');
    await page.locator('#toggleMapEditButton').click();
    assert.equal(await page.locator('#mapAdminObjectSelect option').count(), 10, 'Admin object picker is incomplete');
    await page.locator('#mapAdminObjectSelect').selectOption('1');
    assert.equal(await page.locator('[data-map-field="x"]').isEnabled(), true, 'Admin coordinates are not editable');

    await page.waitForTimeout(900);
    const beforeIdle = await page.evaluate(() => window.__mapSmokeRafCount);
    await page.waitForTimeout(500);
    const afterIdle = await page.evaluate(() => window.__mapSmokeRafCount);
    assert.equal(afterIdle - beforeIdle, 0, 'Map keeps requesting animation frames while idle');
    await page.close();
}

async function checkBookDeepLink(browser, errors) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    collectErrors(page, 'deep-link', errors);
    await setSession(page);
    await page.goto(`${baseUrl}/map.html?book=2`, { waitUntil: 'domcontentloaded' });
    await waitForMap(page);
    await page.waitForFunction(() => document.querySelector('.map-location-button.target .place-number')?.textContent === '12');
    assert.match(await page.locator('#targetBookMessage').textContent(), /Искомая книга/);
    assert.equal(await page.locator('.target-book-row').count(), 1, 'Target book is not marked in the storage list');
    await page.close();
}

async function checkMobile(browser, errors) {
    const page = await browser.newPage({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    collectErrors(page, 'mobile', errors);
    await setSession(page, 'user');
    await page.goto(`${baseUrl}/map.html?book=2`, { waitUntil: 'domcontentloaded' });
    await waitForMap(page);
    const metrics = await page.evaluate(() => {
        const canvas = document.querySelector('#mapCanvasHost canvas');
        const cssWidth = canvas?.getBoundingClientRect().width || 1;
        return {
            innerWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            toolbarWidth: document.querySelector('.map-toolbar')?.getBoundingClientRect().width || 0,
            canvasRatio: canvas ? canvas.width / cssWidth : 0,
            sceneHeight: document.getElementById('mapSceneShell')?.getBoundingClientRect().height || 0
        };
    });
    assert.equal(metrics.innerWidth, 360);
    assert.ok(metrics.scrollWidth <= 360, `Mobile layout overflows to ${metrics.scrollWidth}px`);
    assert.ok(metrics.toolbarWidth <= metrics.innerWidth, `Mobile toolbar is too wide: ${metrics.toolbarWidth}px`);
    assert.ok(metrics.canvasRatio <= 1.05, `Mobile renderer pixel ratio is too high: ${metrics.canvasRatio}`);
    assert.ok(metrics.sceneHeight >= 400, 'Mobile scene has an unusably small touch target');
    await page.close();
}

async function checkFallback(browser, errors) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/vendor/three/**', route => route.abort());
    const page = await context.newPage({ viewport: { width: 900, height: 700 } });
    await setSession(page, 'user');
    page.on('pageerror', error => {
        if (!/Failed to fetch dynamically imported module/i.test(error.message)) errors.push(`fallback: ${error.message}`);
    });
    await page.goto(`${baseUrl}/map.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.getElementById('map2dFallback')?.classList.contains('hidden'));
    assert.equal(await page.locator('#map2dFallback .fallback-storage').count(), 2, '2D fallback has no storage zones');
    assert.equal(await page.locator('#mapCanvasHost:not(.hidden)').count(), 0, 'Broken WebGL canvas remained visible');
    await context.close();
}

async function checkCatalogIntegration(browser, errors) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    collectErrors(page, 'catalog', errors);
    await setSession(page);
    await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.book-card');
    assert.equal(await page.locator('a[href="map.html"]').count(), 1, 'Map navigation is missing or duplicated');
    assert.equal(await page.locator('#showBookOnMapButton').count(), 1, 'Book map launcher is missing or duplicated');
    const cards = page.locator('.book-card');
    assert.ok(await cards.count() > 0, 'Catalog books disappeared');
    await cards.first().click();
    await page.waitForSelector('#viewModal.active');
    const bookId = await page.locator('#viewModal').getAttribute('data-book-id');
    assert.ok(Number(bookId) > 0, 'Book card did not expose a safe numeric ID to the map launcher');
    await Promise.all([
        page.waitForURL(url => url.pathname.endsWith('/map.html') && url.searchParams.get('book') === bookId),
        page.locator('#showBookOnMapButton').click()
    ]);
    await page.close();
}

(async () => {
    const errors = [];
    await authenticateSmokeAdmin();
    const browser = await chromium.launch({ headless: true });
    try {
        await checkDesktop(browser, errors);
        await checkBookDeepLink(browser, errors);
        await checkMobile(browser, errors);
        await checkFallback(browser, errors);
        await checkCatalogIntegration(browser, errors);
        assert.deepEqual(errors, [], `Browser errors:\n${errors.join('\n')}`);
        console.log('Library map smoke OK: desktop, 360px mobile, deep link, idle renderer, SVG fallback and catalog integration validated.');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
