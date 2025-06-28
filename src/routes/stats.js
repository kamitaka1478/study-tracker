// src/routes/stats.js
const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

// ルート定義
router.get('/', statsController.getStats);

module.exports = router;
