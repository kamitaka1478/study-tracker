// src/routes/studyItems.js
const express = require('express');
const router = express.Router();
const studyItemsController = require('../controllers/studyItemsController');

// ルート定義
router.get('/', studyItemsController.getAll);
router.post('/', studyItemsController.create);
router.put('/:id', studyItemsController.update);
router.delete('/:id', studyItemsController.delete);

module.exports = router;
