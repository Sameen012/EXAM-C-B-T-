const express = require('express');
const examController = require('../controllers/examController');

const router = express.Router();

router.get('/health', examController.getStatus);
router.post('/start', examController.startExam);
router.get('/:id', examController.getExam);
router.post('/submit', examController.submitExam);

module.exports = router;
