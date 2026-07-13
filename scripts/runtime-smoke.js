'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const pageErrors = [];
const criticalFailures = [];
let adminToken = '';

async function authenticateSmokeAdmin() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'GreenScreen' })
    });
    assert.equal(response.status, 200, 'Runtime admin login failed');
    adminToken = (await response.json()).token;
    assert.ok(adminToken, 'Runtime admin token is missing');
}

function sameOrigin(url) {
    try { return new URL(url).origin === new URL(baseUrl).origin; }
    catch { return false; }
}

function attachDiagnostics(page, label) {
    page.on('pageerror', error => pageErrors.push(`${label}: ${error.stack || error.message}`));
    page.on('requestfailed', request => {
        if (!sameOrigin(request.url())) return;
        const errorText = request.failure()?.errorText || 'unknown';
        if (errorText.includes('ERR_ABORTED')) return;
        if (['document', 'script', 'stylesheet'].includes(request.resourceType())) {
            criticalFailures.push(`${label}: failed ${request.resourceType()} ${request.url()} (${errorText})`);
        }
    });
    page.on('response', response => {
        if (!sameOrigin(response.url())) return;
        const type = response.request().resourceType();
        if (response.status() >= 400 && ['document', 'script', 'stylesheet'].includes(type)) {
            criticalFailures.push(`${label}: HTTP ${response.status()} for ${type} ${response.url()}`);
        }
    });
}

async function setSession(page, role = 'admin') {
    await page.addInitScript(({ role, token }) => {
        localStorage.setItem('bibliotech_language', 'ru');
        localStorage.setItem('bibliotech_current_user', JSON.stringify({
            id: role === 'admin' ? 1 : 2,
            username: role === 'admin' ? 'Smoke Admin' : 'Smoke User',
            role,
            guest: false
        }));
        localStorage.setItem('bibliotech_product_welcome_v1_smoke admin', '1');
        localStorage.setItem('bibliotech_product_welcome_v1_smoke user', '1');
        if (token) localStorage.setItem('token', token);
    }, { role, token: adminToken });
}

async function verifyHttpPages() {
    const pages = ['/', '/index.html', '/home.html', '/map.html', '/map-lite.html', '/stats.html', '/about.html', '/admin.html'];
    for (const pathname of pages) {
        const response = await fetch(`${baseUrl}${pathname}`);
        assert.ok(response.status < 400, `${pathname} returned ${response.status}`);
        const text = await response.text();
        assert.ok(text.includes('<!DOCTYPE html>'), `${pathname} did not return HTML`);
    }

    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200, 'Health endpoint failed');
    assert.equal((await health.json()).status, 'OK', 'Health endpoint is not OK');
}

async function verifyLoginPage(browser) {
    for (const viewport of [{ width: 1280, height: 820 }, { width: 390, height: 844 }]) {
        const label = viewport.width < 600 ? 'login-mobile' : 'login-desktop';
        const page = await browser.newPage({ viewport });
        attachDiagnostics(page, label);
        const response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
        assert.equal(response?.status(), 200, `${label}: page failed to load`);
        await page.waitForFunction(() => Boolean(window.BibliotechTheme) && Boolean(window.BibliotechProductPolish));
        await page.waitForSelector('.auth-container', { state: 'visible' });
        await page.waitForTimeout(500);

        assert.equal(await page.locator('.auth-product-story').count(), 0, `${label}: removed promotional block returned`);
        assert.equal(await page.locator('.auth-product-shell').count(), 0, `${label}: empty promotional shell remained`);
        assert.equal(await page.locator('.auth-container').isVisible(), true, `${label}: login form is not visible`);
        assert.equal(await page.locator('#passkeyLoginBtn, .passkey-login-btn').count(), 0, `${label}: separate passkey login button returned`);
        assert.match(await page.locator('#loginUsername').getAttribute('autocomplete') || '', /\bwebauthn\b/, `${label}: automatic passkey autocomplete is missing`);
        assert.equal(await page.locator('link[href*="product-polish.css"]').count(), 1, `${label}: product CSS is duplicated`);

        if (viewport.width < 600) {
            const box = await page.locator('.auth-container').boundingBox();
            assert.ok(box && box.width >= 330, `${label}: login form is too narrow (${box?.width})`);
        }
        await page.close();
    }
}

