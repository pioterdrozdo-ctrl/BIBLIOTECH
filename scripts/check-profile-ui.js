'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const profileJs = fs.readFileSync(path.join(root, 'frontend/js/profile-twitter.js'), 'utf8');
const securityJs = fs.readFileSync(path.join(root, 'frontend/js/profile-security.js'), 'utf8');
const profileCss = fs.readFileSync(path.join(root, 'frontend/css/profile-twitter-restored.css'), 'utf8');
const pwaJs = fs.readFileSync(path.join(root, 'frontend/js/pwa.js'), 'utf8');

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

assert.equal(count(profileJs, 'id="profileEditBtn"'), 1, 'profile must have one header edit action');
assert.ok(!profileJs.includes('profileCustomizeBtn'), 'old duplicate customize button must be removed');
assert.ok(!profileJs.includes('profileSettingsBtn'), 'old duplicate settings button must be removed');
assert.ok(profileJs.includes("querySelector('#profileModal .profile-access-panel')?.remove()"), 'role permission panel must be removed');
assert.ok(profileJs.includes("querySelector('#profileModal .profile-grid')?.remove()"), 'global catalog statistics must be removed from profile');
assert.equal(count(profileJs, 'data-profile-view-target="overview"'), 1, 'overview tab must be unique');
assert.equal(count(profileJs, 'data-profile-view-target="settings"'), 1, 'security tab must be unique');
assert.ok(!profileJs.includes('data-profile-view-target="customize" aria-selected'), 'customize must not be duplicated as a tab');

assert.ok(!securityJs.includes('id="loginAlertsToggle"'), 'non-functional login alert control must not be rendered');
assert.ok(!securityJs.includes('id="privateProfileToggle"'), 'future private-profile control must not be rendered');
assert.ok(securityJs.includes('id="rememberSessionToggle"'), 'practical session control must remain');
assert.ok(securityJs.includes('id="twofaStartBtn"'), '2FA control must remain');

assert.ok(profileCss.includes('[data-profile-view="overview"] .profile-rentals-panel'), 'overview section visibility is missing');
assert.ok(profileCss.includes('[data-profile-view="customize"] .avatar-settings'), 'profile editor visibility is missing');
assert.ok(profileCss.includes('[data-profile-view="settings"] #profileSecurityPanel'), 'security section visibility is missing');
assert.ok(profileCss.includes('@media (max-width: 620px)'), 'phone layout is missing');
assert.ok(profileCss.includes('min-height: 100dvh'), 'full-height phone profile is missing');
assertBalancedCss(profileCss, 'profile-twitter-restored.css');

assert.ok(pwaJs.includes('profile-evolved-1'), 'evolved profile cache version is not loaded');
assert.ok(pwaJs.includes('profile-security-practical-1'), 'practical security cache version is not loaded');

console.log('Profile UI check OK: hierarchy, duplicate removal, practical controls and mobile CSS validated.');
