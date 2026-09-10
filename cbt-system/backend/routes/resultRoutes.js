const express = require('express');
const resultController = require('../controllers/resultController');
const { requireAuth, requireAdmin, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', requireAuth, resultController.getResults);
router.get('/:id', requireAuth, resultController.getResultById);
router.delete('/:id', requireAuth, requireRole('super_admin', 'question_creator'), resultController.deleteResult);

module.exports = router;
