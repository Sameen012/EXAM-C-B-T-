const jwt = require('jsonwebtoken');
const { sendError } = require('../utils/response');

function normalizeRole(role) {
  if (role === 'admin') return 'super_admin';
  return role;
}

exports.requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'Authentication token is required', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    decoded.role = normalizeRole(decoded.role);
    req.user = decoded;
    return next();
  } catch (error) {
    return sendError(res, 'Invalid or expired token', 401);
  }
};

exports.requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return sendError(res, 'Authentication token is required', 401);
  }

  const role = normalizeRole(req.user.role);
  req.user.role = role;

  if (!allowedRoles.includes(role)) {
    return sendError(res, 'You do not have permission to access this resource', 403);
  }

  return next();
};

exports.requireAdmin = (req, res, next) => {
  return exports.requireRole('super_admin', 'question_creator', 'student')(req, res, next);
};

exports.requireCreatorOrAdmin = (req, res, next) => {
  return exports.requireRole('super_admin', 'question_creator', 'student')(req, res, next);
};

exports.requireSuperAdmin = (req, res, next) => {
  return exports.requireRole('super_admin')(req, res, next);
};

exports.requireStudent = (req, res, next) => {
  return exports.requireRole('student', 'super_admin', 'question_creator')(req, res, next);
};
