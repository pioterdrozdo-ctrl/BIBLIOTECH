const assert = require('assert');
const fs = require('fs');
const path = require('path');
const service = require('../backend/services/translationService');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

async function main() {
    const client = read('frontend/js/content-translation.js');
    const home = read('frontend/home.html');
    const script = read('frontend/js/script.js');
    const server = read('backend/server.js');
    const serviceSource = read('backend/services/translationService.js');

    assert(client.includes('[data-user-content]'), 'Client must translate only explicitly marked rendered content');
    assert(client.includes("input, textarea, [contenteditable=\"true\"]"), 'Client must never rewrite active input fields');
    assert(client.includes('originals = new WeakMap()'), 'Client must preserve original rendered content');
    assert(home.includes('content-translation.js'), 'Content translator must load on the catalog page');
    assert(script.includes('data-user-content="book-description"'), 'Book descriptions must be marked as dynamic content');
    assert(script.includes('data-user-content="comment"'), 'Reader comments must be marked as dynamic content');
    assert(server.includes("app.use('/api/translate', translateRoutes)"), 'Translation route must be registered');
    assert(serviceSource.includes("'x-goog-api-key': apiKey"), 'Google key must stay in a server-side header');
    assert(!client.includes('GOOGLE_TRANSLATE_API_KEY'), 'The Google key must never be included in browser code');

    service.clearTranslationCache();
    let calls = 0;
    const fakeFetch = async (url, options) => {
        calls += 1;
        assert.equal(url, 'https://translation.googleapis.com/language/translate/v2');
        assert.equal(options.headers['x-goog-api-key'], 'server-secret');
        assert(!url.includes('server-secret'));
        const body = JSON.parse(options.body);
        assert.deepEqual(body.q, ['Описание', 'Комментарий']);
        assert.equal(body.target, 'en');
        return {
            ok: true,
            json: async () => ({ data: { translations: [
                { translatedText: 'Description', detectedSourceLanguage: 'ru' },
                { translatedText: 'Comment &amp; note', detectedSourceLanguage: 'ru' }
            ] } })
        };
    };

    const first = await service.translateTexts(['Описание', 'Комментарий'], {
        target: 'en', apiKey: 'server-secret', fetchImpl: fakeFetch
    });
    assert.deepEqual(first.map(item => item.text), ['Description', 'Comment & note']);
    const cached = await service.translateTexts(['Описание', 'Комментарий'], {
        target: 'en', apiKey: 'server-secret', fetchImpl: fakeFetch
    });
    assert.equal(calls, 1, 'Repeated text must be served from cache');
    assert(cached.every(item => item.cached), 'Cached results must be identified');

    let missingKeyCode = '';
    try { await service.translateTexts(['Текст'], { target: 'en', apiKey: '' }); }
    catch (error) { missingKeyCode = error.code; }
    assert.equal(missingKeyCode, 'TRANSLATION_NOT_CONFIGURED');

    console.log('content-translation: ok');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
