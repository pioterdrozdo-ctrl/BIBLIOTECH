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

    try {
        await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        console.log('[trace] DOMContentLoaded completed');
        await page.waitForFunction(() => Boolean(window.BibliotechSettings) && Boolean(window.BibliotechProfile));

        await page.evaluate(() => {
            const settings = document.getElementById('accountSettingsModal');
            new MutationObserver(() => console.log(`[settings:class] ${settings.className || '(empty)'}`))
                .observe(settings, { attributes: true, attributeFilter: ['class'] });
            document.addEventListener('click', event => {
                const target = event.target instanceof Element ? event.target : null;
                console.log(`[click:capture] ${target?.id || target?.className || target?.tagName}`);
            }, true);
            document.addEventListener('click', event => {
                const target = event.target instanceof Element ? event.target : null;
                console.log(`[click:bubble] ${target?.id || target?.className || target?.tagName} settings=${settings.className || '(empty)'}`);
            });
        });

        await page.locator('#currentUserPill').click();
        await page.waitForSelector('#profileModal.active');
        await page.locator('#profileSettingsBtn').click();
        await page.waitForSelector('#accountSettingsModal.active');
        console.log('[trace] settings opened');
        await page.locator('#accountSettingsCloseBtn').click();
        await page.waitForTimeout(800);
        const state = await page.evaluate(() => ({
            settingsClass: document.getElementById('accountSettingsModal')?.className,
            profileClass: document.getElementById('profileModal')?.className,
            activeElement: document.activeElement?.id
        }));
        console.log(`[trace] after close ${JSON.stringify(state)}`);
    } catch (error) {
        console.log(`[trace] ${error.stack || error.message}`);
    } finally {
        await browser.close();
    }
})();
