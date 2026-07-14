(function () {
    'use strict';

    const API_URL = window.BIBLIOTECH_API_URL || '/api';
    const LANGUAGE_KEY = 'bibliotech_language';
    const SUPPORTED = new Set(['ru', 'en', 'uk', 'de', 'kk', 'es', 'zh']);
    const originals = new WeakMap();
    const translatedCache = new Map();
    let generation = 0;
    let refreshTimer = null;
    let observer = null;

    function currentLanguage() {
        const language = localStorage.getItem(LANGUAGE_KEY) || document.documentElement.lang || 'ru';
        return SUPPORTED.has(language) ? language : 'ru';
    }

    function sourceHint(text) {
        const value = String(text || '');
        if (/\p{Script=Han}/u.test(value)) return 'zh';
        if (/[әғқңөұүһі]/iu.test(value)) return 'kk';
        if (/[іїєґ]/iu.test(value)) return 'uk';
        if (/[а-яё]/iu.test(value)) return 'ru';
        if (/[äöüß]/iu.test(value)) return 'de';
        if (/[áéíóúñü¿¡]/iu.test(value)) return 'es';
        if (/[a-z]/iu.test(value)) return 'en';
        return null;
    }

    function translatableElements(root = document) {
        const nodes = [];
        if (root.nodeType === Node.ELEMENT_NODE && root.matches('[data-user-content]')) nodes.push(root);
        root.querySelectorAll?.('[data-user-content]').forEach(node => nodes.push(node));
        return nodes.filter(node => !node.matches('input, textarea, [contenteditable="true"]'));
    }

    function rememberOriginal(element) {
        const rendered = String(element.textContent || '').trim();
        if (!originals.has(element)) originals.set(element, rendered);
        return originals.get(element);
    }

    async function translateOnServer(texts, target) {
        const response = await fetch(`${API_URL}/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts, target })
        });
        if (!response.ok) throw new Error(`Translation API: ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload.translations) || payload.translations.length !== texts.length) throw new Error('Invalid translation response');
        return payload.translations.map(item => String(item?.text ?? ''));
    }

    async function translateInBrowser(text, target) {
        if (!('Translator' in self)) throw new Error('Browser translation is unavailable');
        const sourceLanguage = sourceHint(text);
        if (!sourceLanguage || sourceLanguage === target) return text;
        if (typeof self.Translator.availability === 'function') {
            const availability = await self.Translator.availability({ sourceLanguage, targetLanguage: target });
            if (availability === 'unavailable') throw new Error('Language pair is unavailable');
        }
        const translator = await self.Translator.create({ sourceLanguage, targetLanguage: target });
        try { return await translator.translate(text); }
        finally { translator.destroy?.(); }
    }

    async function translateBatch(texts, target) {
        try {
            return await translateOnServer(texts, target);
        } catch (serverError) {
            return Promise.all(texts.map(async text => {
                try { return await translateInBrowser(text, target); }
                catch (browserError) { return text; }
            }));
        }
    }

    async function refresh(root = document) {
        const run = ++generation;
        const target = currentLanguage();
        const elements = translatableElements(root);
        const pending = [];

        elements.forEach(element => {
            const original = rememberOriginal(element);
            if (!original) return;
            const source = sourceHint(original);
            if (source === target) {
                if (element.textContent !== original) element.textContent = original;
                element.removeAttribute('data-translation-pending');
                return;
            }
            const key = `${target}\u0000${original}`;
            const cached = translatedCache.get(key);
            if (cached) {
                if (element.textContent !== cached) element.textContent = cached;
                element.removeAttribute('data-translation-pending');
                return;
            }
            element.setAttribute('data-translation-pending', 'true');
            pending.push({ element, original, key });
        });

        for (let offset = 0; offset < pending.length; offset += 32) {
            const batch = pending.slice(offset, offset + 32);
            const values = await translateBatch(batch.map(item => item.original), target);
            if (run !== generation || target !== currentLanguage()) return;
            batch.forEach((item, index) => {
                const translated = values[index] || item.original;
                translatedCache.set(item.key, translated);
                if (item.element.isConnected && originals.get(item.element) === item.original) {
                    item.element.textContent = translated;
                    item.element.removeAttribute('data-translation-pending');
                    item.element.dataset.translationLanguage = target;
                }
            });
        }
    }

    function scheduleRefresh(root = document) {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => refresh(root).catch(() => {}), 40);
    }

    function init() {
        // Админка содержит постоянно обновляемые таблицы. Перевод пользовательских
        // данных там создавал каскад MutationObserver и сетевых запросов.
        // Статический интерфейс по-прежнему переводит interface-language.js.
        if (document.body?.classList.contains('admin-page')) return;

        scheduleRefresh();
        window.addEventListener('bibliotech:languagechange', () => scheduleRefresh());
        observer = new MutationObserver(mutations => {
            if (mutations.some(mutation => mutation.addedNodes.length || mutation.type === 'attributes')) scheduleRefresh();
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-user-content'] });
    }

    window.BibliotechContentTranslation = { refresh: scheduleRefresh, currentLanguage };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
