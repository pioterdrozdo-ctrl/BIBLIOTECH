const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const os = require('os');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

require('./services/registerAccountFallback');
const sessionAuthRoutes = require('./routes/sessionAuth');
const securityRoutes = require('./routes/security');
const passwordResetEmailRoutes = require('./routes/passwordResetEmail');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');
const bookImportRoutes = require('./routes/bookImport');
const bookRoutes = require('./routes/books');
const commentRoutes = require('./routes/comments');
const statsRoutes = require('./routes/stats');
const catalogListRoutes = require('./routes/catalogList');
const storageLocationRoutes = require('./routes/storageLocations');
const rentalRoutes = require('./routes/rentals');
const pool = require('./db/pool');

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');
const isProduction = process.env.NODE_ENV === 'production';
const manifestThemes = {
    light: { icon: '/img/appicon-light.png', themeColor: '#f5f2ec', backgroundColor: '#f5f2ec' },
    dark: { icon: '/img/appicon-dark.png', themeColor: '#0d1512', backgroundColor: '#0d1512' },
    forest: { icon: '/img/appicon-forest.png', themeColor: '#071b13', backgroundColor: '#071b13' },
    ocean: { icon: '/img/appicon-ocean.png', themeColor: '#071724', backgroundColor: '#071724' },
    sunset: { icon: '/img/appicon-sunset.png', themeColor: '#fff3e3', backgroundColor: '#fff3e3' },
    violet: { icon: '/img/appicon-violet.png', themeColor: '#15091f', backgroundColor: '#15091f' },
    coffee: { icon: '/img/appicon-coffee.png', themeColor: '#f3e9dc', backgroundColor: '#f3e9dc' },
    mono: { icon: '/img/appicon-mono.png', themeColor: '#111111', backgroundColor: '#111111' }
};

const criticalUiStyles = [
    '/css/ui-refresh.css?v=20260710-ui-refresh-1',
    '/css/ui-refresh-release-fix.css?v=20260710-ui-release-fix-2',
    '/css/product-polish.css?v=20260710-product-polish-1',
    '/css/theme-mode-preview.css?v=20260710-theme-mode-preview-1',
    '/css/liquid-theme-toggle.css?v=20260710-liquid-theme-2'
];

const criticalUiScripts = [
    '/js/product-polish.js?v=20260710-product-polish-1'
];

const homeCriticalStyles = [
    '/css/profile-twitter-restored.css?v=20260710-profile-evolved-2',
    '/css/profile-customization-modal.css?v=20260710-profile-customize-modal-1',
    '/css/profile-settings-modal.css?v=20260710-profile-settings-1',
    '/css/account-settings-features.css?v=20260710-account-settings-1'
];

const homeCriticalScripts = [
    '/js/rentals-request-guard.js?v=20260710-rentals-guard-1',
    '/js/profile-rentals.js?v=20260709-profile-rentals-1',
    '/js/profile-twitter.js?v=20260710-profile-customize-modal-1',
    '/js/profile-customization-modal.js?v=20260710-profile-customize-modal-1',
    '/js/profile-settings-modal.js?v=20260710-profile-settings-2',
    '/js/account-settings-close-guard.js?v=20260710-account-settings-close-1',
    '/js/profile-security.js?v=20260710-profile-security-modal-1',
    '/js/account-settings-features.js?v=20260710-account-settings-1',
    '/js/modal-visual-fix.js?v=20260710-modal-visual-fix-2',
    '/js/card-rent-safe.js?v=20260710-card-rent-refined-1',
    '/js/comment-clear-fix.js?v=20260710-comment-clear-1'
];

function buildManifest(themeName = 'forest') {
    const theme = manifestThemes[themeName] || manifestThemes.light;
    return {
        name: 'BIBLIOTECH',
        short_name: 'BIBLIOTECH',
        description: 'Мобильный каталог библиотеки с общей базой книг, комментариев и статистики.',
        lang: 'ru',
        start_url: `/home.html?source=pwa&theme=${encodeURIComponent(themeName)}`,
        scope: '/',
        id: '/?app=bibliotech',
        display: 'standalone',
        display_override: ['standalone', 'browser'],
        orientation: 'portrait-primary',
        background_color: theme.backgroundColor,
        theme_color: theme.themeColor,
        categories: ['education', 'books', 'productivity'],
        icons: [
            { src: theme.icon, sizes: '256x256', type: 'image/png', purpose: 'any' },
            { src: theme.icon, sizes: '256x256', type: 'image/png', purpose: 'any maskable' }
        ],
        shortcuts: [
            {
                name: 'Каталог',
                short_name: 'Каталог',
                url: '/home.html?source=pwa-shortcut',
                icons: [{ src: theme.icon, sizes: '256x256', type: 'image/png' }]
            },
            {
                name: 'Статистика',
                short_name: 'Статистика',
                url: '/stats.html?source=pwa-shortcut',
                icons: [{ src: '/img/appicon-ocean.png', sizes: '256x256', type: 'image/png' }]
            }
        ]
    };
}

