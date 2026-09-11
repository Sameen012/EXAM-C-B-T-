const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from cwd, cbt-system folder, and workspace root
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const express = require('express');
const crypto = require('crypto');

const { initDatabase } = require('../database/initDatabase');
const { pool, testDatabaseConnection } = require('./config/database');
const { ensureAdminExists } = require('./utils/adminSeeder');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const courseRoutes = require('./routes/courseRoutes');
const questionRoutes = require('./routes/questionRoutes');
const examRoutes = require('./routes/examRoutes');
const resultRoutes = require('./routes/resultRoutes');
const studentRoutes = require('./routes/studentRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

function validateProductionConfiguration() {
  if (process.env.NODE_ENV !== 'production') return;

  const insecureValues = [
    'replace_with_a_secure_random_secret',
    'default_secret',
    'admin123',
  ];
  const requiredValues = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'JWT_SECRET', 'ADMIN_PASSWORD'];
  const missing = requiredValues.filter((name) => !process.env[name]);
  const insecure = requiredValues.filter((name) => insecureValues.includes(process.env[name]));

  if (missing.length > 0 || insecure.length > 0) {
    throw new Error('Production configuration must define secure Turso database credentials, JWT, and admin credentials');
  }
}

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'"
  );
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '500kb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/students', studentRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'CBT API is running',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({
      success: true,
      message: 'CBT system is ready',
      checks: { database: 'up' },
    });
  } catch (error) {
    console.error('Readiness check failed:', error.message);
    return res.status(503).json({
      success: false,
      message: 'CBT system is not ready',
      checks: { database: 'down' },
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.message);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Request body contains invalid JSON',
      requestId: req.requestId,
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Request body is too large',
      requestId: req.requestId,
    });
  }

  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.statusCode ? err.message : 'Internal server error',
    requestId: req.requestId,
  });
});

let bootstrapPromise = null;

async function bootstrapDatabase() {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    try {
      await initDatabase();
      await testDatabaseConnection();
      await ensureAdminExists();
    } catch (error) {
      console.error('Database bootstrap failed:', error.message);
      throw error;
    }
  })();

  return bootstrapPromise;
}

async function startServer() {
  try {
    validateProductionConfiguration();
    await bootstrapDatabase();

    const server = app.listen(PORT, () => {
      console.log(`CBT backend running on http://localhost:${PORT}`);
    });

    const shutdown = (signal) => {
      console.log(`${signal} received, shutting down gracefully`);
      server.close(async () => {
        await pool.end();
        console.log('CBT backend stopped');
        process.exit(0);
      });
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));

    return server;
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  bootstrapDatabase,
};
