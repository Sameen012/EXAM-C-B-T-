const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

async function ensureAdminExists() {
  const rawEmail = (process.env.ADMIN_EMAIL || '').trim();
  const rawUsername = (process.env.ADMIN_USERNAME || '').trim();

  let email;
  if (rawEmail) {
    email = rawEmail.toLowerCase();
  } else if (rawUsername && rawUsername.includes('@')) {
    email = rawUsername.toLowerCase();
  } else {
    email = 'admin@sacht.edu.ng';
  }

  const password = process.env.ADMIN_PASSWORD || 'SameenAdmin2026';
  const fullName = (process.env.ADMIN_FULL_NAME || (rawUsername && !rawUsername.includes('@') ? rawUsername : 'System Administrator')).trim();

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    // 1. Check if a user with this email already exists
    const [byEmail] = await pool.query('SELECT * FROM users WHERE lower(email) = ?', [email]);
    if (byEmail.length > 0) {
      const existing = byEmail[0];
      await pool.query(
        'UPDATE users SET role = ?, password_hash = ?, is_active = 1 WHERE id = ?',
        ['super_admin', passwordHash, existing.id]
      );
      return { id: existing.id };
    }

    // 2. Check if an existing super admin or placeholder admin exists to update
    const [byRole] = await pool.query(
      'SELECT * FROM users WHERE role = ? OR email IN (?, ?) ORDER BY id ASC',
      ['super_admin', 'Sameen@local.test', 'admin@local.test']
    );

    if (byRole.length > 0) {
      const existing = byRole[0];
      await pool.query(
        'UPDATE users SET full_name = ?, email = ?, password_hash = ?, role = ?, is_active = 1 WHERE id = ?',
        [fullName, email, passwordHash, 'super_admin', existing.id]
      );
      return { id: existing.id };
    }

    // 3. Otherwise, create a new super admin
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
