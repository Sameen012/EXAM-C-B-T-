const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');

const loginAttempts = new Map();
const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 5;
const maxTrackedLoginKeys = 10000;

function getLoginKey(identifier, address) {
  return `${address || 'unknown'}:${String(identifier).trim().toLowerCase()}`;
}

function normalizeRole(role) {
  if (role === 'admin') return 'super_admin';
  return role;
}

function signUserToken(user) {
  return jwt.sign(
    {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: normalizeRole(user.role),
    },
    process.env.JWT_SECRET || 'default_secret',
    { expiresIn: '8h' }
  );
}

function isLoginBlocked(identifier, address) {
  const key = getLoginKey(identifier, address);
  const record = loginAttempts.get(key);

  if (!record || Date.now() - record.startedAt >= loginWindowMs) {
    loginAttempts.delete(key);
    return false;
  }

  return record.count >= maxLoginAttempts;
}

function recordLoginFailure(identifier, address) {
  const key = getLoginKey(identifier, address);
  const current = loginAttempts.get(key);

  if (!current || Date.now() - current.startedAt >= loginWindowMs) {
    if (loginAttempts.size >= maxTrackedLoginKeys) {
      for (const [trackedKey, record] of loginAttempts) {
        if (Date.now() - record.startedAt >= loginWindowMs) loginAttempts.delete(trackedKey);
        if (loginAttempts.size < maxTrackedLoginKeys) break;
      }
    }
    loginAttempts.set(key, { count: 1, startedAt: Date.now() });
    return;
  }

  current.count += 1;
}

function clearLoginFailures(identifier, address) {
  loginAttempts.delete(getLoginKey(identifier, address));
}

exports.getStatus = (req, res) => {
  return sendSuccess(res, 'Auth controller ready');
};

exports.register = async (req, res) => {
  const { fullName, email, password, confirmPassword, role } = req.body || {};

  if (!fullName || !email || !password || !confirmPassword) {
    return sendError(res, 'Full name, email, password, and confirm password are required', 400);
  }

  const trimmedName = String(fullName).trim();
  const trimmedEmail = String(email).trim().toLowerCase();

  if (trimmedName.length < 2) {
    return sendError(res, 'Full name must be at least 2 characters long', 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return sendError(res, 'Please provide a valid email address', 400);
  }

  if (String(password).length < 8) {
    return sendError(res, 'Password must be at least 8 characters long', 400);
  }

  if (String(password) !== String(confirmPassword)) {
    return sendError(res, 'Passwords do not match', 400);
  }

  // Default registration role is question_creator so all users can create questions & answers
  const allowedRole = role === 'student' ? 'student' : 'question_creator';

  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [trimmedEmail]);
    if (existing.length > 0) {
      return sendError(res, 'An account with this email already exists', 409);
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const [result] = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
      [trimmedName, trimmedEmail, passwordHash, allowedRole]
    );

    const [rows] = await pool.query('SELECT id, full_name, email, role FROM users WHERE id = ?', [result.insertId]);
    const user = rows[0];
    const token = signUserToken(user);

    return sendSuccess(res, 'User registered successfully', {
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: normalizeRole(user.role),
      },
    }, 201);
  } catch (error) {
    console.error('User registration failed:', error.message);
    return sendError(res, 'Unable to register user', 500);
  }
};

exports.login = async (req, res) => {
  const { identifier, email, password } = req.body || {};
  const loginIdentifier = String(identifier || email || '').trim();

  if (!loginIdentifier || !password) {
    return sendError(res, 'Email and password are required', 400);
  }

  const clientAddress = req.ip;

  if (isLoginBlocked(loginIdentifier, clientAddress)) {
    return sendError(res, 'Too many failed login attempts. Try again later.', 429);
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE is_active = 1 AND (email = ? OR full_name = ?)',
      [loginIdentifier.toLowerCase(), loginIdentifier]
    );

    if (rows.length === 0) {
      recordLoginFailure(loginIdentifier, clientAddress);
      return sendError(res, 'Invalid user credentials', 401);
    }

    const user = rows[0];
    const isValidPassword = await bcrypt.compare(String(password), user.password_hash);

    if (!isValidPassword) {
      recordLoginFailure(loginIdentifier, clientAddress);
      return sendError(res, 'Invalid user credentials', 401);
    }

    clearLoginFailures(loginIdentifier, clientAddress);

    const token = signUserToken(user);

    return sendSuccess(res, 'Login successful', {
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: normalizeRole(user.role),
      },
    });
  } catch (error) {
    console.error('Login failed:', error.message);
    return sendError(res, 'Login failed. Please try again.', 500);
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, full_name, email, role, is_active, created_at FROM users WHERE id = ? AND is_active = 1',
      [req.user.id]
    );

    if (rows.length === 0) {
      return sendError(res, 'User not found', 404);
    }

    const user = rows[0];
    return sendSuccess(res, 'User profile retrieved successfully', {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: normalizeRole(user.role),
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('Get current user failed:', error.message);
    return sendError(res, 'Unable to load profile', 500);
  }
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return sendError(res, 'Current and new passwords are required', 400);
  }

  if (String(newPassword).length < 8) {
    return sendError(res, 'New password must be at least 8 characters long', 400);
  }

  if (String(currentPassword) === String(newPassword)) {
    return sendError(res, 'New password must be different from the current password', 400);
  }

  try {
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ? AND is_active = 1', [req.user.id]);
    if (rows.length === 0) return sendError(res, 'User account not found', 404);

    const isValidPassword = await bcrypt.compare(String(currentPassword), rows[0].password_hash);
    if (!isValidPassword) return sendError(res, 'Current password is incorrect', 401);

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);

    return sendSuccess(res, 'Password changed successfully');
  } catch (error) {
    console.error('Change password failed:', error.message);
    return sendError(res, 'Unable to change password', 500);
  }
};

