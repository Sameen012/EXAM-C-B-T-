const { pool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');

exports.getCourses = async (req, res) => {
  try {
    const isSuperAdmin = req.user?.role === 'super_admin';
    let query = `
      SELECT c.*, u.full_name AS creator_name
      FROM courses c
      LEFT JOIN users u ON u.id = c.created_by
    `;
    const values = [];

    if (!isSuperAdmin) {
      query += ' WHERE c.created_by = ?';
      values.push(req.user.id);
    }

    query += ' ORDER BY c.course_name ASC';

    const [rows] = await pool.query(query, values);

    return sendSuccess(res, 'Courses retrieved successfully', {
      items: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Get courses failed:', error.message);
    return sendError(res, 'Unable to load courses', 500);
  }
};

exports.getAvailableCourses = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.course_name, c.course_code, c.course_description,
              COUNT(q.id) AS question_count
       FROM courses c
       LEFT JOIN questions q ON q.course_id = c.id
       GROUP BY c.id, c.course_name, c.course_code, c.course_description
       ORDER BY c.course_name ASC`
    );

    return sendSuccess(res, 'Available courses retrieved successfully', rows);
  } catch (error) {
    console.error('Get available courses failed:', error.message);
    return sendError(res, 'Unable to load available courses', 500);
  }
};

exports.getCourseById = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendError(res, 'Course ID is required', 400);
  }

  try {
    const isSuperAdmin = req.user?.role === 'super_admin';
    let query = `
      SELECT c.*, u.full_name AS creator_name
      FROM courses c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = ?
    `;
    const values = [id];

    if (!isSuperAdmin) {
      query += ' AND c.created_by = ?';
      values.push(req.user.id);
    }

    const [rows] = await pool.query(query, values);

    if (rows.length === 0) {
      return sendError(res, 'Course not found or access denied', 404);
    }

    return sendSuccess(res, 'Course retrieved successfully', rows[0]);
  } catch (error) {
    console.error('Get course by ID failed:', error.message);
    return sendError(res, 'Unable to load course', 500);
  }
};

exports.createCourse = async (req, res) => {
  const { courseName, courseCode, courseDescription } = req.body || {};

  if (typeof courseName !== 'string' || typeof courseCode !== 'string' || courseName.trim() === '' || courseCode.trim() === '') {
    return sendError(res, 'Course name and course code are required', 400);
  }

  const trimmedName = String(courseName).trim();
  const trimmedCode = String(courseCode).trim();
  const trimmedDescription = String(courseDescription || '').trim();

  try {
    const [existing] = await pool.query(
      'SELECT id FROM courses WHERE course_code = ? OR course_name = ?',
      [trimmedCode, trimmedName]
    );

    if (existing.length > 0) {
      return sendError(res, 'A course with this name or code already exists', 409);
    }

    const [result] = await pool.query(
      'INSERT INTO courses (course_name, course_code, course_description, created_by) VALUES (?, ?, ?, ?)',
      [trimmedName, trimmedCode, trimmedDescription, req.user?.id || null]
    );

    const [rows] = await pool.query('SELECT * FROM courses WHERE id = ?', [result.insertId]);

    return sendSuccess(res, 'Course created successfully', rows[0], 201);
  } catch (error) {
    console.error('Create course failed:', error.message);
    return sendError(res, 'Unable to create course', 500);
  }
};

exports.updateCourse = async (req, res) => {
  const { id } = req.params;
  const { courseName, courseCode, courseDescription } = req.body || {};

  if (!id) {
    return sendError(res, 'Course ID is required', 400);
  }

  if (typeof courseName !== 'string' || typeof courseCode !== 'string' || courseName.trim() === '' || courseCode.trim() === '') {
    return sendError(res, 'Course name and course code are required', 400);
  }

  try {
    const [existing] = await pool.query('SELECT * FROM courses WHERE id = ?', [id]);

    if (existing.length === 0) {
      return sendError(res, 'Course not found', 404);
    }

    const isSuperAdmin = req.user?.role === 'super_admin';
    if (!isSuperAdmin && existing[0].created_by !== req.user.id) {
      return sendError(res, 'You are not authorized to edit this course', 403);
    }

    const [duplicate] = await pool.query(
      'SELECT id FROM courses WHERE (course_code = ? OR course_name = ?) AND id != ?',
      [String(courseCode).trim(), String(courseName).trim(), id]
    );

    if (duplicate.length > 0) {
      return sendError(res, 'Another course already uses this name or code', 409);
    }

    await pool.query(
      'UPDATE courses SET course_name = ?, course_code = ?, course_description = ? WHERE id = ?',
      [String(courseName).trim(), String(courseCode).trim(), String(courseDescription || '').trim(), id]
    );

    const [rows] = await pool.query('SELECT * FROM courses WHERE id = ?', [id]);

    return sendSuccess(res, 'Course updated successfully', rows[0]);
  } catch (error) {
    console.error('Update course failed:', error.message);
    return sendError(res, 'Unable to update course', 500);
  }
};

exports.deleteCourse = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendError(res, 'Course ID is required', 400);
  }

  try {
    const [courseRows] = await pool.query('SELECT * FROM courses WHERE id = ?', [id]);

    if (courseRows.length === 0) {
      return sendError(res, 'Course not found', 404);
    }

    const isSuperAdmin = req.user?.role === 'super_admin';
    if (!isSuperAdmin && courseRows[0].created_by !== req.user.id) {
      return sendError(res, 'You are not authorized to delete this course', 403);
    }

    const [questionRows] = await pool.query('SELECT COUNT(*) AS total FROM questions WHERE course_id = ?', [id]);
    const totalQuestions = Number(questionRows[0]?.total || 0);

    if (totalQuestions > 0) {
      return sendError(
        res,
        `This course has ${totalQuestions} question(s) associated with it. Delete the questions first or move them to another course before deleting this course.`,
        409
      );
    }

    await pool.query(
      'DELETE FROM exam_answers WHERE exam_attempt_id IN (SELECT id FROM exam_attempts WHERE course_id = ?)',
      [id]
    );
    await pool.query('DELETE FROM exam_attempts WHERE course_id = ?', [id]);
    await pool.query('DELETE FROM courses WHERE id = ?', [id]);

    return sendSuccess(res, 'Course deleted successfully', { id });
  } catch (error) {
    console.error('Delete course failed:', error.message);
    return sendError(res, 'Unable to delete course', 500);
  }
};
