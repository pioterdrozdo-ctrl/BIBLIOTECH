const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const connectionString = process.env.DATABASE_URL;
const hasConfig = Boolean(connectionString || process.env.DB_HOST || process.env.DB_NAME);
const needsSsl = process.env.DB_SSL === 'true' || /sslmode=require/i.test(connectionString || '');

if (!hasConfig) {
    module.exports = {
        isConfigured: false,
        query: async () => {
            throw new Error('PostgreSQL is not configured');
        }
    };
    return;
}

const pool = new Pool({
    connectionString,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 20, 
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Проверка подключения
pool.on('connect', () => {
    console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.warn('[DB] PostgreSQL idle client error, JSON fallback remains available:', err.message);
});

pool.isConfigured = true;

module.exports = pool;
