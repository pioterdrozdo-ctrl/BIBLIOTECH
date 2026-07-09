const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const os = require('os');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const securityRoutes = require('./routes/security');
const passwordResetEmailRoutes = require('./routes/passwordResetEmail');
const authRoutes = require('./routes/auth');
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

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProduction ? 500 : 2000,
    standardHeaders: true,
    legacyHeaders: false
});

// Middleware
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(limiter);

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

app.get('/home.html', (req, res) => {
    const htmlPath = path.join(frontendPath, 'home.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
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
        '<script src="js/script.js?v=20260707-2"></script>\n<script src="js/catalog-fix.js?v=20260707-2"></script>'
    );
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html');
    res.send(html);
});

app.use(express.static(frontendPath, {
    extensions: ['html'],
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

// Routes
app.use('/api/auth', securityRoutes);
app.use('/api/auth', passwordResetEmailRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/books', catalogListRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/storage-locations', storageLocationRoutes);
app.use('/api/rentals', rentalRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        storage: 'postgres-or-json-fallback'
    });
});

// ОТДАЕМ HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/about.html', (req, res) => {
    res.sendFile(path.join(frontendPath, 'about.html'));
});

app.get('/stats.html', (req, res) => {
    res.sendFile(path.join(frontendPath, 'stats.html'));
});

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling
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
        getNetworkUrls(port).forEach(url => console.log(`[OK] Phone:   ${url}`));
    });
});