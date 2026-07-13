const TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;
const REQUEST_TIMEOUT_MS = 12000;

const cache = new Map();

class TranslationError extends Error {
    constructor(message, code, status = 500) {
        super(message);
        this.name = 'TranslationError';
        this.code = code;
        this.status = status;
    }
}

function configured(apiKey = process.env.GOOGLE_TRANSLATE_API_KEY) {
    return Boolean(String(apiKey || '').trim());
}

function decodeHtmlEntities(value = '') {
    return String(value)
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function classifyProviderError(payload, status) {
    const reason = String(payload?.error?.errors?.[0]?.reason || '').toLowerCase();
    const message = String(payload?.error?.message || '').toLowerCase();
    const details = `${reason} ${message}`;
    if (details.includes('api key not valid') || details.includes('invalid key')) return 'TRANSLATION_API_KEY_INVALID';
    if (details.includes('accessnotconfigured') || details.includes('service_disabled') || details.includes('has not been used') || details.includes('is disabled')) {
        return 'TRANSLATION_API_NOT_ENABLED';
    }
    if (details.includes('billing') || details.includes('billing_not_active')) return 'TRANSLATION_BILLING_NOT_ENABLED';
    if (details.includes('iprefererblocked') || details.includes('referer') || details.includes('not allowed') || details.includes('forbidden')) {
        return 'TRANSLATION_API_KEY_RESTRICTED';
    }
    if (status === 429 || reason.includes('ratelimit') || reason.includes('quota')) return 'TRANSLATION_QUOTA_EXCEEDED';
    return 'TRANSLATION_UPSTREAM_ERROR';
}

function cacheKey(text, target, source) {
    return `${source || 'auto'}\u0000${target}\u0000${text}`;
}

function readCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
}

function writeCache(key, value) {
    cache.set(key, { value, createdAt: Date.now() });
    while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

async function translateTexts(texts, options = {}) {
    const target = String(options.target || '').trim().toLowerCase();
    const source = String(options.source || '').trim().toLowerCase() || undefined;
    const apiKey = String(options.apiKey ?? process.env.GOOGLE_TRANSLATE_API_KEY ?? '').trim();
    const fetchImpl = options.fetchImpl || global.fetch;
    const normalized = texts.map(value => String(value ?? ''));

    if (!apiKey) throw new TranslationError('Translation provider is not configured', 'TRANSLATION_NOT_CONFIGURED', 503);
    if (!target) throw new TranslationError('Target language is required', 'INVALID_TRANSLATION_REQUEST', 400);

    const results = new Array(normalized.length);
    const misses = [];
    const missIndexes = [];
    normalized.forEach((text, index) => {
        if (!text.trim()) {
            results[index] = { text, detectedSourceLanguage: source || null, cached: true };
            return;
        }
        const cached = readCache(cacheKey(text, target, source));
        if (cached) results[index] = { ...cached, cached: true };
        else {
            misses.push(text);
            missIndexes.push(index);
        }
    });

    if (misses.length) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let response;
        try {
            response = await fetchImpl(TRANSLATE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify({ q: misses, target, format: 'text', ...(source ? { source } : {}) }),
                signal: controller.signal
            });
        } catch (error) {
            const code = error?.name === 'AbortError' ? 'TRANSLATION_TIMEOUT' : 'TRANSLATION_UPSTREAM_ERROR';
            throw new TranslationError('Translation provider is unavailable', code, 502);
        } finally {
            clearTimeout(timer);
        }

        const payload = await response.json().catch(() => ({}));
        const translations = payload?.data?.translations;
        if (!response.ok || !Array.isArray(translations) || translations.length !== misses.length) {
            throw new TranslationError('Translation provider rejected the request', classifyProviderError(payload, response.status), 502);
        }

        translations.forEach((translation, offset) => {
            const index = missIndexes[offset];
            const value = {
                text: decodeHtmlEntities(translation.translatedText ?? misses[offset]),
                detectedSourceLanguage: translation.detectedSourceLanguage || source || null,
                cached: false
            };
            results[index] = value;
            writeCache(cacheKey(misses[offset], target, source), value);
        });
    }

    return results;
}

function clearTranslationCache() {
    cache.clear();
}

module.exports = { TranslationError, configured, translateTexts, clearTranslationCache, classifyProviderError };
