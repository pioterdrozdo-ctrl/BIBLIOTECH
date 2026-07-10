'use strict';

const express = require('express');
const { authMiddleware, isAdmin } = require('../middleware/auth');
const { lookupIsbnMetadata } = require('../services/isbnMetadata');

const router = express.Router();

router.get('/isbn/:isbn', authMiddleware, isAdmin, async (req, res) => {
    try {
        const metadata = await lookupIsbnMetadata(req.params.isbn);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.json({
            metadata,
            message: 'Данные найдены. Проверьте их перед сохранением книги.'
        });
    } catch (error) {
        const status = error.code === 'INVALID_ISBN' ? 400
            : error.code === 'ISBN_NOT_FOUND' ? 404
                : error.code === 'METADATA_TIMEOUT' ? 504 : 502;
        res.status(status).json({
            error: error.message || 'Не удалось получить данные по ISBN.',
            code: error.code || 'METADATA_PROVIDER_ERROR'
        });
    }
});

module.exports = router;
