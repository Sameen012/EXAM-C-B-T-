const { pool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');

exports.getDashboardStats = async (req, res) => {
  try {
    const isSuperAdmin = req.user?.role === 'super_admin';
    const userId = req.user?.id;

    let usersResult = [{ total: 0 }];
    let coursesResult = [{ total: 0 }];
    let questionsResult = [{ total: 0 }];
    let studentsResult = [{ total: 0 }];
    let attemptsResult = [{ total: 0 }];
    let recentAttempts = [];

    if (isSuperAdmin) {
      [usersResult] = await pool.query('SELECT COUNT(*) AS total FROM users');
      [coursesResult] = await pool.query('SELECT COUNT(*) AS total FROM courses');
      [questionsResult] = await pool.query('SELECT COUNT(*) AS total FROM questions');
      [studentsResult] = await pool.query('SELECT COUNT(*) AS total FROM students');
      [attemptsResult] = await pool.query('SELECT COUNT(*) AS total FROM exam_attempts WHERE submitted_at IS NOT NULL');

      [recentAttempts] = await pool.query(`
        SELECT ea.id, s.student_name, c.course_name, c.course_code, ea.score, ea.total_questions, ea.percentage, ea.submitted_at
        FROM exam_attempts ea
        INNER JOIN students s ON s.id = ea.student_id
        INNER JOIN courses c ON c.id = ea.course_id
        WHERE ea.submitted_at IS NOT NULL
        ORDER BY ea.submitted_at DESC
        LIMIT 5
      `);
    } else {
      // Non-super-admin: strictly isolated to the authorized user's created courses, questions, and practice attempts
      [coursesResult] = await pool.query('SELECT COUNT(*) AS total FROM courses WHERE created_by = ?', [userId]);

      [questionsResult] = await pool.query(`
        SELECT COUNT(*) AS total
        FROM questions q
        INNER JOIN courses c ON c.id = q.course_id
        WHERE q.created_by = ? OR c.created_by = ?
      `, [userId, userId]);

      [studentsResult] = await pool.query(`
        SELECT COUNT(DISTINCT ea.student_id) AS total
        FROM exam_attempts ea
        INNER JOIN courses c ON c.id = ea.course_id
        WHERE c.created_by = ? AND ea.submitted_at IS NOT NULL
      `, [userId]);

      [attemptsResult] = await pool.query(`
        SELECT COUNT(*) AS total
        FROM exam_attempts ea
        INNER JOIN courses c ON c.id = ea.course_id
        WHERE (c.created_by = ? OR ea.user_id = ?) AND ea.submitted_at IS NOT NULL
      `, [userId, userId]);

      [recentAttempts] = await pool.query(`
        SELECT ea.id, s.student_name, c.course_name, c.course_code, ea.score, ea.total_questions, ea.percentage, ea.submitted_at
        FROM exam_attempts ea
        INNER JOIN students s ON s.id = ea.student_id
        INNER JOIN courses c ON c.id = ea.course_id
        WHERE ea.submitted_at IS NOT NULL AND (c.created_by = ? OR ea.user_id = ?)
        ORDER BY ea.submitted_at DESC
        LIMIT 5
      `, [userId, userId]);
    }

    const stats = {
      userRole: req.user?.role || 'question_creator',
      totalUsers: isSuperAdmin ? Number(usersResult[0]?.total || 0) : 0,
      totalCourses: Number(coursesResult[0]?.total || 0),
      totalQuestions: Number(questionsResult[0]?.total || 0),
      totalStudents: Number(studentsResult[0]?.total || 0),
      totalPracticeAttempts: Number(attemptsResult[0]?.total || 0),
      recentActivity: recentAttempts,
    };

    return sendSuccess(res, 'Dashboard statistics retrieved successfully', stats);
  } catch (error) {
    console.error('Dashboard stats failed:', error.message);
    return sendError(res, 'Unable to load dashboard statistics', 500);
  }
};
