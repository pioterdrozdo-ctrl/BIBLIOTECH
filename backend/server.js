const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const os = require('os');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books');
const commentRoutes = require('./routes/comments');
const statsRoutes = require('./routes/stats');
const pool = require('./db/pool');

const app = express();
const frontendPath = path.join(__dirname, '..', 'frontend');
const isProduction = process.env.NODE_ENV === 'production';

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

app.use(express.static(frontendPath, {
    extensions: ['html'],
    maxAge: isProduction ? '1h' : 0,
    setHeaders: (res, filePath) => {
        const fileName = path.basename(filePath);
        if (fileName === 'sw.js' || fileName === 'manifest.webmanifest') {
            res.setHeader('Cache-Control', 'no-cache');
        }
        if (fileName === 'manifest.webmanifest') {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        }
    }
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/stats', statsRoutes);

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

app.get('/home.html', (req, res) => {
    res.sendFile(path.join(frontendPath, 'home.html'));
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
