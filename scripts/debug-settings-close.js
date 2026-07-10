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
    await page.waitForTimeout(500);
    await page.evaluate(() => {
        const originalAdd = DOMTokenList.prototype.add;
        const originalRemove = DOMTokenList.prototype.remove;
        const isTarget = list => document.getElementById('accountSettingsModal')?.classList === list;
        DOMTokenList.prototype.add = function (...tokens) {
            if (isTarget(this) && tokens.includes('active')) console.log(`[class:add] ${new Error().stack}`);
            return originalAdd.apply(this, tokens);
        };
        DOMTokenList.prototype.remove = function (...tokens) {
            if (isTarget(this) && tokens.includes('active')) console.log(`[class:remove] ${new Error().stack}`);
            return originalRemove.apply(this, tokens);
        };
        document.addEventListener('click', event => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest('#profileSettingsBtn')) console.log(`[settings-click:capture] ${new Error().stack}`);
        }, true);
        const modal = document.getElementById('accountSettingsModal');
        new MutationObserver(() => console.log(`[class:value] ${modal.className || '(empty)'}`))
            .observe(modal, { attributes: true, attributeFilter: ['class'] });
    });

    for (let iteration = 1; iteration <= 5; iteration += 1) {
        await page.locator('#currentUserPill').click();
        await page.waitForSelector('#profileModal.active');
        await page.locator('#closeProfileModalBtn').click();
        await page.waitForFunction(() => !document.getElementById('profileModal')?.classList.contains('active'));
        console.log(`[trace] profile cycle ${iteration}`);
    }

    await page.locator('#currentUserPill').click();
    await page.waitForSelector('#profileModal.active');
    await page.locator('#profileEditBtn').click();
    await page.waitForFunction(() => document.getElementById('profileModal')?.dataset.profileView === 'customize');
    await page.locator('#profileEditBtn').click();
    await page.waitForFunction(() => document.getElementById('profileModal')?.dataset.profileView === 'overview');

    console.log(`[trace] settings button count=${await page.locator('#profileSettingsBtn').count()}`);
    await page.locator('#profileSettingsBtn').click();
    await page.waitForTimeout(800);
    console.log(`[trace] settings class after repeated cycles=${await page.locator('#accountSettingsModal').getAttribute('class')}`);

    if (await page.locator('#accountSettingsModal.active').count()) {
        await page.locator('#accountSettingsCloseBtn').click();
        await page.waitForTimeout(400);
        console.log(`[trace] final=${await page.locator('#accountSettingsModal').getAttribute('class')}`);
    }

    await browser.close();
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
