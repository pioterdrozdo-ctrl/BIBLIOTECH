'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';

async function login() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'GreenScreen' })
    });
    const payload = await response.json();
    assert.equal(response.status, 200, `Browser smoke login failed: ${JSON.stringify(payload)}`);
    return payload;
}

async function seedPage(page, auth) {
    await page.addInitScript(({ auth }) => {
        localStorage.setItem('token', auth.token);
        localStorage.setItem('bibliotech_current_user', JSON.stringify(auth.user));
    }, { auth });
}

async function openSettings(page) {
    await page.locator('#currentUserPill').click();
    await page.waitForSelector('#profileModal.active');
    await page.locator('#profileSettingsBtn').click();
    await page.waitForSelector('#accountSettingsModal.active');
    await page.waitForFunction(() => Boolean(window.BibliotechAccountFeatures));
}

async function verifyDesktop(browser, auth) {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    await seedPage(page, auth);
    await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#currentUserPill', { state: 'visible' });
    await page.waitForFunction(() => Boolean(window.BibliotechSettings) && Boolean(window.BibliotechAccountFeatures));

    await openSettings(page);
    const sections = ['account', 'security', 'devices', 'notifications', 'privacy', 'library', 'data'];
    for (const section of sections) {
        assert.equal(await page.locator(`#accountSettingsModal [data-settings-section="${section}"]`).count(), 1, `${section} navigation is missing`);
    }

    assert.equal(await page.locator('#changeAccountPasswordForm').count(), 1, 'password form is missing');

    await page.locator('[data-settings-section="devices"]').click();
    await page.waitForFunction(() => document.getElementById('accountSettingsModal')?.dataset.settingsSection === 'devices');
    await page.waitForSelector('#accountDevicesList .account-device-card, #accountDevicesList .account-empty');
    assert.equal(await page.locator('#logoutOtherDevicesBtn').count(), 1, 'logout other devices button is missing');

    await page.locator('[data-settings-section="notifications"]').click();
    await page.waitForSelector('#notifyDueToggle');
    assert.equal(await page.locator('#notifyOverdueToggle').count(), 1, 'overdue toggle is missing');
    assert.equal(await page.locator('#notifyAvailableToggle').count(), 1, 'availability toggle is missing');
    assert.equal(await page.locator('#notifyLoginToggle').count(), 1, 'login toggle is missing');

    await page.locator('[data-settings-section="privacy"]').click();
    await page.waitForSelector('#privateProfileToggleReal');
    assert.equal(await page.locator('#privateHistoryToggle').count(), 1, 'history privacy toggle is missing');
    assert.equal(await page.locator('#showCommentsToggle').count(), 1, 'comment privacy toggle is missing');

    await page.locator('[data-settings-section="library"]').click();
    await page.waitForSelector('[data-library-tab="favorites"]');
    assert.equal(await page.locator('[data-library-tab="wishlist"]').count(), 1, 'wishlist tab is missing');
    assert.equal(await page.locator('[data-library-tab="history"]').count(), 1, 'history tab is missing');

    await page.locator('[data-settings-section="data"]').click();
    assert.equal(await page.locator('#exportAccountDataBtn').count(), 1, 'export button is missing');
    assert.equal(await page.locator('#deleteAccountBtn').count(), 1, 'delete account button is missing');

    await page.locator('#accountSettingsCloseBtn').click();
    await page.waitForFunction(() => !document.getElementById('accountSettingsModal')?.classList.contains('active'));

    const firstCard = page.locator('.book-card[data-id]').first();
    await firstCard.waitFor({ state: 'visible' });
    await firstCard.click();
    await page.waitForSelector('#viewModal.active');
    await page.waitForSelector('#personalBookActions');
    const favoriteButton = page.locator('#favoriteBookBtn');
    const wishlistButton = page.locator('#wishlistBookBtn');
    await favoriteButton.click();
    await page.waitForFunction(() => document.getElementById('favoriteBookBtn')?.classList.contains('active'));
    await wishlistButton.click();
    await page.waitForFunction(() => document.getElementById('wishlistBookBtn')?.classList.contains('active'));
    await page.locator('#closeViewBtn').click();

    await openSettings(page);
    await page.locator('[data-settings-section="library"]').click();
    await page.locator('[data-library-tab="favorites"]').click();
    await page.waitForSelector('#accountLibraryList .account-library-card');
    await page.locator('[data-library-tab="wishlist"]').click();
    await page.waitForSelector('#accountLibraryList .account-library-card');
    await page.locator('[data-library-tab="history"]').click();
    await page.waitForSelector('#accountLibraryList .account-library-card');

    assert.deepEqual(errors, [], `Browser errors:\n${errors.join('\n')}`);
    await page.close();
}

async function verifyMobile(browser, auth) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await seedPage(page, auth);
    await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#menuIcon', { state: 'visible' });
    await page.locator('#menuIcon').click();
    await page.waitForSelector('#navMenu.active');
    await openSettings(page);

    const box = await page.locator('#accountSettingsModal .account-settings-dialog').boundingBox();
    assert.ok(box && box.width >= 380, `mobile settings width is too small: ${box?.width}`);
    assert.ok(box && box.height >= 800, `mobile settings height is too small: ${box?.height}`);

    const nav = page.locator('#accountSettingsModal .account-settings-nav');
    const overflow = await nav.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    assert.ok(overflow.scrollWidth >= overflow.clientWidth, 'mobile settings navigation cannot scroll');

    await page.locator('[data-settings-section="notifications"]').click();
    await page.waitForSelector('#notifyDueToggle');
    await page.locator('[data-settings-section="library"]').click();
    await page.waitForSelector('#accountLibraryList');
    await page.locator('#accountSettingsCloseBtn').click();
    await page.close();
}

(async () => {
    const auth = await login();
    const browser = await chromium.launch({ headless: true });
    try {
        await verifyDesktop(browser, auth);
        await verifyMobile(browser, auth);
    } finally {
        await browser.close();
    }
    console.log('Account UI smoke OK: all settings sections, book lists and mobile layout work with a real token.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
