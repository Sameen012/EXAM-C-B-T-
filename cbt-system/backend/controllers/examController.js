const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');

const questionSelect = `
  SELECT id, course_id, question_text, option_a, option_b, option_c, option_d
  FROM questions
  WHERE course_id = ?
  ORDER BY id ASC
`;

exports.getStatus = (req, res) => {
  return sendSuccess(res, 'Exam controller ready');
};

exports.startExam = async (req, res) => {
  const { studentName, courseId, questionCount } = req.body || {};

  if (typeof studentName !== 'string' || studentName.trim() === '' || !courseId) {
    return sendError(res, 'Student name and course are required', 400);
  }

  // Extract user ID from token if authenticated student
  let userId = null;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
      userId = decoded.id;
    } catch (_) {}
  }

  const requestedCount = Number.isFinite(Number(questionCount)) ? Number(questionCount) : 100;
  const finalQuestionCount = Math.max(1, Math.min(requestedCount, 100));

  try {
    const [courses] = await pool.query('SELECT id, course_name, course_code FROM courses WHERE id = ?', [courseId]);
    if (courses.length === 0) return sendError(res, 'Course not found', 404);

    const [questions] = await pool.query(questionSelect, [courseId]);
    const selectedQuestions = questions.slice(0, finalQuestionCount);

    if (selectedQuestions.length === 0) {
      return sendError(res, 'This course does not have any questions yet', 409);
    }

    const message = selectedQuestions.length < finalQuestionCount
      ? `This course contains ${selectedQuestions.length} question(s). The examination will proceed with all available questions.`
      : 'Exam started successfully';

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      let studentId = null;
      if (userId) {
        const [userStudents] = await connection.query(
          'SELECT id FROM students WHERE user_id = ? LIMIT 1',
          [userId]
        );
        if (userStudents.length > 0) {
          studentId = userStudents[0].id;
          await connection.query('UPDATE students SET student_name = ? WHERE id = ?', [studentName.trim(), studentId]);
        }
      }

      if (!studentId && !userId) {
        const [guestStudents] = await connection.query(
          'SELECT id FROM students WHERE student_name = ? AND user_id IS NULL LIMIT 1',
          [studentName.trim()]
        );
        if (guestStudents.length > 0) {
          studentId = guestStudents[0].id;
        }
      }

      if (!studentId) {
        const [studentResult] = await connection.query(
          'INSERT INTO students (student_name, user_id) VALUES (?, ?)',
          [studentName.trim(), userId]
        );
        studentId = studentResult.insertId;
      }

      const [attemptResult] = await connection.query(
        'INSERT INTO exam_attempts (student_id, user_id, course_id, total_questions) VALUES (?, ?, ?, ?)',
        [studentId, userId, courseId, selectedQuestions.length]
      );
      await connection.commit();

      return sendSuccess(res, message, {
        examId: attemptResult.insertId,
        studentId,
        course: courses[0],
        totalQuestions: selectedQuestions.length,
        questions: selectedQuestions,
        isPartialQuestionCount: selectedQuestions.length < finalQuestionCount,
      }, 201);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Start exam failed:', error.message);
    return sendError(res, 'Unable to start exam', 500);
  }
};

exports.getExam = async (req, res) => {
  const { id } = req.params;

  try {
    const [attempts] = await pool.query(
      `SELECT ea.id AS exam_id, ea.student_id, ea.user_id, ea.course_id, ea.total_questions,
              ea.started_at, s.student_name, c.course_name, c.course_code
       FROM exam_attempts ea
       INNER JOIN students s ON s.id = ea.student_id
       INNER JOIN courses c ON c.id = ea.course_id
       WHERE ea.id = ?`,
      [id]
    );
    if (attempts.length === 0) return sendError(res, 'Exam not found', 404);

    const [questions] = await pool.query(`${questionSelect} LIMIT ?`, [attempts[0].course_id, attempts[0].total_questions]);
    return sendSuccess(res, 'Exam retrieved successfully', { ...attempts[0], questions });
  } catch (error) {
    console.error('Get exam failed:', error.message);
    return sendError(res, 'Unable to load exam', 500);
  }
};

exports.submitExam = async (req, res) => {
  const { examId, answers } = req.body || {};

  if (!examId || !Array.isArray(answers)) {
    return sendError(res, 'Exam ID and answers are required', 400);
  }

  try {
    const [attempts] = await pool.query(
      'SELECT id, course_id, total_questions, started_at, submitted_at FROM exam_attempts WHERE id = ?',
      [examId]
    );
    if (attempts.length === 0) return sendError(res, 'Exam not found', 404);
    if (attempts[0].submitted_at) return sendError(res, 'This exam has already been submitted', 409);

    const allowedMs = 60 * 60 * 1000; // 60 minutes
    const graceMs = 5 * 60 * 1000; // 5-minute network grace period
    const startedAt = new Date(attempts[0].started_at).getTime();
    const elapsedMs = Date.now() - startedAt;

    if (elapsedMs > allowedMs + graceMs) {
      return sendError(res, 'The allowed examination time has expired. Submissions can no longer be accepted.', 410);
    }

    const [questions] = await pool.query(
      'SELECT id, correct_answer FROM questions WHERE course_id = ? ORDER BY id ASC LIMIT ?',
      [attempts[0].course_id, attempts[0].total_questions]
    );
    const questionMap = new Map(questions.map((question) => [String(question.id), question]));
    const uniqueAnswers = new Map();

    answers.forEach((answer) => {
      if (answer?.questionId && ['A', 'B', 'C', 'D'].includes(String(answer.selectedOption).toUpperCase())) {
        uniqueAnswers.set(String(answer.questionId), String(answer.selectedOption).toUpperCase());
      }
    });

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      let correctAnswers = 0;
      let scoredAnswers = 0;

      for (const [questionId, selectedOption] of uniqueAnswers) {
        const question = questionMap.get(questionId);
        if (!question) continue;
        scoredAnswers += 1;
        const isCorrect = question.correct_answer === selectedOption;
        if (isCorrect) correctAnswers += 1;

        await connection.query(
          `INSERT INTO exam_answers (exam_attempt_id, question_id, selected_option, is_correct)
           VALUES (?, ?, ?, ?)`,
          [examId, question.id, selectedOption, isCorrect ? 1 : 0]
        );
      }

      const totalQuestions = attempts[0].total_questions;
      const wrongAnswers = scoredAnswers - correctAnswers;
      const unanswered = Math.max(totalQuestions - scoredAnswers, 0);
      const percentage = totalQuestions > 0 ? Number(((correctAnswers / totalQuestions) * 100).toFixed(2)) : 0;

      await connection.query(
        `UPDATE exam_attempts
         SET correct_answers = ?, wrong_answers = ?, unanswered = ?, score = ?, percentage = ?, submitted_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [correctAnswers, wrongAnswers, unanswered, correctAnswers, percentage, examId]
      );
      await connection.commit();

      return sendSuccess(res, 'Exam submitted successfully', {
        resultId: examId,
        examId,
        totalQuestions,
        correctAnswers,
        wrongAnswers,
        unanswered,
        score: correctAnswers,
        percentage,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Submit exam failed:', error.message);
    return sendError(res, 'Unable to submit exam', 500);
  }
};
