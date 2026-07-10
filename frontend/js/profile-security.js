(function () {
    'use strict';

    const API_URL = window.BIBLIOTECH_API_URL || '/api';
    const SESSION_KEY = 'bibliotech_current_user';

    function getSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
        catch { return null; }
    }

    function tokenHeaders() {
        const token = localStorage.getItem('token');
        return {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : ''
        };
    }

    function injectStyles() {
        if (document.getElementById('profileSecurityStyles')) return;
        const style = document.createElement('style');
        style.id = 'profileSecurityStyles';
        style.textContent = `
            .profile-security-panel {
                padding: 16px;
                border: 1px solid var(--border);
                border-radius: var(--radius);
                background: var(--surface);
                box-shadow: var(--shadow-soft);
            }
            .profile-security-head {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 14px;
            }
            .profile-security-head h3 { margin: 0; font-size: 18px; }
            .profile-security-head p { margin: 4px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
            .security-status-badge {
                align-self: flex-start;
                padding: 7px 10px;
                border-radius: 999px;
                background: var(--surface-muted);
                color: var(--muted);
                font-size: 12px;
                font-weight: 900;
                white-space: nowrap;
            }
            .security-status-badge.enabled { background: var(--ok-soft); color: var(--ok); }
            .profile-security-grid { display: grid; gap: 10px; }
            .security-option-card {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 12px;
                align-items: center;
                padding: 12px;
                border: 1px solid var(--border);
                border-radius: var(--radius);
                background: var(--bg-soft);
            }
            .security-option-card b { display: block; color: var(--text); }
            .security-option-card small { display: block; margin-top: 3px; color: var(--muted); line-height: 1.35; }
            .security-switch {
                position: relative;
                width: 54px;
                height: 30px;
                border: 0;
                border-radius: 999px;
                background: var(--surface-muted);
                cursor: pointer;
            }
            .security-switch::after {
                content: '';
                position: absolute;
                top: 4px;
                left: 4px;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                background: var(--surface);
                box-shadow: var(--shadow-soft);
                transition: transform .18s ease;
            }
            .security-switch.active { background: linear-gradient(135deg, var(--accent), var(--accent-strong)); }
            .security-switch.active::after { transform: translateX(24px); }
            .twofa-setup-box {
                display: none;
                margin-top: 12px;
                padding: 12px;
                border: 1px solid var(--border);
                border-radius: var(--radius);
                background: var(--surface-muted);
            }
            .twofa-setup-box.active { display: grid; gap: 10px; }
            .twofa-qr-row {
                display: grid;
                grid-template-columns: 130px minmax(0, 1fr);
                gap: 12px;
                align-items: center;
            }
            .twofa-qr-code {
                width: 130px;
                min-height: 130px;
                display: grid;
                place-items: center;
                padding: 8px;
                border-radius: 14px;
                background: #fff;
            }
            .twofa-secret {
                padding: 8px 10px;
                border: 1px solid var(--border);
                border-radius: 10px;
                background: var(--surface);
                color: var(--text);
                word-break: break-all;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                font-size: 12px;
            }
            .twofa-actions {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 8px;
            }
            .twofa-actions input {
                min-height: 42px;
                border: 1px solid var(--border);
                border-radius: 12px;
                background: var(--surface);
                color: var(--text);
                padding: 9px 11px;
            }
            .profile-security-panel button.security-primary,
            .profile-security-panel button.security-danger,
            .profile-security-panel button.security-soft {
                min-height: 42px;
                padding: 9px 12px;
                border-radius: 12px;
                border: 1px solid var(--border);
                cursor: pointer;
                font-weight: 900;
            }
            .security-primary { background: linear-gradient(135deg, var(--accent), var(--accent-strong)); color: var(--on-accent); border: 0 !important; }
            .security-danger { background: var(--danger-soft); color: var(--danger); }
            .security-soft { background: var(--surface); color: var(--text); }
            .security-message { min-height: 18px; margin-top: 10px; color: var(--muted); font-size: 13px; text-align: center; }
            .security-message.error { color: var(--danger); }
            .security-message.ok { color: var(--ok); }
            @media (max-width: 560px) {
                .profile-security-head { flex-direction: column; }
                .security-status-badge { width: fit-content; }
                .security-option-card { grid-template-columns: 1fr; }
                .security-switch { justify-self: start; }
                .twofa-qr-row { grid-template-columns: 1fr; justify-items: center; text-align: center; }
                .twofa-actions { grid-template-columns: 1fr; }
            }
        `;
        document.head.appendChild(style);
    }

    function ensurePanel() {
        window.BibliotechSettings?.ensure?.();
        const mount = document.getElementById('accountSettingsSecurityMount');
        if (!mount) return null;

        let panel = document.getElementById('profileSecurityPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'profile-security-panel';
            panel.id = 'profileSecurityPanel';
            panel.innerHTML = `
                <div class="profile-security-head">
                    <div>
                        <h3>Безопасность аккаунта</h3>
                        <p>Защита входа и управление текущей сессией.</p>
                    </div>
                    <span class="security-status-badge" id="securityStatusBadge">Проверка...</span>
                </div>
                <div class="profile-security-grid">
                    <div class="security-option-card">
                        <div><b>Двухфакторная аутентификация</b><small>Подтверждайте вход кодом из приложения-аутентификатора.</small></div>
                        <button class="security-primary" id="twofaStartBtn" type="button">Настроить</button>
                    </div>
                    <div class="twofa-setup-box" id="twofaSetupBox">
                        <div class="twofa-qr-row">
                            <div class="twofa-qr-code" id="twofaQrCode">QR</div>
                            <div>
                                <b>1. Отсканируйте QR</b>
                                <small>Если QR не читается, введите ключ вручную:</small>
                                <div class="twofa-secret" id="twofaSecret">—</div>
                            </div>
                        </div>
                        <div class="twofa-actions">
                            <input id="twofaConfirmCode" inputmode="numeric" autocomplete="one-time-code" placeholder="6-значный код">
                            <button class="security-primary" id="twofaEnableBtn" type="button">Включить</button>
                        </div>
                    </div>
                    <div class="security-option-card" id="twofaDisableCard" hidden>
                        <div><b>Отключить 2FA</b><small>Для отключения нужен текущий код из приложения.</small></div>
                        <div class="twofa-actions"><input id="twofaDisableCode" inputmode="numeric" placeholder="Код 2FA"><button class="security-danger" id="twofaDisableBtn" type="button">Отключить</button></div>
                    </div>
                    <div class="security-option-card">
                        <div><b>Запоминать вход</b><small>Оставаться в аккаунте на этом устройстве дольше.</small></div>
                        <button class="security-switch" id="rememberSessionToggle" type="button" aria-label="Запоминать вход"></button>
                    </div>
                </div>
                <div class="security-message" id="securityMessage"></div>
            `;
        }

        if (panel.parentElement !== mount) mount.appendChild(panel);
        wireEvents(panel);
        return panel;
    }

    function setMessage(text = '', type = '') {
        const el = document.getElementById('securityMessage');
        if (!el) return;
        el.className = `security-message ${type}`.trim();
        el.textContent = text;
    }

    function setSwitch(id, value) {
        document.getElementById(id)?.classList.toggle('active', Boolean(value));
    }

    function renderSettings(settings = {}) {
        const enabled = Boolean(settings.twoFactorEnabled);
        const badge = document.getElementById('securityStatusBadge');
        if (badge) {
            badge.textContent = enabled ? '2FA включена' : '2FA выключена';
            badge.classList.toggle('enabled', enabled);
        }
        const start = document.getElementById('twofaStartBtn');
        if (start) start.textContent = enabled ? 'Перенастроить' : 'Настроить';
        const disableCard = document.getElementById('twofaDisableCard');
        if (disableCard) disableCard.hidden = !enabled;
        setSwitch('rememberSessionToggle', settings.rememberSessionEnabled !== false);
        window.__bibliotechSecuritySettings = settings;
    }

    function makeQr(text) {
        const target = document.getElementById('twofaQrCode');
        if (!target) return;
        target.innerHTML = '';
        try {
            if (typeof window.qrcode !== 'function') throw new Error('QR library unavailable');
            const qr = window.qrcode(0, 'M');
            qr.addData(text);
            qr.make();
            target.innerHTML = qr.createImgTag(4, 4);
        } catch {
            target.textContent = 'QR недоступен';
        }
    }

    async function loadSecuritySettings() {
        injectStyles();
        if (!ensurePanel()) return;
        const session = getSession();
        if (!session || session.guest) {
            renderSettings({ twoFactorEnabled: false, rememberSessionEnabled: false });
            setMessage('Настройки безопасности доступны после входа в аккаунт.');
            return;
        }
        try {
            const response = await fetch(`${API_URL}/auth/security`, { headers: tokenHeaders() });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'load failed');
            renderSettings(data.settings || {});
            setMessage('');
        } catch {
            setMessage('Не удалось загрузить настройки безопасности.', 'error');
        }
    }

    async function saveOptions() {
        const current = window.__bibliotechSecuritySettings || {};
        const rememberToggle = document.getElementById('rememberSessionToggle');
        const body = {
            loginAlertsEnabled: Boolean(current.loginAlertsEnabled),
            profilePrivateEnabled: Boolean(current.profilePrivateEnabled),
            rememberSessionEnabled: rememberToggle
                ? rememberToggle.classList.contains('active')
                : current.rememberSessionEnabled !== false
        };
        try {
            const response = await fetch(`${API_URL}/auth/security/options`, {
                method: 'POST', headers: tokenHeaders(), body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'save failed');
            renderSettings(data.settings || { ...current, ...body });
            setMessage('Настройка сохранена.', 'ok');
        } catch {
            renderSettings(current);
            setMessage('Не удалось сохранить настройку.', 'error');
        }
    }

    async function startTwoFactorSetup() {
        try {
            const response = await fetch(`${API_URL}/auth/security/2fa/setup`, { method: 'POST', headers: tokenHeaders() });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'setup failed');
            document.getElementById('twofaSetupBox')?.classList.add('active');
            const secret = document.getElementById('twofaSecret');
            if (secret) secret.textContent = data.secret || '—';
            makeQr(data.otpauthUrl || data.secret || '');
            setMessage('Отсканируйте QR и введите код из приложения.', 'ok');
        } catch {
            setMessage('Не удалось начать настройку 2FA.', 'error');
        }
    }

    async function enableTwoFactor() {
        const code = document.getElementById('twofaConfirmCode')?.value.trim();
        if (!code) return setMessage('Введите 6-значный код из приложения.', 'error');
        try {
            const response = await fetch(`${API_URL}/auth/security/2fa/enable`, {
                method: 'POST', headers: tokenHeaders(), body: JSON.stringify({ code })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'enable failed');
            document.getElementById('twofaSetupBox')?.classList.remove('active');
            document.getElementById('twofaConfirmCode').value = '';
            renderSettings(data.settings || {});
            setMessage('2FA включена. При следующем входе потребуется код.', 'ok');
        } catch (error) {
            setMessage(error.message || 'Неверный код 2FA.', 'error');
        }
    }

    async function disableTwoFactor() {
        const code = document.getElementById('twofaDisableCode')?.value.trim();
        if (!code) return setMessage('Введите текущий код 2FA.', 'error');
        try {
            const response = await fetch(`${API_URL}/auth/security/2fa/disable`, {
                method: 'POST', headers: tokenHeaders(), body: JSON.stringify({ code })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'disable failed');
            document.getElementById('twofaDisableCode').value = '';
            renderSettings(data.settings || {});
            setMessage('2FA отключена.', 'ok');
        } catch (error) {
            setMessage(error.message || 'Не удалось отключить 2FA.', 'error');
        }
    }

    function wireEvents(panel) {
        if (!panel || panel.dataset.securityReady === 'true') return;
        panel.dataset.securityReady = 'true';
        panel.querySelector('#twofaStartBtn')?.addEventListener('click', startTwoFactorSetup);
        panel.querySelector('#twofaEnableBtn')?.addEventListener('click', enableTwoFactor);
        panel.querySelector('#twofaDisableBtn')?.addEventListener('click', disableTwoFactor);
        panel.querySelector('#rememberSessionToggle')?.addEventListener('click', event => {
            event.currentTarget.classList.toggle('active');
            saveOptions();
        });
    }

    function initProfileSecurity() {
        injectStyles();
        ensurePanel();
        document.addEventListener('bibliotech:settings-open', event => {
            if (event.detail?.section === 'security') loadSecuritySettings();
        });
    }

    window.BibliotechSecurity = {
        ensure: ensurePanel,
        load: loadSecuritySettings,
        render: renderSettings
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initProfileSecurity, { once: true });
    else initProfileSecurity();
})();
