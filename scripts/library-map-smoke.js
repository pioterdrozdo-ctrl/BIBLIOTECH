'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
let adminToken = '';

async function authenticateSmokeAdmin() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'GreenScreen' })
    });
    assert.equal(response.status, 200, 'Smoke admin login failed');
    adminToken = (await response.json()).token;
    assert.ok(adminToken, 'Smoke admin token is missing');
}

async function setSession(page, role = 'admin') {
    await page.addInitScript(({ role, token }) => {
        const session = { id: 1, username: role === 'admin' ? 'Map Admin' : 'Map Reader', role, guest: false };
        localStorage.setItem('bibliotech_current_user', JSON.stringify(session));
        localStorage.setItem('token', token);
        localStorage.setItem(`bibliotech_product_welcome_v1_${session.username.toLowerCase()}`, '1');
    }, { role, token: adminToken });
}

function collectErrors(page, label, errors) {
    page.on('pageerror', error => errors.push(`${label}: ${error.stack || error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
    });
    page.on('requestfailed', request => {
        const errorText = request.failure()?.errorText || 'unknown';
        if (errorText.includes('ERR_ABORTED')) return;
        errors.push(`${label}: request failed ${request.url()} (${errorText})`);
    });
}

async function waitForMap(page) {
    await page.waitForFunction(() => window.BibliotechExactFloorMap?.getState().semantic
        && document.querySelectorAll('#semanticFloorSvg .semantic-room').length >= 70);
}

async function checkDesktop(browser, errors) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    collectErrors(page, 'desktop', errors);
    await setSession(page);
    const response = await page.goto(`${baseUrl}/map.html`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200);
    await waitForMap(page);

    assert.equal(await page.locator('#semanticFloorSvg').count(), 1, 'semantic SVG map is missing');
    assert.ok(await page.locator('#semanticFloorSvg .semantic-room').count() >= 70, 'reconstructed map has too few semantic rooms');
    assert.ok(await page.locator('#semanticFloorSvg [data-building]').count() >= 8, 'reconstructed campus is missing buildings');
    assert.equal(await page.locator('#semanticFloorSvg image').count(), 0, 'semantic map embeds a screenshot');
    assert.equal(await page.locator('#semanticFloorSvg .semantic-room--target[data-room="125"]').count(), 1, 'semantic room 125 is missing');
    assert.equal(await page.locator('#room125ExactMarker').count(), 0, 'duplicate HTML room 125 overlay returned');
    assert.equal(await page.locator('#semanticRoom125[role="button"][tabindex="0"]').count(), 1, 'room 125 is not an accessible map target');
    assert.equal(await page.locator('.exact-floor-view-switcher [role="tab"]').count(), 4, 'map view switcher is incomplete');
    assert.equal(await page.locator('[data-floor-view="overview"][aria-selected="true"]').count(), 1, 'overview is not selected initially');
    const lightRoomFill = await page.locator('#semanticFloorSvg .semantic-room:not(.semantic-room--target) .semantic-room-shape').first().evaluate(element => getComputedStyle(element).fill);
    const darkRoomFill = await page.locator('#semanticFloorSvg .semantic-room:not(.semantic-room--target) .semantic-room-shape').first().evaluate(element => {
        window.BibliotechTheme.setMode('dark', { persist: false });
        return getComputedStyle(element).fill;
    });
    assert.notEqual(darkRoomFill, lightRoomFill, 'semantic rooms do not adapt to the active theme');

    const headerMetrics = await page.locator('#navMenu').evaluate(element => ({
        radius: parseFloat(getComputedStyle(element).borderRadius),
        language: Boolean(document.getElementById('languageSwitcher')),
        logout: Boolean(document.getElementById('logoutBtn')),
        items: element.querySelectorAll(':scope > ul > li').length,
        rightInset: Math.round(element.getBoundingClientRect().right - element.querySelector(':scope > ul > li:last-child').getBoundingClientRect().right)
    }));
    assert.ok(headerMetrics.radius >= 12, 'desktop navigation panel is still square');
    assert.equal(headerMetrics.language, true, 'map header lost the shared language control');
    assert.equal(headerMetrics.logout, true, 'map header lost the shared logout control');
    assert.equal(headerMetrics.items, 8, 'map header does not match the shared navigation structure');
    assert.ok(headerMetrics.rightInset >= 7, 'last header item touches the rounded navigation edge');

    const shellOverlap = await page.evaluate(() => {
        const overlapArea = (first, second) => {
            const a = first.getBoundingClientRect();
            const b = second.getBoundingClientRect();
            return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
                * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        };
        const south = document.querySelector('[data-shell="south-main"]');
        const east = document.querySelector('[data-shell="east"]');
        const west = document.querySelector('#west-wing-lower .semantic-building-shell');
        return { southEast: overlapArea(south, east), southWest: overlapArea(south, west) };
    });
    assert.deepEqual(shellOverlap, { southEast: 0, southWest: 0 }, 'map building shells overlap');

    const zoomBefore = await page.locator('#exactFloorZoomValue').textContent();
    await page.locator('#exactFloorZoomIn').click();
    assert.notEqual(await page.locator('#exactFloorZoomValue').textContent(), zoomBefore, 'map zoom did not change');
    await page.locator('#exactFloorFit').click();
    for (let index = 0; index < 12; index += 1) {
        if (await page.locator('#exactFloorZoomOut').isDisabled()) break;
        await page.locator('#exactFloorZoomOut').click();
    }
    assert.ok(await page.evaluate(() => window.BibliotechExactFloorMap.getState().scale <= 0.11), 'map cannot zoom out to 10%');
    assert.equal(await page.locator('#exactFloorPlan').evaluate(element => element.classList.contains('is-map-mini')), true, 'tiny map labels are not compacted');
    await page.locator('[data-floor-view="north"]').click();
    assert.equal(await page.locator('[data-floor-view="north"]').getAttribute('aria-selected'), 'true');
    assert.equal(await page.evaluate(() => window.BibliotechExactFloorMap.getState().activeView), 'north', 'north map region did not open');

    await page.locator('#exactFloorRoom125').click();
    await page.waitForFunction(() => window.BibliotechExactFloorMap.getState().activeView === 'room125');
    assert.equal(await page.locator('#semanticRoom125').evaluate(element => element.classList.contains('is-active')), true, 'room 125 highlight did not activate');
    assert.match(await page.locator('#exactFloorViewTitle').textContent(), /125/);
    if (process.env.MAP_SCREENSHOT_PATH) {
        await page.screenshot({ path: process.env.MAP_SCREENSHOT_PATH, timeout: 60000 });
    }
    await page.close();
}

async function checkBookDeepLink(browser, errors) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    collectErrors(page, 'deep-link', errors);
    await setSession(page);
    await page.goto(`${baseUrl}/map.html?book=2`, { waitUntil: 'domcontentloaded' });
    await waitForMap(page);
    await page.waitForFunction(() => window.BibliotechExactFloorMap.getState().activeView === 'room125');
    assert.match(await page.locator('#targetBookMessage').textContent(), /№2/);
    assert.equal(await page.locator('#targetBookMessage').isVisible(), true);
    assert.equal(await page.locator('#room125StorageLink').getAttribute('href'), 'map-lite.html?book=2');
    await page.close();
}

async function checkMobile(browser, errors) {
    const page = await browser.newPage({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    collectErrors(page, 'mobile', errors);
    await setSession(page, 'user');
    await page.goto(`${baseUrl}/map.html`, { waitUntil: 'domcontentloaded' });
    await waitForMap(page);
    const metrics = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        viewportHeight: document.getElementById('exactFloorViewport')?.getBoundingClientRect().height || 0,
        viewColumns: getComputedStyle(document.querySelector('.exact-floor-view-switcher')).gridTemplateColumns.split(' ').length,
        semanticMaps: document.querySelectorAll('#semanticFloorSvg').length,
        semanticRooms: document.querySelectorAll('#semanticFloorSvg .semantic-room').length
    }));
    assert.equal(metrics.innerWidth, 360);
    assert.ok(metrics.scrollWidth <= 360, `Mobile layout overflows to ${metrics.scrollWidth}px`);
    assert.ok(metrics.viewportHeight >= 450, 'Mobile vector map has an unusably small touch target');
    assert.equal(metrics.viewColumns, 2, 'Mobile view buttons are not arranged in two columns');
    assert.equal(metrics.semanticMaps, 1, 'Semantic map is missing on mobile');
    assert.ok(metrics.semanticRooms >= 70, 'Semantic rooms are missing on mobile');
    await page.close();
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
    await cards.first().click();
    await page.waitForSelector('#viewModal.active');
    const bookId = await page.locator('#viewModal').getAttribute('data-book-id');
    await Promise.all([
        page.waitForURL(url => url.pathname.endsWith('/map.html') && url.searchParams.get('book') === bookId),
        page.locator('#showBookOnMapButton').click()
    ]);
    await page.close();
}

(async () => {
    const errors = [];
    await authenticateSmokeAdmin();
    const browser = await chromium.launch({
        headless: true,
        ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {})
    });
    try {
        await checkDesktop(browser, errors);
        await checkBookDeepLink(browser, errors);
        await checkMobile(browser, errors);
        await checkCatalogIntegration(browser, errors);
        assert.deepEqual(errors, [], `Browser errors:\n${errors.join('\n')}`);
        console.log('Library map smoke OK: semantic SVG reconstruction, theme adaptation, room 125, zoom, deep link, mobile and catalog integration work.');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