async function verifyAutomaticPasskey(browser) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    attachDiagnostics(page, 'automatic-passkey');
    await page.addInitScript(() => {
        class ConditionalPasskeyCredential {}
        ConditionalPasskeyCredential.isConditionalMediationAvailable = async () => true;
        Object.defineProperty(window, 'PublicKeyCredential', {
            configurable: true,
            value: ConditionalPasskeyCredential
        });
        Object.defineProperty(navigator, 'credentials', {
            configurable: true,
            value: {
                get(options) {
                    window.__automaticPasskeyRequest = {
                        mediation: options.mediation,
                        hasChallenge: options.publicKey?.challenge instanceof Uint8Array,
                        hasAbortSignal: Boolean(options.signal)
                    };
                    return new Promise(() => {});
                }
            }
        });
    });
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__automaticPasskeyRequest));
    assert.deepEqual(await page.evaluate(() => window.__automaticPasskeyRequest), {
        mediation: 'conditional',
        hasChallenge: true,
        hasAbortSignal: true
    }, 'Passkey did not start automatically with conditional mediation');
    assert.equal(await page.locator('#passkeyLoginBtn, .passkey-login-btn').count(), 0, 'Automatic passkey flow rendered a button');
    await page.close();
}

async function readNavigation(page, navSelector) {
    return page.locator(navSelector).evaluate(nav => {
        const result = {};
        nav.querySelectorAll('a[href]').forEach(link => {
            const rawHref = link.getAttribute('href') || '';
            if (!rawHref || rawHref.startsWith('#')) return;
            const href = new URL(rawHref, document.baseURI).pathname;
            if (href.endsWith('/home.html')) result.home = link.textContent.trim();
            if (href.endsWith('/map.html')) result.map = link.textContent.trim();
            if (href.endsWith('/stats.html')) result.stats = link.textContent.trim();
            if (href.endsWith('/about.html')) result.about = link.textContent.trim();
            if (href.endsWith('/admin.html')) result.admin = link.textContent.trim();
        });
        return result;
    });
}

function assertRussianNavigation(labels, label) {
    assert.equal(labels.home, 'Главная', `${label}: wrong home label`);
    assert.equal(labels.map, 'Карта', `${label}: map is mislabeled`);
    assert.equal(labels.stats, 'Статистика', `${label}: statistics is mislabeled`);
    assert.equal(labels.about, 'О нас', `${label}: about is mislabeled`);
    assert.equal(labels.admin, 'Админ', `${label}: admin is mislabeled`);
}

async function verifyStandardPageNavigation(browser, pathname, activeHref) {
    const label = pathname.replace(/[/.]/g, '') || 'home';
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await setSession(page, 'admin');
    attachDiagnostics(page, label);

    const response = await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200, `${pathname}: page failed to load`);
    await page.waitForSelector('#navMenu', { state: 'attached' });
    await page.waitForFunction(() => document.querySelector('#navMenu a[href="map.html"]')?.textContent.trim() === 'Карта');

    const menuButton = page.locator('#menuIcon');
    if (await menuButton.count()) {
        await menuButton.click();
        await page.waitForFunction(() => document.getElementById('navMenu')?.classList.contains('active'));
    }

    assertRussianNavigation(await readNavigation(page, '#navMenu'), pathname);
    assert.equal(await page.locator(`#navMenu a[href="${activeHref}"]`).getAttribute('aria-current'), 'page', `${pathname}: active page is wrong`);

    const duplicateAbout = await page.locator('#navMenu a[href="about.html"]', { hasText: 'О нас' }).count();
    assert.equal(duplicateAbout, 1, `${pathname}: about link is duplicated`);

    await page.close();
}

