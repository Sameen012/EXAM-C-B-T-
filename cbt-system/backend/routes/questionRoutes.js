const express = require('express');
const questionController = require('../controllers/questionController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', requireAuth, requireAdmin, questionController.getQuestions);
router.get('/:id', requireAuth, requireAdmin, questionController.getQuestionById);
router.post('/', requireAuth, requireAdmin, questionController.createQuestion);
router.post('/import', requireAuth, requireAdmin, questionController.importQuestions);
router.put('/:id', requireAuth, requireAdmin, questionController.updateQuestion);
router.delete('/:id', requireAuth, requireAdmin, questionController.deleteQuestion);

module.exports = router;
