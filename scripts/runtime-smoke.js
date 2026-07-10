'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const criticalFailures = [];
const pageErrors = [];
const criticalStylePaths = [
    '/css/ui-refresh.css',
    '/css/ui-refresh-release-fix.css',
    '/css/theme-mode-preview.css',
    '/css/liquid-theme-toggle.css'
];

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

async function verifyInitialHtmlAssets() {
    const pages = ['/', '/home.html', '/stats.html', '/about.html', '/admin.html'];
    for (const pagePath of pages) {
        const response = await fetch(`${baseUrl}${pagePath}`);
        assert.equal(response.status, 200, `${pagePath} initial HTML returned ${response.status}`);
        const html = await response.text();
        const headEnd = html.indexOf('</head>');
        const bodyStart = html.indexOf('<body');
        assert.ok(headEnd > 0 && bodyStart > headEnd, `${pagePath} has invalid HTML order`);

        for (const asset of criticalStylePaths) {
            const position = html.indexOf(asset);
            assert.ok(position > 0 && position < headEnd, `${pagePath} does not preload ${asset} before first paint`);
        }

        if (pagePath === '/home.html') {
            const profileCss = html.indexOf('/css/profile-twitter-restored.css');
            const settingsCss = html.indexOf('/css/profile-settings-modal.css');
            const profileScript = html.indexOf('/js/profile-twitter.js');
            const settingsScript = html.indexOf('/js/profile-settings-modal.js');
            const securityScript = html.indexOf('/js/profile-security.js');
            const pwaScript = html.indexOf('/js/pwa.js');
            assert.ok(profileCss > 0 && profileCss < headEnd, 'Profile CSS is not present in the initial head');
            assert.ok(settingsCss > 0 && settingsCss < headEnd, 'Settings CSS is not present in the initial head');
            assert.ok(profileScript > bodyStart, 'Profile controller is not present in the initial HTML');
            assert.ok(settingsScript > profileScript, 'Settings controller must load after the profile controller');
            assert.ok(securityScript > settingsScript, 'Security controller must load after the settings mount exists');
            assert.ok(pwaScript > securityScript, 'Profile settings stack must load before pwa.js');
            assert.equal((html.match(/\/js\/profile-twitter\.js/g) || []).length, 1, 'Profile controller is duplicated in initial HTML');
            assert.equal((html.match(/\/js\/profile-settings-modal\.js/g) || []).length, 1, 'Settings controller is duplicated in initial HTML');
            assert.equal((html.match(/\/js\/profile-security\.js/g) || []).length, 1, 'Security controller is duplicated in initial HTML');
        }
    }
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

async function assertEvolvedProfile(page, label) {
    await page.waitForFunction(() => {
        const modal = document.getElementById('profileModal');
        const badge = document.getElementById('profileModeBadge');
        const note = document.getElementById('profileRoleNote');
        return modal?.dataset.profileIteration === 'evolved'
            && badge?.textContent === 'Администратор'
            && note?.textContent === 'Ведёт каталог BIBLIOTECH и отвечает за его содержание.';
    });

    assert.equal(await page.locator('#profileTwitterActions #profileEditBtn').count(), 1, `${label}: profile edit action is missing or duplicated`);
    assert.equal(await page.locator('#profileTwitterActions #profileSettingsBtn').count(), 1, `${label}: profile settings action is missing or duplicated`);
    assert.equal(await page.locator('#profileViewTabs').count(), 1, `${label}: profile tabs are missing or duplicated`);
    assert.equal(await page.locator('#profileViewTabs [data-profile-view-target="settings"]').count(), 0, `${label}: security remained duplicated inside profile`);
    assert.equal(await page.locator('#profileModal .profile-access-panel').count(), 0, `${label}: legacy admin access panel returned`);
    assert.equal(await page.locator('#profileModal .profile-grid').count(), 0, `${label}: legacy global statistics returned`);
    assert.equal(await page.locator('script[src*="profile-twitter.js"]').count(), 1, `${label}: profile controller was loaded more than once`);
}

async function assertSettingsModal(page, label) {
    await page.waitForSelector('#accountSettingsModal.active');
    assert.equal(await page.locator('#accountSettingsModal').count(), 1, `${label}: settings modal is duplicated`);
    assert.equal(await page.locator('#accountSettingsModal [data-settings-section="account"]').count(), 1, `${label}: account section is missing`);
    assert.equal(await page.locator('#accountSettingsModal [data-settings-section="security"]').count(), 1, `${label}: security section is missing`);
    assert.equal(await page.locator('#accountSettingsModal #profileLogoutBtn').count(), 1, `${label}: logout action is not inside settings`);
    assert.equal(await page.locator('#profileModal #profileLogoutBtn').count(), 0, `${label}: logout action is duplicated in profile`);
    assert.equal(await page.locator('script[src*="profile-settings-modal.js"]').count(), 1, `${label}: settings controller was loaded more than once`);
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

async function checkHomeProfileAndSettings(browser) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await setSession(page, 'admin');
    await attachDiagnostics(page, 'home-desktop');

    const response = await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200, 'Home page failed to load');
    await page.waitForSelector('#currentUserPill', { state: 'visible' });
    await page.waitForFunction(() => Boolean(window.BibliotechTheme)
        && Boolean(window.BibliotechProfile)
        && Boolean(window.BibliotechSettings)
        && Boolean(window.BibliotechSecurity));
    await page.waitForTimeout(500);

    assert.equal(await page.locator('link[href*="ui-refresh.css"]').count(), 1, 'Global refresh CSS is duplicated');
    assert.equal(await page.locator('link[href*="profile-twitter-restored.css"]').count(), 1, 'Profile CSS is duplicated');
    assert.equal(await page.locator('link[href*="profile-settings-modal.css"]').count(), 1, 'Settings CSS is duplicated');

    const beforeTheme = await page.evaluate(() => window.BibliotechTheme.getState());
    await page.locator('#floatingThemeToggle').click();
    const afterTheme = await page.evaluate(() => window.BibliotechTheme.getState());
    assert.equal(afterTheme.theme, beforeTheme.theme, 'Brightness toggle changed the selected palette');
    assert.notEqual(afterTheme.mode, beforeTheme.mode, 'Brightness toggle did not change mode');

    for (let iteration = 1; iteration <= 5; iteration += 1) {
        await page.locator('#currentUserPill').click();
        await page.waitForSelector('#profileModal.active');
        await assertEvolvedProfile(page, `profile open ${iteration}`);
        await page.locator('#closeProfileModalBtn').click();
        await page.waitForFunction(() => !document.getElementById('profileModal')?.classList.contains('active'));
    }

    await page.locator('#currentUserPill').click();
    await page.waitForSelector('#profileModal.active');
    await assertEvolvedProfile(page, 'functional profile open');

    await page.locator('#profileEditBtn').click();
    await page.waitForFunction(() => document.getElementById('profileModal')?.dataset.profileView === 'customize');
    assert.equal(await page.locator('#profileModal .avatar-settings').isVisible(), true, 'Avatar editor is not visible');
    assert.equal(await page.locator('#profileModal .theme-settings').isVisible(), true, 'Palette editor is not visible');
    await page.locator('#profileEditBtn').click();
    await page.waitForFunction(() => document.getElementById('profileModal')?.dataset.profileView === 'overview');

    for (let iteration = 1; iteration <= 3; iteration += 1) {
        await page.locator('#profileSettingsBtn').click();
        await assertSettingsModal(page, `settings open ${iteration}`);
        assert.equal(await page.locator('#profileModal.active').count(), 0, `settings open ${iteration}: profile stayed open behind settings`);
        await page.locator('#accountSettingsCloseBtn').click();
        await page.waitForFunction(() => !document.getElementById('accountSettingsModal')?.classList.contains('active'));
        await page.locator('#currentUserPill').click();
        await page.waitForSelector('#profileModal.active');
    }

    await page.locator('#profileSettingsBtn').click();
    await assertSettingsModal(page, 'functional settings open');
    await page.locator('#accountSettingsModal [data-settings-section="security"]').click();
    await page.waitForFunction(() => document.getElementById('accountSettingsModal')?.dataset.settingsSection === 'security');
    await page.waitForSelector('#accountSettingsModal #profileSecurityPanel');
    assert.equal(await page.locator('#accountSettingsModal #twofaStartBtn').count(), 1, '2FA control is missing');
    assert.equal(await page.locator('#accountSettingsModal #rememberSessionToggle').count(), 1, 'Session control is missing');
    assert.equal(await page.locator('#profileModal #profileSecurityPanel').count(), 0, 'Security panel is duplicated inside profile');
    assert.equal(await page.locator('#loginAlertsToggle').count(), 0, 'Non-practical login alert control returned');
    assert.equal(await page.locator('#privateProfileToggle').count(), 0, 'Non-practical private profile control returned');

    await page.locator('#accountSettingsModal [data-settings-section="account"]').click();
    await page.locator('#accountSettingsEditProfileBtn').click();
    await page.waitForSelector('#profileModal.active');
    await page.waitForFunction(() => document.getElementById('profileModal')?.dataset.profileView === 'customize');
    assert.equal(await page.locator('#accountSettingsModal.active').count(), 0, 'Settings modal stayed open behind profile editor');

    await page.locator('#closeProfileModalBtn').click();
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
    await assertEvolvedProfile(page, 'mobile profile');

    const profileBox = await page.locator('#profileModal .profile-modal-content').boundingBox();
    assert.ok(profileBox && profileBox.width >= 380, `Mobile profile width is too small: ${profileBox?.width}`);
    assert.ok(profileBox && profileBox.height >= 800, `Mobile profile height is too small: ${profileBox?.height}`);

    await page.locator('#profileSettingsBtn').click();
    await assertSettingsModal(page, 'mobile settings');
    const settingsBox = await page.locator('#accountSettingsModal .account-settings-dialog').boundingBox();
    assert.ok(settingsBox && settingsBox.width >= 380, `Mobile settings width is too small: ${settingsBox?.width}`);
    assert.ok(settingsBox && settingsBox.height >= 800, `Mobile settings height is too small: ${settingsBox?.height}`);
    await page.locator('#accountSettingsModal [data-settings-section="security"]').click();
    await page.waitForSelector('#accountSettingsModal #profileSecurityPanel');

    await page.locator('#accountSettingsCloseBtn').click();
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
        assert.equal(await page.locator('link[href*="ui-refresh.css"]').count(), 1, `${path} global refresh CSS is duplicated`);
        await page.waitForTimeout(150);
        await page.close();
    }
}

(async () => {
    await verifyHealth();
    await verifyInitialHtmlAssets();
    const browser = await chromium.launch({ headless: true });
    try {
        await checkLoginPage(browser);
        await checkHomeProfileAndSettings(browser);
        await checkMobileHome(browser);
        await checkStaticPages(browser);
    } finally {
        await browser.close();
    }

    assert.deepEqual(criticalFailures, [], `Critical resource failures:\n${criticalFailures.join('\n')}`);
    assert.deepEqual(pageErrors, [], `Browser JavaScript errors:\n${pageErrors.join('\n')}`);
    console.log('Runtime smoke check OK: separate settings modal, account/security sections, repeated opens, themes and mobile layouts work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
