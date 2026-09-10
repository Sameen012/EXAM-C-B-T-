const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth, requireAdmin, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/health', authController.getStatus);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', requireAuth, authController.getCurrentUser);
router.get('/admin-check', requireAuth, requireAdmin, (req, res) => {
  res.json({ success: true, message: 'Admin access verified', user: req.user });
});
router.get('/users', requireAuth, requireRole('super_admin'), authController.getUsers);
router.post('/users', requireAuth, requireRole('super_admin'), authController.createUser);
router.put('/users/:id', requireAuth, requireRole('super_admin'), authController.updateUser);
router.delete('/users/:id', requireAuth, requireRole('super_admin'), authController.deleteUser);
router.post('/change-password', requireAuth, requireAdmin, authController.changePassword);

module.exports = router;
