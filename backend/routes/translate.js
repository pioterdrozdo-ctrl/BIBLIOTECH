const express = require('express');
const rateLimit = require('express-rate-limit');
const { configured, translateTexts } = require('../services/translationService');

const router = express.Router();
const SUPPORTED = new Set(['ru', 'en', 'uk', 'de', 'kk', 'es', 'zh']);
const MAX_TEXTS = 32;
const MAX_TEXT_LENGTH = 4000;
const MAX_TOTAL_LENGTH = 12000;

const translateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Слишком много запросов на перевод. Попробуйте через минуту.', code: 'TRANSLATION_RATE_LIMIT' }
});

router.get('/status', (req, res) => {
    res.json({
        configured: configured(),
        provider: configured() ? 'google-cloud' : 'browser-or-original',
        supportedLanguages: Array.from(SUPPORTED)
    });
});

router.post('/', translateLimiter, async (req, res) => {
    const target = String(req.body?.target || '').toLowerCase();
    const source = String(req.body?.source || '').toLowerCase() || undefined;
    const texts = Array.isArray(req.body?.texts) ? req.body.texts.map(value => String(value ?? '')) : [];
    const totalLength = texts.reduce((sum, text) => sum + text.length, 0);

    if (!SUPPORTED.has(target) || (source && !SUPPORTED.has(source)) || !texts.length || texts.length > MAX_TEXTS
        || texts.some(text => text.length > MAX_TEXT_LENGTH) || totalLength > MAX_TOTAL_LENGTH) {
        return res.status(400).json({ error: 'Некорректный запрос на перевод.', code: 'INVALID_TRANSLATION_REQUEST' });
    }

    try {
        const translations = await translateTexts(texts, { target, source });
        return res.json({ target, source: source || 'auto', provider: 'google-cloud', translations });
    } catch (error) {
        const status = Number(error.status || 500);
        return res.status(status).json({
            error: status === 503 ? 'Перевод пользовательского текста пока не настроен.' : 'Не удалось перевести текст.',
            code: error.code || 'TRANSLATION_ERROR',
            browserFallback: true
        });
    }
});

module.exports = router;