function injectCriticalUiAssets(html, { home = false } = {}) {
    const styles = [...criticalUiStyles, ...(home ? homeCriticalStyles : [])];
    const styleTags = styles
        .filter(asset => !html.includes(asset.split('?')[0]))
        .map(asset => `<link rel="stylesheet" href="${asset}" data-bibliotech-critical="true">`)
        .join('\n    ');

    if (styleTags && html.includes('</head>')) {
        html = html.replace('</head>', `    ${styleTags}\n</head>`);
    }

    const scripts = [...criticalUiScripts, ...(home ? homeCriticalScripts : [])];
    const scriptTags = scripts
        .filter(asset => !html.includes(asset.split('?')[0]))
        .map(asset => `<script src="${asset}" data-bibliotech-critical="true"></script>`)
        .join('\n');

    if (scriptTags) {
        const pwaPattern = /<script src="(?:\/)?js\/pwa\.js(?:\?[^\"]*)?"><\/script>/;
        if (pwaPattern.test(html)) {
            html = html.replace(pwaPattern, `${scriptTags}\n<script src="/js/pwa.js?v=20260710-critical-ui-7"></script>`);
        } else {
            html = html.replace('</body>', `${scriptTags}\n<script src="/js/pwa.js?v=20260710-critical-ui-7"></script>\n</body>`);
        }
    }

    return html;
}

function prepareFrontendHtml(fileName, { home = false } = {}) {
    const htmlPath = path.join(frontendPath, fileName);
    let html = fs.readFileSync(htmlPath, 'utf8');

    if (home) {
        html = html.replace(
            "if (!rawSession) window.location.href = 'index.html';",
            `if (!rawSession) {
                try {
                    const target = window.location.pathname + window.location.search + window.location.hash;
                    if (target && target !== '/home.html') localStorage.setItem('bibliotech_post_login_url', target);
                } catch (e) {}
                window.location.href = 'index.html';
            }`
        );
        html = html.replace(
            /<script src="js\/script\.js(?:\?[^\"]*)?"><\/script>/,
            '<script src="/js/script.js?v=20260707-2"></script>\n<script src="/js/catalog-fix.js?v=20260707-2"></script>'
        );
    }

    return injectCriticalUiAssets(html, { home });
}

function sendFrontendPage(fileName, options = {}) {
    return (req, res, next) => {
        try {
            res.setHeader('Cache-Control', 'no-cache');
            res.type('html');
            res.send(prepareFrontendHtml(fileName, options));
        } catch (error) {
            next(error);
        }
    };
}

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProduction ? 500 : 2000,
    standardHeaders: true,
    legacyHeaders: false
});

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.get('/manifest.webmanifest', (req, res) => {
    const requestedTheme = String(req.query.theme || 'forest').toLowerCase();
    const themeName = Object.prototype.hasOwnProperty.call(manifestThemes, requestedTheme) ? requestedTheme : 'forest';
    res.setHeader('Cache-Control', 'no-cache');
    res.type('application/manifest+json; charset=utf-8');
    res.send(JSON.stringify(buildManifest(themeName)));
});

app.get(['/', '/index.html'], sendFrontendPage('index.html'));
app.get('/home.html', sendFrontendPage('home.html', { home: true }));
app.get('/stats.html', sendFrontendPage('stats.html'));
app.get('/about.html', sendFrontendPage('about.html'));
app.get('/admin.html', sendFrontendPage('admin.html'));

app.use(express.static(frontendPath, {
    extensions: ['html'],
    index: false,
    maxAge: isProduction ? '1h' : 0,
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath);
        const fileName = path.basename(filePath);
        if (['.html', '.js', '.css'].includes(ext) || fileName === 'sw.js' || fileName === 'manifest.webmanifest') {
            res.setHeader('Cache-Control', 'no-cache');
        }
        if (fileName === 'manifest.webmanifest') {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        }
    }
}));

// Only API traffic counts toward the rate limit. Static assets and PWA cache refreshes must never block login.
app.use('/api', limiter);
app.use('/api/auth', sessionAuthRoutes);
app.use('/api/auth', securityRoutes);
app.use('/api/auth', passwordResetEmailRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/books/import', bookImportRoutes);
app.use('/api/books', catalogListRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/storage-locations', storageLocationRoutes);
app.use('/api/rentals', rentalRoutes);

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        storage: 'postgres-or-json-fallback'
    });
});

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

app.get('*', sendFrontendPage('index.html'));

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

function hasPostgresConfig() {
    return Boolean(pool.isConfigured);
}

async function initDatabase() {
    if (!hasPostgresConfig()) {
        console.log('[DB] PostgreSQL is not configured. Using JSON fallback storage.');
        return;
    }

    try {
        const schemaPath = path.join(__dirname, 'sql', 'init.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(schemaSql);
        await pool.query(`
            ALTER TABLE books ADD COLUMN IF NOT EXISTS qr_code VARCHAR(32);
            ALTER TABLE books ADD COLUMN IF NOT EXISTS location_id INTEGER;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER DEFAULT 1;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_books_qr_code ON books(qr_code);
            UPDATE books SET qr_code = 'BT' || LPAD(id::text, 6, '0') WHERE qr_code IS NULL;
        `);
        console.log('[DB] PostgreSQL schema is ready.');
    } catch (error) {
        console.warn('[DB] PostgreSQL init failed. JSON fallback remains available:', error.message);
    }
}

function getNetworkUrls(port) {
    return Object.values(os.networkInterfaces())
        .flat()
        .filter(info => info && info.family === 'IPv4' && !info.internal)
        .map(info => `http://${info.address}:${port}`);
}

initDatabase().finally(() => {
    app.listen(PORT, HOST, () => {
        console.log(`[OK] Server running on http://${HOST}:${PORT}`);
        console.log(`[OK] Local:   http://localhost:${PORT}`);
        getNetworkUrls(PORT).forEach(url => console.log(`[OK] Phone:   ${url}`));
    });
});
