const { pool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');

exports.getResults = async (req, res) => {
  const { studentName, courseId, date, scoreMin, myResults } = req.query;

  try {
    let query = `
      SELECT ea.id, ea.course_id, s.student_name, c.course_name, c.course_code,
             ea.total_questions, ea.correct_answers, ea.wrong_answers,
             ea.unanswered, ea.score, ea.percentage, ea.started_at, ea.submitted_at
      FROM exam_attempts ea
      INNER JOIN students s ON s.id = ea.student_id
      INNER JOIN courses c ON c.id = ea.course_id
      WHERE ea.submitted_at IS NOT NULL
    `;
    const values = [];

    const isSuperAdmin = req.user?.role === 'super_admin';

    // Cybersecurity Access Control: only super_admin can see all platform results.
    // Non-super-admin users are strictly isolated:
    // If requesting personal attempts (myResults === 'true'), only their own attempts (ea.user_id = ? OR s.user_id = ?).
    // In creator/educator view, only attempts for courses they created (c.created_by = ?) OR attempts taken by themselves (ea.user_id = ? OR s.user_id = ?).
    // Raw student_name string matching is eliminated to prevent cross-account data leakage.
    if (!isSuperAdmin) {
      if (myResults === 'true') {
        query += ' AND (ea.user_id = ? OR s.user_id = ?)';
        values.push(req.user.id, req.user.id);
      } else {
        query += ' AND (c.created_by = ? OR ea.user_id = ? OR s.user_id = ?)';
        values.push(req.user.id, req.user.id, req.user.id);
      }
    }

    if (studentName && String(studentName).trim() !== '') {
      query += ' AND s.student_name LIKE ?';
      values.push(`%${String(studentName).trim()}%`);
    }

    if (courseId && String(courseId).trim() !== '') {
      query += ' AND ea.course_id = ?';
      values.push(courseId);
    }

    if (date && String(date).trim() !== '') {
      query += ' AND date(ea.submitted_at) = ?';
      values.push(date);
    }

    if (scoreMin !== undefined && scoreMin !== '') {
      query += ' AND ea.score >= ?';
      values.push(Number(scoreMin));
    }

    query += ' ORDER BY ea.submitted_at DESC, ea.id DESC';
    const [rows] = await pool.query(query, values);

    return sendSuccess(res, 'Results retrieved successfully', { items: rows, count: rows.length });
  } catch (error) {
    console.error('Get results failed:', error.message);
    return sendError(res, 'Unable to load results', 500);
  }
};

exports.getResultById = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendError(res, 'Result ID is required', 400);
  }

  try {
    const isSuperAdmin = req.user?.role === 'super_admin';
    let query = `
      SELECT ea.id, ea.course_id, ea.user_id, s.student_name, c.course_name, c.course_code,
             ea.total_questions, ea.correct_answers, ea.wrong_answers,
             ea.unanswered, ea.score, ea.percentage, ea.started_at, ea.submitted_at
      FROM exam_attempts ea
      INNER JOIN students s ON s.id = ea.student_id
      INNER JOIN courses c ON c.id = ea.course_id
      WHERE ea.id = ? AND ea.submitted_at IS NOT NULL
    `;
    const values = [id];

    if (!isSuperAdmin) {
      query += ' AND (c.created_by = ? OR ea.user_id = ? OR s.user_id = ?)';
      values.push(req.user.id, req.user.id, req.user.id);
    }

    const [rows] = await pool.query(query, values);
    if (rows.length === 0) return sendError(res, 'Result not found or access denied', 404);

    const attempt = rows[0];

    // Fetch review answers with question details
    const [answers] = await pool.query(
      `SELECT q.id AS question_id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
              q.correct_answer, ea.selected_option,
              COALESCE(ea.is_correct, 0) AS is_correct
       FROM questions q
       LEFT JOIN exam_answers ea ON ea.question_id = q.id AND ea.exam_attempt_id = ?
       WHERE q.course_id = ?
       ORDER BY q.id ASC
       LIMIT ?`,
      [attempt.id, attempt.course_id, attempt.total_questions]
    );

    return sendSuccess(res, 'Result retrieved successfully', {
      ...attempt,
      answers,
    });
  } catch (error) {
    console.error('Get result failed:', error.message);
    return sendError(res, 'Unable to load result', 500);
  }
};

exports.deleteResult = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendError(res, 'Result ID is required', 400);
  }

  try {
    const isSuperAdmin = req.user?.role === 'super_admin';
    if (!isSuperAdmin) {
      const [attempts] = await pool.query(
        `SELECT ea.id FROM exam_attempts ea
         INNER JOIN courses c ON c.id = ea.course_id
         WHERE ea.id = ? AND (c.created_by = ? OR ea.user_id = ?)`,
        [id, req.user.id, req.user.id]
      );
      if (attempts.length === 0) {
        return sendError(res, 'Result not found or access denied', 403);
      }
    }

    const [result] = await pool.query('DELETE FROM exam_attempts WHERE id = ? AND submitted_at IS NOT NULL', [id]);
    if (result.affectedRows === 0) return sendError(res, 'Result not found', 404);
    return sendSuccess(res, 'Result deleted successfully', { id });
  } catch (error) {
    console.error('Delete result failed:', error.message);
    return sendError(res, 'Unable to delete result', 500);
  }
};

