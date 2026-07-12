'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const pageErrors = [];
const criticalFailures = [];

function sameOrigin(url) {
    try { return new URL(url).origin === new URL(baseUrl).origin; }
    catch { return false; }
}

function attachDiagnostics(page, label) {
    page.on('pageerror', error => pageErrors.push(`${label}: ${error.stack || error.message}`));
    page.on('requestfailed', request => {
        if (!sameOrigin(request.url())) return;
        if (['document', 'script', 'stylesheet'].includes(request.resourceType())) {
            criticalFailures.push(`${label}: failed ${request.resourceType()} ${request.url()} (${request.failure()?.errorText || 'unknown'})`);
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
    await page.addInitScript(({ role }) => {
        localStorage.setItem('bibliotech_language', 'ru');
        localStorage.setItem('bibliotech_current_user', JSON.stringify({
            id: role === 'admin' ? 1 : 2,
            username: role === 'admin' ? 'Smoke Admin' : 'Smoke User',
            role,
            guest: false
        }));
        localStorage.setItem('bibliotech_product_welcome_v1_smoke admin', '1');
        localStorage.setItem('bibliotech_product_welcome_v1_smoke user', '1');
    }, { role });
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
        assert.equal(await page.locator('link[href*="product-polish.css"]').count(), 1, `${label}: product CSS is duplicated`);

        if (viewport.width < 600) {
            const box = await page.locator('.auth-container').boundingBox();
            assert.ok(box && box.width >= 330, `${label}: login form is too narrow (${box?.width})`);
        }
        await page.close();
    }
}

async function readNavigation(page, navSelector) {
    return page.locator(navSelector).evaluate(nav => {
        const result = {};
        nav.querySelectorAll('a[href]').forEach(link => {
            const href = new URL(link.getAttribute('href'), document.baseURI).pathname;
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
    await page.waitForSelector('#navMenu');
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
    await page.waitForSelector('#navMenu');

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

async function verifyMapPage(browser) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await setSession(page, 'admin');
    attachDiagnostics(page, 'map-mobile');
    const response = await page.goto(`${baseUrl}/map.html`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200, 'Map page failed to load');
    await page.waitForSelector('#mapNav');
    await page.waitForFunction(() => document.querySelector('#mapNav a[href="map.html"]')?.textContent.trim() === 'Карта');
    assertRussianNavigation(await readNavigation(page, '#mapNav'), 'map-mobile');

    await page.locator('#mapMenuButton').click();
    assert.equal(await page.locator('#mapNav').evaluate(nav => nav.classList.contains('active')), true, 'Map mobile menu did not open');

    await page.waitForFunction(() => document.getElementById('mapCurrentUser')?.title === 'Открыть полноценный профиль');
    await page.locator('#mapCurrentUser').click();
    await page.waitForURL(/\/home\.html#profile$/);
    await page.close();
}

(async () => {
    await verifyHttpPages();
    const browser = await chromium.launch({
        headless: true,
        ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {})
    });

    try {
        await verifyLoginPage(browser);
        await verifyStandardPageNavigation(browser, '/home.html', 'home.html#top');
        await verifyStandardPageNavigation(browser, '/stats.html', 'stats.html');
        await verifyStandardPageNavigation(browser, '/about.html', 'about.html');
        await verifyStandardPageNavigation(browser, '/admin.html', 'admin.html');
        await verifyLanguageSwitch(browser);
        await verifyMapPage(browser);
    } finally {
        await browser.close();
    }

    assert.deepEqual(criticalFailures, [], `Critical resource failures:\n${criticalFailures.join('\n')}`);
    assert.deepEqual(pageErrors, [], `Browser JavaScript errors:\n${pageErrors.join('\n')}`);
    console.log('Runtime smoke check OK: login, mobile navigation, language switching, map and profile links work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
