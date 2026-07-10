'use strict';

const { chromium } = require('playwright');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('console', message => console.log(`[browser:${message.type()}] ${message.text()}`));
    page.on('pageerror', error => console.log(`[browser:error] ${error.stack || error.message}`));

    await page.addInitScript(() => {
        localStorage.setItem('bibliotech_current_user', JSON.stringify({ username: 'Trace Admin', role: 'admin', guest: false }));
    });

    await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.BibliotechSettings) && Boolean(window.BibliotechProfile));
    await page.evaluate(() => {
        const originalAdd = DOMTokenList.prototype.add;
        const originalRemove = DOMTokenList.prototype.remove;
        const originalToggle = DOMTokenList.prototype.toggle;
        const isTarget = list => document.getElementById('accountSettingsModal')?.classList === list;
        DOMTokenList.prototype.add = function (...tokens) {
            if (isTarget(this) && tokens.includes('active')) console.log(`[class:add] ${new Error().stack}`);
            return originalAdd.apply(this, tokens);
        };
        DOMTokenList.prototype.remove = function (...tokens) {
            if (isTarget(this) && tokens.includes('active')) console.log(`[class:remove] ${new Error().stack}`);
            return originalRemove.apply(this, tokens);
        };
        DOMTokenList.prototype.toggle = function (token, force) {
            if (isTarget(this) && token === 'active') console.log(`[class:toggle:${force}] ${new Error().stack}`);
            return originalToggle.call(this, token, force);
        };
        const modal = document.getElementById('accountSettingsModal');
        new MutationObserver(() => console.log(`[class:value] ${modal.className || '(empty)'}`))
            .observe(modal, { attributes: true, attributeFilter: ['class'] });
    });

    await page.locator('#currentUserPill').click();
    await page.waitForSelector('#profileModal.active');
    await page.locator('#profileSettingsBtn').click();
    await page.waitForSelector('#accountSettingsModal.active');
    console.log('[trace] opened');
    await page.locator('#accountSettingsCloseBtn').click();
    await page.waitForTimeout(600);
    console.log(`[trace] final=${await page.locator('#accountSettingsModal').getAttribute('class')}`);
    await browser.close();
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
