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
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  try {
    // Execute schema statements non-destructively
    if (typeof db.executeMultiple === 'function') {
      await db.executeMultiple(schemaSql);
    } else {
      const statements = schemaSql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        await db.execute(statement);
      }
    }

    // Clean up any test/dummy subjects that have only 1 question
    await cleanupSingleQuestionCourses();

    console.log('Database and tables initialized successfully with Turso (libSQL).');
    return true;
  } catch (error) {
    console.error('Database initialization failed:', error.message);
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
