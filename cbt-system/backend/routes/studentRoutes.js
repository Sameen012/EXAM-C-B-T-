const express = require('express');
const studentController = require('../controllers/studentController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', requireAuth, requireAdmin, studentController.getStudents);

module.exports = router;