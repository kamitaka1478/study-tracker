// src/routes/logs.js
const express = require('express');
const router = express.Router();
const logsController = require('../controllers/logsController');

// ルート定義
router.get('/', logsController.getAll);
router.post('/', logsController.create);
router.put('/:id', logsController.update);
router.delete('/:id', logsController.delete);

module.exports = router;