exports.getUsers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, full_name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );

    return sendSuccess(res, 'Users retrieved successfully', { items: rows, count: rows.length });
  } catch (error) {
    console.error('Get users failed:', error.message);
    return sendError(res, 'Unable to load users', 500);
  }
};

exports.createUser = async (req, res) => {
  const { fullName, email, password, role } = req.body || {};

  if (!fullName || !email || !password) {
    return sendError(res, 'Full name, email, and password are required', 400);
  }

  const trimmedName = String(fullName).trim();
  const trimmedEmail = String(email).trim().toLowerCase();

  if (trimmedName.length < 2) {
    return sendError(res, 'Full name must be at least 2 characters long', 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return sendError(res, 'Please provide a valid email address', 400);
  }

  if (String(password).length < 8) {
    return sendError(res, 'Password must be at least 8 characters long', 400);
  }

  const allowedRole = ['super_admin', 'question_creator', 'student'].includes(role) ? role : 'student';

  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [trimmedEmail]);
    if (existing.length > 0) {
      return sendError(res, 'An account with this email already exists', 409);
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const [result] = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
      [trimmedName, trimmedEmail, passwordHash, allowedRole]
    );

    const [rows] = await pool.query('SELECT id, full_name, email, role, is_active, created_at FROM users WHERE id = ?', [result.insertId]);

    return sendSuccess(res, 'User created successfully', rows[0], 201);
  } catch (error) {
    console.error('Create user failed:', error.message);
    return sendError(res, 'Unable to create user', 500);
  }
};

exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { fullName, role, isActive } = req.body || {};

  if (!id) {
    return sendError(res, 'User ID is required', 400);
  }

  try {
    const [existing] = await pool.query('SELECT id, role FROM users WHERE id = ?', [id]);
    if (existing.length === 0) {
      return sendError(res, 'User not found', 404);
    }

    if (Number(id) === Number(req.user.id) && isActive === false) {
      return sendError(res, 'You cannot deactivate your own account', 400);
    }

    const updates = [];
    const values = [];

    if (fullName && typeof fullName === 'string' && fullName.trim().length >= 2) {
      updates.push('full_name = ?');
      values.push(fullName.trim());
    }

    if (role && ['super_admin', 'question_creator', 'student'].includes(role)) {
      updates.push('role = ?');
      values.push(role);
    }

    if (typeof isActive === 'boolean' || typeof isActive === 'number') {
      updates.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return sendError(res, 'No valid fields provided to update', 400);
    }

    values.push(id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    const [rows] = await pool.query('SELECT id, full_name, email, role, is_active, created_at FROM users WHERE id = ?', [id]);
    return sendSuccess(res, 'User updated successfully', rows[0]);
  } catch (error) {
    console.error('Update user failed:', error.message);
    return sendError(res, 'Unable to update user', 500);
  }
};

exports.deleteUser = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return sendError(res, 'User ID is required', 400);
  }

  if (Number(id) === Number(req.user.id)) {
    return sendError(res, 'You cannot delete your own account', 400);
  }

  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE id = ?', [id]);
    if (rows.length === 0) {
      return sendError(res, 'User not found', 404);
    }

    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    return sendSuccess(res, 'User deleted successfully', { id });
  } catch (error) {
    console.error('Delete user failed:', error.message);
    return sendError(res, 'Unable to delete user', 500);
  }
};

