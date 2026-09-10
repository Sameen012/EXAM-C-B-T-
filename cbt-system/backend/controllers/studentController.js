const { pool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');

exports.getStudents = async (req, res) => {
  try {
    const isSuperAdmin = req.user?.role === 'super_admin';
    let query = `
      SELECT s.id, s.student_name, s.created_at,
             COUNT(ea.id) AS completed_attempts,
             MAX(ea.submitted_at) AS last_attempt_at
      FROM students s
      LEFT JOIN exam_attempts ea ON ea.student_id = s.id AND ea.submitted_at IS NOT NULL
      LEFT JOIN courses c ON c.id = ea.course_id
    `;
    const values = [];

    if (!isSuperAdmin) {
      query += ' WHERE (c.created_by = ? OR s.user_id = ?)';
      values.push(req.user.id, req.user.id);
    }

    query += `
      GROUP BY s.id, s.student_name, s.created_at
      ORDER BY s.student_name ASC
    `;

    const [rows] = await pool.query(query, values);

    return sendSuccess(res, 'Students retrieved successfully', { items: rows, count: rows.length });
  } catch (error) {
    console.error('Get students failed:', error.message);
    return sendError(res, 'Unable to load students', 500);
  }
};