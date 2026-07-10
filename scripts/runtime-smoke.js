'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const criticalFailures = [];
const pageErrors = [];
const criticalStylePaths = [
    '/css/ui-refresh.css',
    '/css/ui-refresh-release-fix.css',
    '/css/product-polish.css',
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

        const productScript = html.indexOf('/js/product-polish.js');
        const pwaScript = html.indexOf('/js/pwa.js');
        assert.ok(productScript > bodyStart, `${pagePath} does not preload the product polish controller`);
        assert.ok(pwaScript > productScript, `${pagePath} must load product polish before pwa.js`);
        assert.equal((html.match(/\/js\/product-polish\.js/g) || []).length, 1, `${pagePath} duplicates product polish`);

        if (pagePath === '/home.html') {
            const profileCss = html.indexOf('/css/profile-twitter-restored.css');
            const customizeCss = html.indexOf('/css/profile-customization-modal.css');
            const settingsCss = html.indexOf('/css/profile-settings-modal.css');
            const profileScript = html.indexOf('/js/profile-twitter.js');
            const customizeScript = html.indexOf('/js/profile-customization-modal.js');
            const settingsScript = html.indexOf('/js/profile-settings-modal.js');
            const securityScript = html.indexOf('/js/profile-security.js');
            assert.ok(profileCss > 0 && profileCss < headEnd, 'Profile CSS is not present in the initial head');
            assert.ok(customizeCss > profileCss && customizeCss < headEnd, 'Customization CSS is not present after profile CSS');
            assert.ok(settingsCss > customizeCss && settingsCss < headEnd, 'Settings CSS is not present after customization CSS');
            assert.ok(profileScript > productScript, 'Profile controller must load after product polish');
            assert.ok(customizeScript > profileScript, 'Customization controller must load after the profile controller');
            assert.ok(settingsScript > customizeScript, 'Settings controller must load after customization');
            assert.ok(securityScript > settingsScript, 'Security controller must load after the settings mount exists');
            assert.equal((html.match(/\/js\/profile-twitter\.js/g) || []).length, 1, 'Profile controller is duplicated in initial HTML');
            assert.equal((html.match(/\/js\/profile-customization-modal\.js/g) || []).length, 1, 'Customization controller is duplicated in initial HTML');
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

async function setSession(page, role = 'admin', { welcomeSeen = true, username } = {}) {
    await page.addInitScript(({ role, welcomeSeen, username }) => {
        const resolvedName = username || (role === 'admin' ? 'Smoke Admin' : 'Smoke User');
        localStorage.setItem('bibliotech_current_user', JSON.stringify({
            username: resolvedName,
            role,
            guest: false
        }));
        if (welcomeSeen) {
            localStorage.setItem(`bibliotech_product_welcome_v1_${resolvedName.trim().toLowerCase()}`, '1');
        }
    }, { role, welcomeSeen, username });
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
    assert.equal(await page.locator('#profileModal .theme-settings').count(), 0, `${label}: duplicated palette remained inside profile`);
    assert.equal(await page.locator('script[src*="profile-twitter.js"]').count(), 1, `${label}: profile controller was loaded more than once`);
}

async function assertCustomizationModal(page, label) {
    await page.waitForSelector('#profileCustomizeModal.active');
    assert.equal(await page.locator('#profileCustomizeModal').count(), 1, `${label}: customization modal is duplicated`);
    assert.equal(await page.locator('#profileCustomizeModal #profileCustomizeAvatarMount .avatar-settings').count(), 1, `${label}: avatar editor is not mounted`);
    assert.equal(await page.locator('#profileCustomizeModal #profileBioInput').count(), 1, `${label}: profile bio editor is missing`);
    assert.equal(await page.locator('#profileCustomizeModal [data-profile-banner]').count(), 6, `${label}: banner presets are incomplete`);
    assert.equal(await page.locator('#profileCustomizeModal #profileBannerInput').count(), 1, `${label}: custom banner upload is missing`);
    assert.equal(await page.locator('#profileCustomizeModal #themePresetGrid').count(), 0, `${label}: site palette was duplicated in customization`);
    assert.equal(await page.locator('#profileModal.active').count(), 0, `${label}: profile remained open behind customization`);
    assert.equal(await page.locator('script[src*="profile-customization-modal.js"]').count(), 1, `${label}: customization controller was loaded more than once`);
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
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    await attachDiagnostics(desktop, 'login-desktop');
    const response = await desktop.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200, 'Login page failed to load');
    await desktop.waitForFunction(() => Boolean(window.BibliotechTheme) && Boolean(window.BibliotechProductPolish));
    await desktop.waitForSelector('.auth-product-shell');
    assert.equal(await desktop.locator('.auth-product-story').isVisible(), true, 'Product story is not visible on desktop login');
    assert.equal(await desktop.locator('.auth-value-card').count(), 3, 'Login value proposition is incomplete');
    assert.equal(await desktop.locator('.auth-container').isVisible(), true, 'Login form is not visible');
    assert.equal(await desktop.locator('link[href*="product-polish.css"]').count(), 1, 'Product polish CSS is duplicated on login');
    await desktop.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await attachDiagnostics(mobile, 'login-mobile');
    await mobile.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await mobile.waitForSelector('.auth-product-shell');
    assert.equal(await mobile.locator('.auth-container').isVisible(), true, 'Mobile login form is not visible');
    const authBox = await mobile.locator('.auth-container').boundingBox();
    assert.ok(authBox && authBox.width >= 350, `Mobile login width is too small: ${authBox?.width}`);
    await mobile.close();
}

async function checkFirstRunExperience(browser) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await setSession(page, 'user', { welcomeSeen: false, username: 'First Visit User' });
    await attachDiagnostics(page, 'first-run');
    await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#productWelcomeModal.active', { timeout: 5000 });
    assert.equal(await page.locator('.product-welcome-item').count(), 3, 'First-run experience does not explain the three main scenarios');
    assert.equal(await page.locator('#productWelcomeStart').isVisible(), true, 'First-run primary action is missing');
    await page.locator('#productWelcomeStart').click();
    await page.waitForFunction(() => !document.getElementById('productWelcomeModal')?.classList.contains('active'));
    const remembered = await page.evaluate(() => localStorage.getItem('bibliotech_product_welcome_v1_first visit user'));
    assert.equal(remembered, '1', 'First-run experience was not remembered');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#productWelcomeModal.active').count(), 0, 'First-run experience returned after it was completed');
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
        && Boolean(window.BibliotechProductPolish)
        && Boolean(window.BibliotechProfile)
        && Boolean(window.BibliotechProfileCustomize)
        && Boolean(window.BibliotechSettings)
        && Boolean(window.BibliotechSecurity));
    await page.waitForTimeout(500);

    assert.equal(await page.locator('link[href*="ui-refresh.css"]').count(), 1, 'Global refresh CSS is duplicated');
    assert.equal(await page.locator('link[href*="product-polish.css"]').count(), 1, 'Product polish CSS is duplicated');
    assert.equal(await page.locator('link[href*="profile-twitter-restored.css"]').count(), 1, 'Profile CSS is duplicated');
    assert.equal(await page.locator('link[href*="profile-customization-modal.css"]').count(), 1, 'Customization CSS is duplicated');
    assert.equal(await page.locator('link[href*="profile-settings-modal.css"]').count(), 1, 'Settings CSS is duplicated');
    assert.equal(await page.locator('.product-hero-actions').count(), 1, 'Home hero actions are missing or duplicated');
    assert.equal(await page.locator('.product-proof-chip').count(), 4, 'Home value proof is incomplete');

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
    await assertCustomizationModal(page, 'customization open');
    await page.locator('#profileBioInput').fill('Читаю техническую литературу и собираю полезные книги по программированию.');
    await page.locator('[data-profile-banner="sunset"]').click();
    await page.locator('#profileCustomizeSaveBtn').click();
    await page.waitForFunction(() => !document.getElementById('profileCustomizeModal')?.classList.contains('active'));

    await page.locator('#currentUserPill').click();
    await page.waitForSelector('#profileModal.active');
    await page.waitForFunction(() => document.getElementById('profileBio')?.textContent.includes('техническую литературу'));
    assert.equal(await page.locator('#profileBio').isVisible(), true, 'Saved profile bio is not visible');
    assert.equal(await page.locator('#profileModal').getAttribute('data-profile-banner'), 'sunset', 'Saved profile banner was not applied');

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
    await assertCustomizationModal(page, 'customization from settings');
    assert.equal(await page.locator('#accountSettingsModal.active').count(), 0, 'Settings modal stayed open behind customization');
    await page.locator('#profileCustomizeCancelBtn').click();
    await page.close();
}

