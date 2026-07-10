'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const profileJs = fs.readFileSync(path.join(root, 'frontend/js/profile-twitter.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(root, 'frontend/js/profile-settings-modal.js'), 'utf8');
const closeGuardJs = fs.readFileSync(path.join(root, 'frontend/js/account-settings-close-guard.js'), 'utf8');
const rentalsGuardJs = fs.readFileSync(path.join(root, 'frontend/js/rentals-request-guard.js'), 'utf8');
const featuresJs = fs.readFileSync(path.join(root, 'frontend/js/account-settings-features.js'), 'utf8');
const securityJs = fs.readFileSync(path.join(root, 'frontend/js/profile-security.js'), 'utf8');
const profileCss = fs.readFileSync(path.join(root, 'frontend/css/profile-twitter-restored.css'), 'utf8');
const settingsCss = fs.readFileSync(path.join(root, 'frontend/css/profile-settings-modal.css'), 'utf8');
const featuresCss = fs.readFileSync(path.join(root, 'frontend/css/account-settings-features.css'), 'utf8');
const pwaJs = fs.readFileSync(path.join(root, 'frontend/js/pwa.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
const accountRoute = fs.readFileSync(path.join(root, 'backend/routes/account.js'), 'utf8');
const sessionAuth = fs.readFileSync(path.join(root, 'backend/routes/sessionAuth.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'frontend/sw.js'), 'utf8');

function count(text, value) {
    return text.split(value).length - 1;
}

function assertBalancedCss(css, filename) {
    const stripped = css
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

assert.equal(count(profileJs, 'id="profileEditBtn"'), 1, 'profile must have one edit action');
assert.equal(count(profileJs, 'id="profileSettingsBtn"'), 1, 'profile must have one settings action');
assert.ok(!profileJs.includes('data-profile-view-target="settings"'), 'security must not return to profile tabs');
assert.ok(profileJs.includes("modal.dataset.profileIteration = 'evolved'"), 'profile iteration marker is missing');
assert.ok(profileJs.includes('queueMicrotask(repair)'), 'legacy click repair must run before browser paint');

assert.equal(count(settingsJs, "modal.id = 'accountSettingsModal'"), 1, 'settings modal must be created once');
assert.ok(settingsJs.includes('data-settings-section="account"'), 'account section is missing');
assert.ok(settingsJs.includes('data-settings-section="security"'), 'security section is missing');
assert.ok(!settingsJs.includes('themePresetGrid'), 'palette controls must not be duplicated in settings');
assert.ok(!settingsJs.includes('closeLockUntil'), 'settings reopen must not depend on an arbitrary time lock');
assert.ok(closeGuardJs.includes("document.addEventListener('click', handleSettingsAction, true)"), 'capture-phase settings action guard is missing');
assert.ok(closeGuardJs.includes('accountSettingsEditProfileBtn'), 'settings-to-profile transition guard is missing');

assert.ok(rentalsGuardJs.includes("pathname === '/api/rentals/me'"), 'rental request guard does not target the profile endpoint');
assert.ok(rentalsGuardJs.includes('inFlight'), 'rental request guard does not coalesce concurrent requests');
assert.ok(rentalsGuardJs.includes('CACHE_TTL_MS'), 'rental request guard does not throttle repeated profile refreshes');

for (const section of ['devices', 'notifications', 'privacy', 'library', 'data']) {
    assert.ok(featuresJs.includes(`data-settings-section="${section}"`) || featuresJs.includes(`navButton('${section}'`), `${section} section is missing`);
}
assert.ok(featuresJs.includes('changeAccountPasswordForm'), 'password change form is missing');
assert.ok(featuresJs.includes('logoutOtherDevicesBtn'), 'logout other devices action is missing');
assert.ok(featuresJs.includes('notifyDueToggle'), 'due reminder control is missing');
assert.ok(featuresJs.includes('privateHistoryToggle'), 'privacy controls are missing');
assert.ok(featuresJs.includes('favoriteBookBtn'), 'favorite book action is missing');
assert.ok(featuresJs.includes('wishlistBookBtn'), 'wishlist action is missing');
assert.ok(featuresJs.includes('exportAccountDataBtn'), 'data export is missing');
assert.ok(featuresJs.includes('deleteAccountBtn'), 'account deletion is missing');
assert.ok(!featuresJs.includes('themePresetGrid'), 'theme palette must not be duplicated in complete settings');

assert.ok(securityJs.includes('id="rememberSessionToggle"'), 'practical session control must remain');
assert.ok(securityJs.includes('id="twofaStartBtn"'), '2FA control must remain');
assert.ok(securityJs.includes("getElementById('accountSettingsSecurityMount')"), 'security must remain in settings modal');

for (const endpoint of ['/password', '/devices', '/devices/logout-others', '/notifications', '/privacy', '/library', '/export', '/public/:username']) {
    assert.ok(accountRoute.includes(endpoint), `account API endpoint ${endpoint} is missing`);
}
assert.ok(accountRoute.includes('session_version'), 'server-side session revocation is missing');
assert.ok(sessionAuth.includes('ver: Number(user.session_version || 1)'), 'versioned login token is missing');

assertBalancedCss(profileCss, 'profile-twitter-restored.css');
assertBalancedCss(settingsCss, 'profile-settings-modal.css');
assertBalancedCss(featuresCss, 'account-settings-features.css');
assert.ok(featuresCss.includes('@media (max-width: 700px)'), 'complete settings mobile layout is missing');

assert.ok(pwaJs.indexOf('rentals-request-guard.js') < pwaJs.indexOf('profile-rentals.js'), 'PWA must load the rental guard before profile rentals');
assert.ok(pwaJs.includes('account-settings-features.js'), 'complete settings controller is not loaded');
assert.ok(pwaJs.includes('account-settings-close-guard.js'), 'settings action guard is not loaded');
assert.ok(pwaJs.includes('account-settings-features.css'), 'complete settings CSS is not loaded');
assert.ok(serverJs.includes('/api/account'), 'account API is not mounted');
assert.ok(serverJs.indexOf('/js/rentals-request-guard.js') < serverJs.indexOf('/js/profile-rentals.js'), 'initial HTML must load the rental guard first');
assert.ok(serverJs.includes('/js/account-settings-features.js'), 'complete settings must be delivered in initial HTML');
assert.ok(serverJs.includes('/css/account-settings-features.css'), 'complete settings CSS must be delivered in initial HTML');
assert.ok(swJs.includes("CACHE_NAME = 'bibliotech-pwa-v19'"), 'PWA cache was not invalidated');
assert.ok(swJs.includes('/js/rentals-request-guard.js'), 'PWA shell does not cache the rental request guard');

console.log('Account settings check OK: sessions, notifications, privacy, library, immediate modal transitions and rental request throttling validated.');
