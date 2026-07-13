(function () {
    'use strict';

    const apiBase = window.BIBLIOTECH_API_URL || '/api';
    const sessionKey = 'bibliotech_current_user';

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

    async function loginWithPasskey() {
        const button = document.getElementById('passkeyLoginBtn');
        if (!window.PublicKeyCredential || !navigator.credentials?.get) {
            setError('Этот браузер не поддерживает вход по passkey. Используйте обычный пароль.');
            return;
        }
        setError('');
        if (button) {
            button.disabled = true;
            button.dataset.label = button.textContent;
            button.textContent = 'Подтвердите вход на устройстве...';
        }
        try {
            const username = document.getElementById('loginUsername')?.value.trim() || '';
            const optionsResponse = await fetch(`${apiBase}/auth/passkeys/authenticate/options`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            const optionsData = await optionsResponse.json();
            if (!optionsResponse.ok) throw new Error(optionsData.error || 'Не удалось начать вход по passkey');
            const credential = await navigator.credentials.get({
                publicKey: publicKeyRequestOptions(optionsData.options)
            });
            if (!credential) throw new Error('Passkey не выбран');
            const verifyResponse = await fetch(`${apiBase}/auth/passkeys/authenticate/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    flowId: optionsData.flowId,
                    credential: serializeAuthentication(credential)
                })
            });
            const verifyData = await verifyResponse.json();
            if (!verifyResponse.ok) throw new Error(verifyData.message || verifyData.error || 'Вход по passkey не выполнен');
            finishLogin(verifyData);
        } catch (error) {
            if (error?.name === 'NotAllowedError') setError('Вход отменён или устройство не подтвердило passkey.');
            else setError(error.message || 'Не удалось выполнить вход по passkey.');
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = button.dataset.label || 'Войти по passkey';
            }
        }
    }

    function init() {
        const button = document.getElementById('passkeyLoginBtn');
        if (!button) return;
        button.hidden = !window.PublicKeyCredential || !navigator.credentials?.get;
        button.addEventListener('click', loginWithPasskey);
    }

    window.loginWithPasskey = loginWithPasskey;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