async function checkMobileHome(browser) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await setSession(page, 'admin');
    await attachDiagnostics(page, 'home-mobile');

    const response = await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200, 'Mobile home page failed to load');
    await page.waitForSelector('#menuIcon', { state: 'visible' });
    await page.waitForFunction(() => Boolean(window.BibliotechProfileCustomize) && Boolean(window.BibliotechProductPolish));
    assert.equal(await page.locator('.product-hero-actions').count(), 1, 'Mobile hero actions are missing');
    await page.locator('#menuIcon').click();
    await page.waitForSelector('#navMenu.active');
    await page.waitForSelector('#currentUserPill', { state: 'visible' });
    await page.locator('#currentUserPill').click();
    await page.waitForSelector('#profileModal.active');
    await assertEvolvedProfile(page, 'mobile profile');

    const profileBox = await page.locator('#profileModal .profile-modal-content').boundingBox();
    assert.ok(profileBox && profileBox.width >= 380, `Mobile profile width is too small: ${profileBox?.width}`);
    assert.ok(profileBox && profileBox.height >= 800, `Mobile profile height is too small: ${profileBox?.height}`);

    await page.locator('#profileEditBtn').click();
    await assertCustomizationModal(page, 'mobile customization');
    const customizeBox = await page.locator('#profileCustomizeModal .profile-customize-dialog').boundingBox();
    assert.ok(customizeBox && customizeBox.width >= 380, `Mobile customization width is too small: ${customizeBox?.width}`);
    assert.ok(customizeBox && customizeBox.height >= 800, `Mobile customization height is too small: ${customizeBox?.height}`);
    await page.locator('#profileCustomizeCancelBtn').click();

    await page.locator('#currentUserPill').click();
    await page.waitForSelector('#profileModal.active');
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
        await page.waitForFunction(() => Boolean(window.BibliotechProductPolish));
        assert.equal(await page.locator('link[href*="ui-refresh.css"]').count(), 1, `${path} global refresh CSS is duplicated`);
        assert.equal(await page.locator('link[href*="product-polish.css"]').count(), 1, `${path} product polish CSS is duplicated`);
        assert.equal(await page.locator('#profileModal').count(), 0, `${path} still contains the legacy profile modal`);
        assert.equal(await page.locator('#currentUserPill').getAttribute('title'), 'Открыть полноценный профиль', `${path} profile action is not clear`);
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
        await checkFirstRunExperience(browser);
        await checkHomeProfileAndSettings(browser);
        await checkMobileHome(browser);
        await checkStaticPages(browser);
    } finally {
        await browser.close();
    }

    assert.deepEqual(criticalFailures, [], `Critical resource failures:\n${criticalFailures.join('\n')}`);
    assert.deepEqual(pageErrors, [], `Browser JavaScript errors:\n${pageErrors.join('\n')}`);
    console.log('Runtime smoke check OK: unified design, first-run experience, profile, settings, themes and mobile layouts work.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
