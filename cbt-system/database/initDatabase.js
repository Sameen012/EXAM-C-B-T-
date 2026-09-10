const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { db, pool } = require('../backend/config/database');

dotenv.config();

async function cleanupSingleQuestionCourses() {
  try {
    // Identify courses that have 1 or 0 questions to keep the subject list clean
    const [singleQuestionCourses] = await pool.query(`
      SELECT c.id, c.course_name, c.course_code, COUNT(q.id) AS q_count
      FROM courses c
      LEFT JOIN questions q ON q.course_id = c.id
      GROUP BY c.id, c.course_name, c.course_code
      HAVING q_count <= 1
    `);

    for (const course of singleQuestionCourses) {
      await pool.query(
        'DELETE FROM exam_answers WHERE exam_attempt_id IN (SELECT id FROM exam_attempts WHERE course_id = ?)',
        [course.id]
      );
      await pool.query('DELETE FROM exam_attempts WHERE course_id = ?', [course.id]);
      await pool.query('DELETE FROM questions WHERE course_id = ?', [course.id]);
      await pool.query('DELETE FROM courses WHERE id = ?', [course.id]);
      console.log(`Removed subject with <= 1 question: ${course.course_code} (${course.course_name})`);
    }
  } catch (err) {
    console.warn('Subject cleanup notice:', err.message);
  }
}

async function initDatabase() {
  try {
    // 1. Check if tables already exist (e.g. uploaded SQLite file in Turso)
    const [existing] = await pool.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    );

    if (existing && existing.length > 0) {
      console.log('Database tables verified in Turso (libSQL).');
      await cleanupSingleQuestionCourses();
      return true;
    }

    // 2. If not yet initialized, read and execute schema statements individually
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    const cleanSql = schemaSql.replace(/--.*$/gm, '');
    const statements = cleanSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.toLowerCase().startsWith('pragma journal_mode'));

    for (const statement of statements) {
      try {
        await pool.query(statement);
      } catch (stmtErr) {
        if (!stmtErr.message.includes('already exists')) {
          console.warn('Schema statement warning:', stmtErr.message);
        }
      }
    }

    await cleanupSingleQuestionCourses();
    console.log('Database and tables initialized successfully with Turso (libSQL).');
    return true;
  } catch (error) {
    console.error('Database initialization notice:', error.message);
    try {
      const [check] = await pool.query('SELECT COUNT(*) as count FROM users');
      if (check && check.length > 0) {
        console.log('Existing database verified functional.');
        return true;
      }
    } catch (_) {}
    throw error;
  }
}

if (require.main === module) {
  initDatabase().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  initDatabase,
  cleanupSingleQuestionCourses,
};
