const express = require('express');
const courseController = require('../controllers/courseController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/available', courseController.getAvailableCourses);
router.get('/', requireAuth, requireAdmin, courseController.getCourses);
router.get('/:id', requireAuth, requireAdmin, courseController.getCourseById);
router.post('/', requireAuth, requireAdmin, courseController.createCourse);
router.put('/:id', requireAuth, requireAdmin, courseController.updateCourse);
router.delete('/:id', requireAuth, requireAdmin, courseController.deleteCourse);

module.exports = router;
