const { pool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const XLSX = require('xlsx');

const questionFields = `
  q.id,
  q.course_id,
  q.question_text,
  q.option_a,
  q.option_b,
  q.option_c,
  q.option_d,
  q.correct_answer,
  q.created_by,
  q.created_at,
  q.updated_at,
  c.course_name,
  c.course_code,
  u.full_name AS creator_name
`;

function validateQuestionFields(body) {
  const { courseId, questionText, optionA, optionB, optionC, optionD, correctAnswer } = body || {};

  const textFields = [questionText, optionA, optionB, optionC, optionD];

  if (!Number.isInteger(Number(courseId)) || Number(courseId) < 1 || textFields.some((field) => typeof field !== 'string' || field.trim() === '') || !correctAnswer) {
    return 'Course, question text, four options, and the correct answer are required';
  }

  if (!['A', 'B', 'C', 'D'].includes(String(correctAnswer).toUpperCase())) {
    return 'Correct answer must be A, B, C, or D';
  }

  return null;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && nextCharacter === '\n') index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell !== '')) rows.push(row);

  if (rows.length < 2) return [];

  const headers = rows.shift().map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ''));
  return rows.map((cells) => headers.reduce((record, header, index) => {
    record[header] = cells[index] || '';
    return record;
  }, {}));
}

function normalizeCorrectAnswer(raw, a, b, c, d) {
  if (!raw && raw !== 0) return '';
  const str = String(raw).trim();
  const upper = str.toUpperCase();

  // Exactly 'A', 'B', 'C', 'D'
  if (['A', 'B', 'C', 'D'].includes(upper)) return upper;

  // Numeric: 1 -> A, 2 -> B, 3 -> C, 4 -> D
  if (upper === '1') return 'A';
  if (upper === '2') return 'B';
  if (upper === '3') return 'C';
  if (upper === '4') return 'D';

  // Option prefixes: "Option A", "Opt A", "(A)", "A.", "A)", "A - "
  const prefixMatch = upper.match(/^(?:OPTION\s*|OPT\s*|\()?([A-D])(?:\)|\.|\:|\s|-|$)/i);
  if (prefixMatch) return prefixMatch[1].toUpperCase();

  // If the answer is the option content itself:
  const cleanAns = str.toLowerCase();
  if (a && String(a).trim().toLowerCase() === cleanAns) return 'A';
  if (b && String(b).trim().toLowerCase() === cleanAns) return 'B';
  if (c && String(c).trim().toLowerCase() === cleanAns) return 'C';
  if (d && String(d).trim().toLowerCase() === cleanAns) return 'D';

  return upper.length > 0 ? upper.charAt(0) : '';
}

function normalizeImportedQuestion(question, defaultCourseId) {
  if (!question || typeof question !== 'object') {
    return {
      courseId: defaultCourseId,
      courseCode: defaultCourseId,
      courseName: '',
      questionText: '',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      correctAnswer: '',
    };
  }

  const clean = {};
  for (const [key, val] of Object.entries(question)) {
    const k = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
    clean[k] = typeof val === 'string' ? val.trim() : (val != null ? String(val).trim() : '');
  }

  // Course Code candidates
  const detectedCode = clean.coursecode || clean.code || clean.subjectcode || clean.courseid || clean.classcode || '';
  // Course Name candidates
  const detectedName = clean.coursename || clean.course || clean.courses || clean.subject || clean.subjects || clean.subjectname || clean.title || clean.coursetitle || clean.department || clean.module || '';

  const courseId = detectedCode || detectedName || defaultCourseId || '';
  const courseCode = detectedCode || (detectedName ? detectedName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15).toUpperCase() : '') || courseId;
  const courseName = detectedName || detectedCode || courseId;

  // Options
  const optionA = clean.optiona || clean.opta || clean.a || clean.choicea || clean.choice1 || clean.option1 || clean.ansa || '';
  const optionB = clean.optionb || clean.optb || clean.b || clean.choiceb || clean.choice2 || clean.option2 || clean.ansb || '';
  const optionC = clean.optionc || clean.optc || clean.c || clean.choicec || clean.choice3 || clean.option3 || clean.ansc || '';
  const optionD = clean.optiond || clean.optd || clean.d || clean.choiced || clean.choice4 || clean.option4 || clean.ansd || '';

  // Question Text
  const questionText = clean.questiontext || clean.question || clean.questions || clean.text || clean.qtext || clean.q || clean.prompt || clean.item || clean.problem || '';

  // Correct Answer normalization
  const rawAnswer = clean.correctanswer || clean.correct || clean.answer || clean.ans || clean.key || clean.solution || clean.correctoption || '';
  const correctAnswer = normalizeCorrectAnswer(rawAnswer, optionA, optionB, optionC, optionD);

  return {
    courseId,
    courseCode,
    courseName,
    questionText,
    optionA,
    optionB,
    optionC,
    optionD,
    correctAnswer,
  };
}

