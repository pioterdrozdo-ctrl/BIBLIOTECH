'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const profileJs = fs.readFileSync(path.join(root, 'frontend/js/profile-twitter.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(root, 'frontend/js/profile-settings-modal.js'), 'utf8');
const securityJs = fs.readFileSync(path.join(root, 'frontend/js/profile-security.js'), 'utf8');
const profileCss = fs.readFileSync(path.join(root, 'frontend/css/profile-twitter-restored.css'), 'utf8');
const settingsCss = fs.readFileSync(path.join(root, 'frontend/css/profile-settings-modal.css'), 'utf8');
const pwaJs = fs.readFileSync(path.join(root, 'frontend/js/pwa.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
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
assert.ok(profileJs.includes('data-open-account-settings'), 'settings action must open the separate modal');
assert.ok(!profileJs.includes('data-profile-view-target="settings"'), 'security must not remain a profile tab');
assert.equal(count(profileJs, 'data-profile-view-target="overview"'), 1, 'library tab must be unique');
assert.ok(profileJs.includes("querySelector('#profileModal .profile-access-panel')?.remove()"), 'role permission panel must be removed');
assert.ok(profileJs.includes("querySelector('#profileModal .profile-grid')?.remove()"), 'global catalog statistics must be removed from profile');
assert.ok(profileJs.includes("modal.dataset.profileIteration = 'evolved'"), 'profile iteration marker is missing');
assert.ok(profileJs.includes('queueMicrotask(repair)'), 'legacy click repair must run before browser paint');
assert.ok(profileJs.includes('openCustomize'), 'settings modal must be able to return to profile editing');

assert.equal(count(settingsJs, "modal.id = 'accountSettingsModal'"), 1, 'settings modal must be created once');
assert.ok(settingsJs.includes('data-settings-section="account"'), 'account settings section is missing');
assert.ok(settingsJs.includes('data-settings-section="security"'), 'security settings section is missing');
assert.ok(settingsJs.includes('id="accountSettingsSecurityMount"'), 'security mount is missing');
assert.ok(settingsJs.includes('id="accountSettingsEditProfileBtn"'), 'profile edit bridge is missing');
assert.ok(settingsJs.includes("document.getElementById('profileModal')?.classList.remove('active')"), 'profile must close before settings opens');
assert.ok(!settingsJs.includes('themePresetGrid'), 'palette controls must not be duplicated in settings');

assert.ok(!securityJs.includes('id="loginAlertsToggle"'), 'non-functional login alert control must not be rendered');
assert.ok(!securityJs.includes('id="privateProfileToggle"'), 'future private-profile control must not be rendered');
assert.ok(securityJs.includes('id="rememberSessionToggle"'), 'practical session control must remain');
assert.ok(securityJs.includes('id="twofaStartBtn"'), '2FA control must remain');
assert.ok(securityJs.includes("getElementById('accountSettingsSecurityMount')"), 'security must render inside settings modal');
assert.ok(!securityJs.includes("querySelector('#profileModal .profile-modal-content')"), 'security must not be injected into profile');

assert.ok(profileCss.includes('[data-profile-view="overview"] .profile-rentals-panel'), 'overview section visibility is missing');
assert.ok(profileCss.includes('[data-profile-view="customize"] .avatar-settings'), 'profile editor visibility is missing');
assert.ok(profileCss.includes('@media (max-width: 620px)'), 'phone profile layout is missing');
assert.ok(profileCss.includes('min-height: 100dvh'), 'full-height phone profile is missing');
assertBalancedCss(profileCss, 'profile-twitter-restored.css');

assert.ok(settingsCss.includes('#accountSettingsModal'), 'settings modal CSS is missing');
assert.ok(settingsCss.includes('.account-settings-layout'), 'settings layout CSS is missing');
assert.ok(settingsCss.includes('@media (max-width: 700px)'), 'settings phone layout is missing');
assert.ok(settingsCss.includes('min-height: 100dvh'), 'settings modal must be full-height on phones');
assertBalancedCss(settingsCss, 'profile-settings-modal.css');

assert.ok(pwaJs.includes('profile-settings-modal.js'), 'settings controller is not loaded');
assert.ok(pwaJs.includes('profile-settings-modal.css'), 'settings CSS is not loaded');
assert.ok(pwaJs.includes('profile-security-modal-1'), 'modal security cache version is not loaded');
assert.ok(pwaJs.includes("hasAsset('script[src]'"), 'duplicate script prevention is missing');
assert.ok(pwaJs.includes("hasAsset('link[rel=\"stylesheet\"][href]'"), 'duplicate stylesheet prevention is missing');
assert.ok(serverJs.includes('/css/profile-settings-modal.css'), 'settings CSS must be delivered in initial HTML');
assert.ok(serverJs.includes('/js/profile-settings-modal.js'), 'settings controller must be delivered in initial HTML');
assert.ok(swJs.includes("CACHE_NAME = 'bibliotech-pwa-v16'"), 'PWA cache was not invalidated');

console.log('Profile UI check OK: separate settings modal, account/security sections, no duplication and mobile layouts validated.');
