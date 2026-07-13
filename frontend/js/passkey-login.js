(function () {
    'use strict';

    const apiBase = window.BIBLIOTECH_API_URL || '/api';
    const sessionKey = 'bibliotech_current_user';
    let activeController = null;
    let requestGeneration = 0;
    let conditionalAvailabilityPromise = null;

    function decodeBase64Url(value) {
        const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
        const binary = atob(base64);
        return Uint8Array.from(binary, char => char.charCodeAt(0));
    }

    function encodeBase64Url(value) {
        const bytes = new Uint8Array(value);
        let binary = '';
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function publicKeyRequestOptions(options) {
        return {
            ...options,
            challenge: decodeBase64Url(options.challenge),
            allowCredentials: (options.allowCredentials || []).map(item => ({ ...item, id: decodeBase64Url(item.id) }))
        };
    }

    function serializeAuthentication(credential) {
        return {
            id: credential.id,
            rawId: encodeBase64Url(credential.rawId),
            type: credential.type,
            authenticatorAttachment: credential.authenticatorAttachment || null,
            clientExtensionResults: credential.getClientExtensionResults?.() || {},
            response: {
                clientDataJSON: encodeBase64Url(credential.response.clientDataJSON),
                authenticatorData: encodeBase64Url(credential.response.authenticatorData),
                signature: encodeBase64Url(credential.response.signature),
                userHandle: credential.response.userHandle ? encodeBase64Url(credential.response.userHandle) : null
            }
        };
    }

    function setError(message = '') {
        const error = document.getElementById('loginError');
        if (error) error.textContent = message;
    }

    function finishLogin(data) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem(sessionKey, JSON.stringify({
            id: data.user.id,
            username: data.user.username,
            email: data.user.email,
            role: data.user.role
        }));
        const destination = typeof window.getPostLoginUrl === 'function' ? window.getPostLoginUrl() : 'home.html';
        window.location.href = destination;
    }

    function passkeySupported() {
        return Boolean(window.PublicKeyCredential && navigator.credentials?.get);
    }

    function loginPanelActive() {
        return document.getElementById('loginForm')?.classList.contains('active') !== false;
    }

    function conditionalMediationAvailable() {
        if (!passkeySupported() || typeof PublicKeyCredential.isConditionalMediationAvailable !== 'function') {
            return Promise.resolve(false);
        }
        if (!conditionalAvailabilityPromise) {
            conditionalAvailabilityPromise = PublicKeyCredential.isConditionalMediationAvailable().catch(() => false);
        }
        return conditionalAvailabilityPromise;
    }

    function stopAutomaticPasskey() {
        requestGeneration += 1;
        activeController?.abort();
        activeController = null;
    }

    async function authenticateWithPasskey({ username = '', mediation = 'optional', silent = true } = {}) {
        if (!passkeySupported()) return false;
        stopAutomaticPasskey();
        const generation = requestGeneration;
        const controller = new AbortController();
        activeController = controller;
        let credentialSelected = false;

        try {
            const optionsResponse = await fetch(`${apiBase}/auth/passkeys/authenticate/options`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }),
                signal: controller.signal
            });
            const optionsData = await optionsResponse.json();
            if (!optionsResponse.ok) {
                if (silent) return false;
                throw new Error(optionsData.error || 'Не удалось начать вход по passkey');
            }
            const credential = await navigator.credentials.get({
                publicKey: publicKeyRequestOptions(optionsData.options),
                mediation,
                signal: controller.signal
            });
            if (!credential) return false;
            credentialSelected = true;
            const verifyResponse = await fetch(`${apiBase}/auth/passkeys/authenticate/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    flowId: optionsData.flowId,
                    credential: serializeAuthentication(credential)
                }),
                signal: controller.signal
            });
            const verifyData = await verifyResponse.json();
            if (!verifyResponse.ok) throw new Error(verifyData.message || verifyData.error || 'Вход по passkey не выполнен');
            finishLogin(verifyData);
            return true;
        } catch (error) {
            const expectedCancellation = error?.name === 'AbortError' || error?.name === 'NotAllowedError';
            if ((!silent || credentialSelected) && !expectedCancellation) {
                setError(error.message || 'Не удалось выполнить вход по passkey.');
            }
            return false;
        } finally {
            if (generation === requestGeneration && activeController === controller) activeController = null;
        }
    }

    async function startAutomaticPasskey() {
        if (!passkeySupported() || activeController || !loginPanelActive() || document.visibilityState === 'hidden') return false;
        if (!await conditionalMediationAvailable()) return false;
        if (activeController || !loginPanelActive() || document.visibilityState === 'hidden') return false;
        return authenticateWithPasskey({ mediation: 'conditional', silent: true });
    }

    async function tryUsernamePasskey() {
        if (!passkeySupported() || activeController || !loginPanelActive()) return false;
        if (await conditionalMediationAvailable()) return false;
        const username = document.getElementById('loginUsername')?.value.trim() || '';
        const password = document.getElementById('loginPassword')?.value || '';
        if (!username || password) return false;
        return authenticateWithPasskey({ username, mediation: 'optional', silent: true });
    }

    function init() {
        if (!passkeySupported()) return;
        const usernameInput = document.getElementById('loginUsername');
        usernameInput?.addEventListener('change', tryUsernamePasskey);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') stopAutomaticPasskey();
            else startAutomaticPasskey();
        });
        startAutomaticPasskey();
    }

    window.loginWithPasskey = authenticateWithPasskey;
    window.startAutomaticPasskey = startAutomaticPasskey;
    window.stopAutomaticPasskey = stopAutomaticPasskey;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
