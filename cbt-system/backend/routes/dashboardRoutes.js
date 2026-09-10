const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/stats', requireAuth, requireAdmin, dashboardController.getDashboardStats);

module.exports = router;