async function verifyLanguageSwitch(browser) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await setSession(page, 'admin');
    attachDiagnostics(page, 'language-switch');
    await page.goto(`${baseUrl}/stats.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#navMenu', { state: 'attached' });

    await page.evaluate(() => document.querySelector('.lang-option[data-lang="en"]')?.click());
    await page.waitForFunction(() => document.querySelector('#navMenu a[href="map.html"]')?.textContent.trim() === 'Map');
    const english = await readNavigation(page, '#navMenu');
    assert.deepEqual(
        { home: english.home, map: english.map, stats: english.stats, about: english.about, admin: english.admin },
        { home: 'Home', map: 'Map', stats: 'Statistics', about: 'About', admin: 'Admin' },
        'Language switch corrupted navigation order'
    );

    await page.evaluate(() => document.querySelector('.lang-option[data-lang="ru"]')?.click());
    await page.waitForFunction(() => document.querySelector('#navMenu a[href="map.html"]')?.textContent.trim() === 'Карта');
    assertRussianNavigation(await readNavigation(page, '#navMenu'), 'language-switch-back');
    await page.close();
}

async function verifyMapPages(browser) {
    const mapPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await setSession(mapPage, 'admin');
    attachDiagnostics(mapPage, 'map-mobile-vector');
    const response = await mapPage.goto(`${baseUrl}/map.html`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200, 'Vector map page failed to load');
    await mapPage.waitForFunction(() => window.BibliotechExactFloorMap?.getState().semantic
        && document.querySelectorAll('#semanticFloorSvg .semantic-room').length >= 70);
    assert.equal(await mapPage.locator('#semanticFloorSvg').count(), 1, 'Semantic SVG map is missing');
    assert.ok(await mapPage.locator('#semanticFloorSvg .semantic-room').count() >= 70, 'Semantic map has too few reconstructed rooms');
    assert.equal(await mapPage.locator('#semanticFloorSvg image').count(), 0, 'Semantic map embeds a screenshot');
    assert.equal(await mapPage.locator('#mapCanvasHost').count(), 0, 'Legacy WebGL canvas returned');
    assert.equal(await mapPage.locator('.exact-floor-view-switcher [role="tab"]').count(), 4, 'Semantic map region switcher is incomplete');
    assertRussianNavigation(await readNavigation(mapPage, '#navMenu'), 'map-mobile-vector');

    await mapPage.locator('#menuIcon').click();
    assert.equal(await mapPage.locator('#navMenu').evaluate(nav => nav.classList.contains('active')), true, 'Map mobile menu did not open');
    await mapPage.keyboard.press('Escape');
    assert.equal(await mapPage.locator('#navMenu').evaluate(nav => nav.classList.contains('active')), false, 'Map mobile menu did not close on Escape');
    await mapPage.locator('[data-floor-view="room125"]').click();
    assert.equal(await mapPage.locator('[data-floor-view="room125"]').getAttribute('aria-selected'), 'true', 'Room 125 view did not open');
    await mapPage.locator('#menuIcon').click();
    await mapPage.locator('#currentUserPill').click();
    await mapPage.waitForURL(/\/home\.html#profile$/);
    await mapPage.close();

    const mapDataResponse = await fetch(`${baseUrl}/api/library-map/room/125`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(mapDataResponse.status, 200, 'Map data endpoint failed');
    const mapData = await mapDataResponse.json();
    const targetBook = Array.isArray(mapData.books) ? mapData.books[0] : null;
    assert.ok(targetBook?.id, 'Map has no book for deep-link verification');

    const bookMapPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await setSession(bookMapPage, 'admin');
    attachDiagnostics(bookMapPage, 'storage-map-book-deep-link');
    await bookMapPage.goto(`${baseUrl}/map-lite.html?book=${encodeURIComponent(targetBook.id)}`, { waitUntil: 'domcontentloaded' });
    await bookMapPage.waitForSelector('#mapLiteContent:not(.hidden)');
    assert.match(await bookMapPage.locator('.map-lite-heading h1').textContent(), /Место книги на карте/);
    assert.ok(await bookMapPage.locator('#mapLiteSvg .map-lite-storage').count() > 0, 'Storage map has no interactive locations');
    assert.equal(await bookMapPage.locator('img[src*="tushino-floor-"]').count(), 0, 'Storage map still references removed screenshot assets');
    assert.equal(
        await bookMapPage.locator('.map-lite-back').getAttribute('href'),
        `home.html?book=${targetBook.id}`,
        'Map back link lost the selected book'
    );
    assert.equal(
        await bookMapPage.locator('#openFullMapLink').getAttribute('href'),
        `map.html?book=${targetBook.id}`,
        'Storage map did not preserve the selected book in the vector map link'
    );
    await bookMapPage.locator('#mapLiteMenuButton').click();
    assert.equal(await bookMapPage.locator('#mapLiteNav a[href="map.html"]').isVisible(), true, 'Vector floor map link is hidden');
    await bookMapPage.keyboard.press('Escape');
    assert.equal(await bookMapPage.locator('#mapLiteNav').evaluate(nav => nav.classList.contains('active')), false, 'Storage map menu did not close on Escape');
    await bookMapPage.close();
}

(async () => {
    await verifyHttpPages();
    await authenticateSmokeAdmin();
    const browser = await chromium.launch({
        headless: true,
        ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {})
    });

    try {
        await verifyLoginPage(browser);
        await verifyAutomaticPasskey(browser);
        await verifyStandardPageNavigation(browser, '/home.html', 'home.html#top');
        await verifyStandardPageNavigation(browser, '/stats.html', 'stats.html');
        await verifyStandardPageNavigation(browser, '/about.html', 'about.html');
        await verifyStandardPageNavigation(browser, '/admin.html', 'admin.html');
        await verifyLanguageSwitch(browser);
        await verifyMapPages(browser);
    } finally {
        await browser.close();
    }

    assert.deepEqual(criticalFailures, [], `Critical resource failures:\n${criticalFailures.join('\n')}`);
    assert.deepEqual(pageErrors, [], `Browser JavaScript errors:\n${pageErrors.join('\n')}`);
        console.log('Runtime smoke check OK: login, navigation, language switching, semantic themed map, storage map and book links work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
