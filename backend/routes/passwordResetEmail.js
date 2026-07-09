const express = require('express');
const nodemailer = require('nodemailer');
const pool = require('../db/pool');
const { hashPassword } = require('../utils/passwords');
const localStore = require('../services/localStore');

const router = express.Router();
const RESET_CODE_TTL_MS = 15 * 60 * 1000;

function normalizeEmail(email = '') {
    return String(email).trim().toLowerCase();
}

function isValidEmail(email = '') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function createResetCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

async function ensureResetSchema() {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)');
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (LOWER(email)) WHERE email IS NOT NULL');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            code_hash VARCHAR(255) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

function buildMail(username, code) {
    const safeUsername = String(username || 'пользователя').replace(/[<>]/g, '');
    const text = `BIBLIOTECH\n\nКод восстановления для ${safeUsername}: ${code}\nКод действует 15 минут.\n\nЕсли вы не запрашивали восстановление, просто игнорируйте это письмо.`;
    const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">
            <h2 style="margin:0 0 12px">BIBLIOTECH</h2>
            <p>Код восстановления для <b>${safeUsername}</b>:</p>
            <p style="font-size:30px;font-weight:800;letter-spacing:6px;margin:18px 0">${code}</p>
            <p>Код действует 15 минут.</p>
            <p style="color:#6b7280;font-size:13px">Если вы не запрашивали восстановление, просто игнорируйте это письмо.</p>
        </div>
    `;
    return { text, html };
}

function hasSmtpConfig() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function classifySmtpError(error) {
    const raw = String(error?.message || error?.response || '').toLowerCase();
    const responseCode = Number(error?.responseCode || 0);
    if (!hasSmtpConfig()) {
        return {
            reason: 'SMTP_NOT_CONFIGURED',
            publicMessage: 'В Render не заполнены SMTP_HOST, SMTP_USER или SMTP_PASS.'
        };
    }
    if (error?.code === 'EAUTH' || responseCode === 535 || raw.includes('invalid login') || raw.includes('bad credentials')) {
        return {
            reason: 'SMTP_AUTH_FAILED',
            publicMessage: 'Gmail не принял SMTP_USER или SMTP_PASS. В SMTP_PASS нужен пароль приложения Gmail, не обычный пароль.'
        };
    }
    if (responseCode === 534 || raw.includes('application-specific password') || raw.includes('app password')) {
        return {
            reason: 'GMAIL_APP_PASSWORD_REQUIRED',
            publicMessage: 'Для Gmail нужен пароль приложения. Включите 2FA в аккаунте bibliotech.2fa@gmail.com и создайте App Password.'
        };
    }
    if (raw.includes('self signed') || raw.includes('certificate')) {
        return {
            reason: 'SMTP_TLS_FAILED',
            publicMessage: 'Ошибка TLS/SSL SMTP. Для Gmail используйте SMTP_PORT=465 и SMTP_SECURE=true.'
        };
    }
    if (raw.includes('timeout') || raw.includes('timed out') || error?.code === 'ETIMEDOUT') {
        return {
            reason: 'SMTP_TIMEOUT',
            publicMessage: 'SMTP-сервер не ответил вовремя. Проверьте SMTP_HOST и SMTP_PORT.'
        };
    }
    return {
        reason: 'SMTP_SEND_FAILED',
        publicMessage: 'SMTP не отправил письмо. Посмотрите Render Logs: строку [RESET_EMAIL] SMTP failed.'
    };
}

function createSmtpTransporter() {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

async function sendViaSmtp(email, username, code) {
    if (!hasSmtpConfig()) return { sent: false, reason: 'SMTP_NOT_CONFIGURED', publicMessage: 'В Render не заполнены SMTP_HOST, SMTP_USER или SMTP_PASS.' };
    const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER;
    const { text, html } = buildMail(username, code);
    const transporter = createSmtpTransporter();
    await transporter.sendMail({
        from,
        to: email,
        subject: 'Код восстановления BIBLIOTECH',
        text,
        html
    });
    return { sent: true, provider: 'smtp' };
}

async function sendViaResend(email, username, code) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) return { sent: false, reason: 'RESEND_NOT_CONFIGURED' };
    const { text, html } = buildMail(username, code);
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from, to: [email], subject: 'Код восстановления BIBLIOTECH', text, html })
    });
    if (response.ok) return { sent: true, provider: 'resend' };
    const details = await response.text().catch(() => '');
    console.warn('[RESET_EMAIL] Resend failed:', response.status, details);
    return { sent: false, reason: 'RESEND_REJECTED', status: response.status };
}

async function sendResetEmail(email, username, code) {
    let smtpFailure = null;
    try {
        const smtp = await sendViaSmtp(email, username, code);
        if (smtp.sent) return smtp;
        smtpFailure = smtp;
    } catch (error) {
        console.warn('[RESET_EMAIL] SMTP failed:', error.message);
        smtpFailure = classifySmtpError(error);
    }

    try {
        const resend = await sendViaResend(email, username, code);
        if (resend.sent) return resend;
        return smtpFailure || resend;
    } catch (error) {
        console.warn('[RESET_EMAIL] Resend error:', error.message);
        return smtpFailure || { sent: false, reason: 'EMAIL_SEND_FAILED', message: error.message };
    }
}

router.post('/password-reset/request', async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Введите корректную почту' });
    }

    try {
        await ensureResetSchema();
        const result = await pool.query('SELECT id, username, email FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.json({ message: 'Если почта есть в системе, код будет отправлен.', emailSent: true });
        }

        const code = createResetCode();
        const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
        await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [user.id]);
        await pool.query(
            'INSERT INTO password_reset_tokens (user_id, code_hash, expires_at) VALUES ($1, $2, $3)',
            [user.id, hashPassword(code), expiresAt]
        );

        const delivery = await sendResetEmail(user.email, user.username, code);
        if (!delivery.sent) {
            return res.status(503).json({
                error: delivery.publicMessage || 'Письмо не отправлено: на сервере не настроена почта или провайдер отклонил отправку.',
                emailSent: false,
                reason: delivery.reason || 'EMAIL_SEND_FAILED'
            });
        }

        res.json({ message: 'Код отправлен на почту', emailSent: true, provider: delivery.provider });
    } catch (error) {
        console.warn('[RESET_EMAIL] DB reset route failed:', error.message);
        try {
            const fallback = localStore.createPasswordReset(email);
            return res.status(503).json({
                error: 'Письмо не отправлено: сервер работает без основной базы или почта не настроена.',
                emailSent: false,
                reason: fallback ? 'LOCAL_FALLBACK_NO_EMAIL' : 'RESET_UNAVAILABLE'
            });
        } catch {
            return res.status(500).json({ error: 'Не удалось создать код восстановления' });
        }
    }
});

module.exports = router;
