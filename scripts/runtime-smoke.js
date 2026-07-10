'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const criticalFailures = [];
const pageErrors = [];

function sameOrigin(url) {
    try { return new URL(url).origin === new URL(baseUrl).origin; }
    catch { return false; }
}

async function verifyHealth() {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200, `Health endpoint returned ${response.status}`);
    const payload = await response.json();
    assert.equal(payload.status, 'OK', 'Health endpoint is not OK');
}

async function attachDiagnostics(page, label) {
    page.on('pageerror', error => pageErrors.push(`${label}: ${error.stack || error.message}`));
    page.on('requestfailed', request => {
        if (!sameOrigin(request.url())) return;
        if (['document', 'script', 'stylesheet'].includes(request.resourceType())) {
            criticalFailures.push(`${label}: failed ${request.resourceType()} ${request.url()} (${request.failure()?.errorText || 'unknown'})`);
        }
    });
    page.on('response', response => {
        const request = response.request();
        if (!sameOrigin(response.url())) return;
        if (response.status() >= 400 && ['document', 'script', 'stylesheet'].includes(request.resourceType())) {
            criticalFailures.push(`${label}: HTTP ${response.status()} for ${request.resourceType()} ${response.url()}`);
        }
    });
}

async function setSession(page, role = 'admin') {
    await page.addInitScript(({ role }) => {
        localStorage.setItem('bibliotech_current_user', JSON.stringify({
            username: role === 'admin' ? 'Smoke Admin' : 'Smoke User',
            role,
            guest: false
        }));
    }, { role });
}

async function checkLoginPage(browser) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await attachDiagnostics(page, 'login');
    const response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200, 'Login page failed to load');
    await page.waitForSelector('body');
    assert.equal(await page.locator('script[src="js/theme-bootstrap.js"]').count(), 1, 'Theme bootstrap is missing on login page');
    await page.waitForFunction(() => Boolean(window.BibliotechTheme));
    await page.waitForTimeout(250);
    await page.close();
}

async function checkHomeAndProfile(browser) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await setSession(page, 'admin');
    await attachDiagnostics(page, 'home-desktop');

    const response = await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200, 'Home page failed to load');
    await page.waitForSelector('#currentUserPill', { state: 'visible' });
    await page.waitForFunction(() => Boolean(window.BibliotechTheme));
    await page.waitForTimeout(700);

    const beforeTheme = await page.evaluate(() => window.BibliotechTheme.getState());
    await page.locator('#floatingThemeToggle').click();
    const afterTheme = await page.evaluate(() => window.BibliotechTheme.getState());
    assert.equal(afterTheme.theme, beforeTheme.theme, 'Brightness toggle changed the selected palette');
    assert.notEqual(afterTheme.mode, beforeTheme.mode, 'Brightness toggle did not change mode');

    await page.locator('#currentUserPill').click();
    await page.waitForSelector('#profileModal.active');
    await page.waitForSelector('#profileViewTabs');
    assert.equal(await page.locator('#profileTwitterActions #profileEditBtn').count(), 1, 'Profile edit action is missing or duplicated');
    assert.equal(await page.locator('#profileModal .profile-access-panel').count(), 0, 'Redundant admin access panel still exists');
    assert.equal(await page.locator('#profileModal .profile-grid').count(), 0, 'Redundant global statistics still exist');

    await page.locator('#profileEditBtn').click();
    await page.waitForFunction(() => document.getElementById('profileModal')?.dataset.profileView === 'customize');
    assert.equal(await page.locator('#profileModal .avatar-settings').isVisible(), true, 'Avatar editor is not visible');
    assert.equal(await page.locator('#profileModal .theme-settings').isVisible(), true, 'Palette editor is not visible');

    await page.locator('#profileEditBtn').click();
    await page.waitForFunction(() => document.getElementById('profileModal')?.dataset.profileView === 'overview');

    const securityTab = page.locator('[data-profile-view-target="settings"]');
    assert.equal(await securityTab.count(), 1, 'Security tab is missing');
    await securityTab.click();
    await page.waitForFunction(() => document.getElementById('profileModal')?.dataset.profileView === 'settings');
    await page.waitForSelector('#profileSecurityPanel');
    assert.equal(await page.locator('#twofaStartBtn').count(), 1, '2FA control is missing');
    assert.equal(await page.locator('#rememberSessionToggle').count(), 1, 'Session control is missing');
    assert.equal(await page.locator('#loginAlertsToggle').count(), 0, 'Non-practical login alert control returned');
    assert.equal(await page.locator('#privateProfileToggle').count(), 0, 'Non-practical private profile control returned');

    await page.locator('#closeProfileModalBtn').click();
    await page.waitForFunction(() => !document.getElementById('profileModal')?.classList.contains('active'));
    await page.close();
}

async function checkMobileHome(browser) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await setSession(page, 'admin');
    await attachDiagnostics(page, 'home-mobile');

    const response = await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200, 'Mobile home page failed to load');
    await page.waitForSelector('#menuIcon', { state: 'visible' });
    await page.locator('#menuIcon').click();
    await page.waitForSelector('#navMenu.active');
    await page.waitForSelector('#currentUserPill', { state: 'visible' });
    await page.locator('#currentUserPill').click();
    await page.waitForSelector('#profileModal.active');
    await page.waitForSelector('#profileViewTabs');

    const modalBox = await page.locator('#profileModal .profile-modal-content').boundingBox();
    assert.ok(modalBox && modalBox.width >= 380, `Mobile profile width is too small: ${modalBox?.width}`);
    assert.ok(modalBox && modalBox.height >= 800, `Mobile profile height is too small: ${modalBox?.height}`);

    await page.locator('#closeProfileModalBtn').click();
    await page.close();
}

async function checkStaticPages(browser) {
    for (const path of ['/stats.html', '/about.html', '/admin.html']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await setSession(page, 'admin');
        await attachDiagnostics(page, path);
        const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
        assert.ok(response && response.status() < 400, `${path} returned ${response?.status()}`);
        await page.waitForSelector('body');
        await page.waitForTimeout(250);
        await page.close();
    }
}

(async () => {
    await verifyHealth();
    const browser = await chromium.launch({ headless: true });
    try {
        await checkLoginPage(browser);
        await checkHomeAndProfile(browser);
        await checkMobileHome(browser);
        await checkStaticPages(browser);
    } finally {
        await browser.close();
    }

    assert.deepEqual(criticalFailures, [], `Critical resource failures:\n${criticalFailures.join('\n')}`);
    assert.deepEqual(pageErrors, [], `Browser JavaScript errors:\n${pageErrors.join('\n')}`);
    console.log('Runtime smoke check OK: server, critical assets, themes, desktop/mobile profile and main pages work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
