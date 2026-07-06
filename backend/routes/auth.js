const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const localStore = require('../services/localStore');
const { hashPassword, verifyPassword } = require('../utils/passwords');
const router = express.Router();

function signToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET || 'bibliotech-dev-secret-change-me',
        { expiresIn: '7d' }
    );
}

// Регистрация
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password || password.length < 4) {
        return res.status(400).json({ error: 'Invalid username or password' });
    }

    try {
        const hashedPassword = hashPassword(password);

        const result = await pool.query(
            'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
            [username, hashedPassword, 'user']
        );

        const user = result.rows[0];
        const token = signToken(user);

        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ error: 'User already exists' });
        } else {
            try {
                const user = localStore.createUser(username, password);
                res.json({ token: signToken(user), user });
            } catch (fallbackError) {
                res.status(fallbackError.code === 'DUPLICATE_USER' ? 400 : 500).json({
                    error: fallbackError.code === 'DUPLICATE_USER' ? 'User already exists' : 'Registration failed'
                });
            }
        }
    }
});

// Логин
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const result = await pool.query(
            'SELECT id, username, password_hash, role FROM users WHERE username = $1',
            [username]
        );

        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = verifyPassword(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = signToken(user);

        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (error) {
        const user = localStore.authenticateUser(username, password);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        res.json({ token: signToken(user), user });
    }
});

module.exports = router;
