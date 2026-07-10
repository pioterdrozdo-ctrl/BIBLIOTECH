'use strict';

const { chromium } = require('playwright');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    page.on('console', message => console.log(`[browser:${message.type()}] ${message.text()}`));
    page.on('pageerror', error => console.log(`[browser:error] ${error.stack || error.message}`));

    await page.addInitScript(() => {
        localStorage.setItem('bibliotech_current_user', JSON.stringify({
            username: 'Trace Admin',
            role: 'admin',
            guest: false
        }));

        const original = document.addEventListener.bind(document);
        document.addEventListener = function tracedAddEventListener(type, listener, options) {
            if (type !== 'DOMContentLoaded' || typeof listener !== 'function') {
                return original(type, listener, options);
            }

            const stack = new Error().stack || '';
            const source = stack.split('\n').slice(2, 5).join(' | ').replace(/\s+/g, ' ');
            const wrapped = function tracedDomReadyListener(...args) {
                console.log(`[DCL:start] ${source}`);
                const result = listener.apply(this, args);
                console.log(`[DCL:end] ${source}`);
                return result;
            };
            return original(type, wrapped, options);
        };
    });

    try {
        await page.goto(`${baseUrl}/home.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        console.log('[trace] DOMContentLoaded completed');
    } catch (error) {
        console.log(`[trace] ${error.message}`);
    } finally {
        await browser.close();
    }
})();
