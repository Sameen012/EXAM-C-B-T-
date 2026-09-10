const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

async function ensureAdminExists() {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  const email = (process.env.ADMIN_EMAIL || `${username}@local.test`).trim();
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const fullName = process.env.ADMIN_FULL_NAME || username;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? OR full_name = ? OR full_name = ? OR email = ?',
      [email, fullName, 'System Administrator', 'admin@local.test']
    );

    if (rows.length > 0) {
      const existing = rows[0];
      const passwordHash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET full_name = ?, email = ?, password_hash = ?, role = ?, is_active = 1 WHERE id = ?',
        [fullName, email, passwordHash, 'super_admin', existing.id]
      );
      return { id: existing.id };
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
      [fullName, email, passwordHash, 'super_admin']
    );

    return { id: result.insertId };
  } catch (error) {
    console.error('Admin seeding failed:', error.message);
    return null;
  }
}

module.exports = {
  ensureAdminExists,
};