exports.getQuestions = async (req, res) => {
  const { courseId, search } = req.query;
  const isSuperAdmin = req.user?.role === 'super_admin';

  try {
    let query = `
      SELECT ${questionFields}
      FROM questions q
      INNER JOIN courses c ON c.id = q.course_id
      LEFT JOIN users u ON u.id = q.created_by
    `;
    const conditions = [];
    const values = [];

    if (!isSuperAdmin) {
      conditions.push('(q.created_by = ? OR c.created_by = ?)');
      values.push(req.user.id, req.user.id);
    }

    if (courseId) {
      conditions.push('q.course_id = ?');
      values.push(courseId);
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      conditions.push('(q.question_text LIKE ? OR q.option_a LIKE ? OR q.option_b LIKE ? OR q.option_c LIKE ? OR q.option_d LIKE ?)');
      const searchTerm = `%${search.trim()}%`;
      values.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY q.created_at DESC, q.id DESC';

    const [rows] = await pool.query(query, values);

    return sendSuccess(res, 'Questions retrieved successfully', {
      items: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Get questions failed:', error.message);
    return sendError(res, 'Unable to load questions', 500);
  }
};

exports.getQuestionById = async (req, res) => {
  const { id } = req.params;
  const isSuperAdmin = req.user?.role === 'super_admin';

  if (!id) {
    return sendError(res, 'Question ID is required', 400);
  }

  try {
    let query = `
      SELECT ${questionFields}
      FROM questions q
      INNER JOIN courses c ON c.id = q.course_id
      LEFT JOIN users u ON u.id = q.created_by
      WHERE q.id = ?
    `;
    const values = [id];

    if (!isSuperAdmin) {
      query += ' AND (q.created_by = ? OR c.created_by = ?)';
      values.push(req.user.id, req.user.id);
    }

    const [rows] = await pool.query(query, values);

    if (rows.length === 0) {
      return sendError(res, 'Question not found or access denied', 404);
    }

    return sendSuccess(res, 'Question retrieved successfully', rows[0]);
  } catch (error) {
    console.error('Get question by ID failed:', error.message);
    return sendError(res, 'Unable to load question', 500);
  }
};

exports.createQuestion = async (req, res) => {
  const { courseId, questionText, optionA, optionB, optionC, optionD, correctAnswer } = req.body || {};
  const validationError = validateQuestionFields(req.body);

  if (validationError) {
    return sendError(res, validationError, 400);
  }

  try {
    const isSuperAdmin = req.user?.role === 'super_admin';
    const [courses] = await pool.query('SELECT id, created_by FROM courses WHERE id = ?', [courseId]);

    if (courses.length === 0) {
      return sendError(res, 'Course not found', 404);
    }

    if (!isSuperAdmin && courses[0].created_by && courses[0].created_by !== req.user.id) {
      return sendError(res, 'You are only authorized to add questions to your own courses', 403);
    }

    const [result] = await pool.query(
      `INSERT INTO questions
        (course_id, question_text, option_a, option_b, option_c, option_d, correct_answer, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [courseId, questionText.trim(), optionA.trim(), optionB.trim(), optionC.trim(), optionD.trim(), String(correctAnswer).toUpperCase(), req.user?.id || null]
    );

    const [rows] = await pool.query(
      `SELECT ${questionFields} FROM questions q INNER JOIN courses c ON c.id = q.course_id LEFT JOIN users u ON u.id = q.created_by WHERE q.id = ?`,
      [result.insertId]
    );

    return sendSuccess(res, 'Question created successfully', rows[0], 201);
  } catch (error) {
    console.error('Create question failed:', error.message);
    return sendError(res, 'Unable to create question', 500);
  }
};

exports.importQuestions = async (req, res) => {
  const { content, format, courseId, newCourseName, newCourseCode } = req.body || {};

  if (!content || !format) {
    return sendError(res, 'Import format and file content are required', 400);
  }

  let importedRows;

  try {
    const fmt = String(format).toLowerCase();
    if (fmt === 'json') {
      importedRows = typeof content === 'string' ? JSON.parse(content) : content;
    } else if (fmt === 'csv') {
      importedRows = parseCsv(content);
    } else if (fmt === 'excel' || fmt === 'xlsx' || fmt === 'xls') {
      let buffer;
      if (Buffer.isBuffer(content)) {
        buffer = content;
      } else if (typeof content === 'string') {
        const base64Data = content.includes('base64,') ? content.split('base64,')[1] : content;
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        return sendError(res, 'Invalid Excel data payload', 400);
      }
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return sendError(res, 'The uploaded Excel file contains no worksheets', 400);
      }
      const sheet = workbook.Sheets[firstSheetName];
      importedRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      return sendError(res, 'Only Excel (.xlsx, .xls), CSV, and JSON files are supported', 400);
    }
  } catch (error) {
    return sendError(res, `The uploaded file could not be parsed: ${error.message}`, 400);
  }

  if (!Array.isArray(importedRows) || importedRows.length === 0) {
    return sendError(res, 'The uploaded file must contain at least one question', 400);
  }

  if (importedRows.length > 1000) {
    return sendError(res, 'A maximum of 1000 questions can be imported at once', 400);
  }

  const isSuperAdmin = req.user?.role === 'super_admin';
  const connection = await pool.getConnection();
  const invalid = [];
  let imported = 0;
  const createdCourses = [];
  const courseCache = new Map();

  try {
    await connection.beginTransaction();

    let defaultResolvedCourseId = null;

    // Handle course specified via dropdown or manual new course input
    if (courseId && courseId !== '__create_new__') {
      const [existingCourse] = await connection.query(
        'SELECT id, course_name, course_code, created_by FROM courses WHERE id = ? OR course_code = ?',
        [courseId, courseId]
      );
      if (existingCourse.length > 0) {
        if (!isSuperAdmin && existingCourse[0].created_by && existingCourse[0].created_by !== req.user.id) {
          await connection.rollback();
          return sendError(res, 'You are not authorized to import questions into this course', 403);
        }
        defaultResolvedCourseId = existingCourse[0].id;
        courseCache.set(String(courseId).toLowerCase().trim(), defaultResolvedCourseId);
        courseCache.set(String(existingCourse[0].course_code).toLowerCase().trim(), defaultResolvedCourseId);
        courseCache.set(String(existingCourse[0].course_name).toLowerCase().trim(), defaultResolvedCourseId);
      }
    } else if (newCourseName || newCourseCode) {
      let code = String(newCourseCode || newCourseName).trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 20).toUpperCase();
      let name = String(newCourseName || newCourseCode).trim();
      if (!code) code = `CRS${Date.now().toString().slice(-4)}`;

      const [existing] = await connection.query(
        'SELECT id, created_by FROM courses WHERE course_code = ? OR course_name = ?',
        [code, name]
      );

      if (existing.length > 0) {
        if (!isSuperAdmin && existing[0].created_by && existing[0].created_by !== req.user.id) {
          code = `${code}_${req.user.id}`;
          const [ins] = await connection.query(
            'INSERT INTO courses (course_name, course_code, course_description, created_by) VALUES (?, ?, ?, ?)',
            [name, code, `Created during import on ${new Date().toLocaleDateString('en-GB')}`, req.user?.id || null]
          );
          defaultResolvedCourseId = ins.insertId;
          createdCourses.push({ id: defaultResolvedCourseId, name, code });
        } else {
          defaultResolvedCourseId = existing[0].id;
        }
      } else {
        const [ins] = await connection.query(
          'INSERT INTO courses (course_name, course_code, course_description, created_by) VALUES (?, ?, ?, ?)',
          [name, code, `Created during import on ${new Date().toLocaleDateString('en-GB')}`, req.user?.id || null]
        );
        defaultResolvedCourseId = ins.insertId;
        createdCourses.push({ id: defaultResolvedCourseId, name, code });
      }
      courseCache.set('__default__', defaultResolvedCourseId);
    }

    for (let index = 0; index < importedRows.length; index += 1) {
      const question = normalizeImportedQuestion(importedRows[index], defaultResolvedCourseId);

      // Enforce the same specific course for the entire import batch
      let resolvedCourseId = defaultResolvedCourseId;

      if (!resolvedCourseId) {
        const targetIdentifier = question.courseId;
        if (!targetIdentifier) {
          invalid.push({ row: index + 1, message: 'No course specified (neither in row nor in form selection)' });
          continue;
        }

        const cacheKey = String(targetIdentifier).toLowerCase().trim();
        resolvedCourseId = courseCache.get(cacheKey);

        if (!resolvedCourseId) {
          const [courses] = await connection.query(
            'SELECT id, course_name, course_code, created_by FROM courses WHERE id = ? OR course_code = ? OR course_name = ?',
            [targetIdentifier, targetIdentifier, targetIdentifier]
          );

          if (courses.length > 0) {
            if (!isSuperAdmin && courses[0].created_by && courses[0].created_by !== req.user.id) {
              invalid.push({ row: index + 1, message: `Course "${courses[0].course_name}" was created by another user` });
              continue;
            }
            resolvedCourseId = courses[0].id;
          } else {
            // AUTO-CREATE COURSE SO IT APPEARS IN COURSE MANAGEMENT & QUESTION MANAGEMENT
            let autoCode = String(question.courseCode || targetIdentifier).trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 20).toUpperCase();
            let autoName = String(question.courseName || targetIdentifier).trim();

            if (!autoName && autoCode) autoName = autoCode;
            if (!autoCode && autoName) {
              autoCode = autoName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15).toUpperCase();
            }
            if (!autoCode) autoCode = `CRS${Date.now().toString().slice(-4)}`;

            const [codeCheck] = await connection.query('SELECT id FROM courses WHERE course_code = ?', [autoCode]);
            if (codeCheck.length > 0) {
              autoCode = `${autoCode}_${Date.now().toString().slice(-4)}`;
            }

            const [insCourse] = await connection.query(
              'INSERT INTO courses (course_name, course_code, course_description, created_by) VALUES (?, ?, ?, ?)',
              [
                autoName,
                autoCode,
                `Auto-created from question import on ${new Date().toLocaleDateString('en-GB')}`,
                req.user?.id || null,
              ]
            );

            resolvedCourseId = insCourse.insertId;
            createdCourses.push({ id: resolvedCourseId, name: autoName, code: autoCode });
          }

          // Pin this resolved subject as the default for all subsequent rows in this import
          defaultResolvedCourseId = resolvedCourseId;
          courseCache.set('__default__', defaultResolvedCourseId);
          courseCache.set(cacheKey, resolvedCourseId);
          if (question.courseCode) courseCache.set(String(question.courseCode).toLowerCase().trim(), resolvedCourseId);
          if (question.courseName) courseCache.set(String(question.courseName).toLowerCase().trim(), resolvedCourseId);
        }
      }

      question.courseId = resolvedCourseId;

      const validationError = validateQuestionFields(question);
      if (validationError) {
        invalid.push({ row: index + 1, message: validationError });
        continue;
      }

      await connection.query(
        `INSERT INTO questions
          (course_id, question_text, option_a, option_b, option_c, option_d, correct_answer, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resolvedCourseId,
          question.questionText.trim(),
          question.optionA.trim(),
          question.optionB.trim(),
          question.optionC.trim(),
          question.optionD.trim(),
          String(question.correctAnswer).toUpperCase(),
          req.user?.id || null,
        ]
      );
      imported += 1;
    }

    await connection.commit();
    return sendSuccess(res, 'Question import completed', {
      imported,
      invalid: invalid.length,
      createdCourses,
      targetCourseId: defaultResolvedCourseId,
      errors: invalid,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Import questions failed:', error.message);
    return sendError(res, 'Unable to import questions', 500);
  } finally {
    connection.release();
  }
};

exports.updateQuestion = async (req, res) => {
  const { id } = req.params;
  const { courseId, questionText, optionA, optionB, optionC, optionD, correctAnswer } = req.body || {};
  const validationError = validateQuestionFields(req.body);

  if (!id) {
    return sendError(res, 'Question ID is required', 400);
  }

  if (validationError) {
    return sendError(res, validationError, 400);
  }

  try {
    const isSuperAdmin = req.user?.role === 'super_admin';
    const [questions] = await pool.query('SELECT id, created_by FROM questions WHERE id = ?', [id]);
    const [courses] = await pool.query('SELECT id, created_by FROM courses WHERE id = ?', [courseId]);

    if (questions.length === 0) {
      return sendError(res, 'Question not found', 404);
    }

    if (courses.length === 0) {
      return sendError(res, 'Course not found', 404);
    }

    if (!isSuperAdmin && questions[0].created_by && questions[0].created_by !== req.user.id) {
      return sendError(res, 'You are not authorized to edit this question', 403);
    }

    if (!isSuperAdmin && courses[0].created_by && courses[0].created_by !== req.user.id) {
      return sendError(res, 'You cannot assign questions to courses created by other users', 403);
    }

    await pool.query(
      `UPDATE questions
       SET course_id = ?, question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_answer = ?
       WHERE id = ?`,
      [courseId, questionText.trim(), optionA.trim(), optionB.trim(), optionC.trim(), optionD.trim(), String(correctAnswer).toUpperCase(), id]
    );

    const [rows] = await pool.query(
      `SELECT ${questionFields} FROM questions q INNER JOIN courses c ON c.id = q.course_id LEFT JOIN users u ON u.id = q.created_by WHERE q.id = ?`,
      [id]
    );

    return sendSuccess(res, 'Question updated successfully', rows[0]);
  } catch (error) {
    console.error('Update question failed:', error.message);
    return sendError(res, 'Unable to update question', 500);
  }
};

exports.deleteQuestion = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendError(res, 'Question ID is required', 400);
  }

  try {
    const isSuperAdmin = req.user?.role === 'super_admin';
    const [questions] = await pool.query('SELECT id, created_by FROM questions WHERE id = ?', [id]);

    if (questions.length === 0) {
      return sendError(res, 'Question not found', 404);
    }

    if (!isSuperAdmin && questions[0].created_by && questions[0].created_by !== req.user.id) {
      return sendError(res, 'You are not authorized to delete this question', 403);
    }

    await pool.query('DELETE FROM questions WHERE id = ?', [id]);

    return sendSuccess(res, 'Question deleted successfully', { id });
  } catch (error) {
    console.error('Delete question failed:', error.message);
    return sendError(res, 'Unable to delete question', 500);
  }
};
