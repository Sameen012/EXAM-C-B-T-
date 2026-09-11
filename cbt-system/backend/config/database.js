const path = require('path');
const { createClient } = require('@libsql/client');
const dotenv = require('dotenv');

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

function getDatabaseConfig() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Fatal: TURSO_DATABASE_URL is not configured in production environment.');
      throw new Error('TURSO_DATABASE_URL is required for production database connectivity.');
    }
    // Safe local fallback for development/test mode when no remote database is configured
    return {
      url: 'file:cbt_database.db',
      authToken: undefined,
    };
  }

  return {
    url,
    authToken: authToken || undefined,
  };
}

const config = getDatabaseConfig();
const db = createClient(config);

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const copy = {};
  for (const [key, val] of Object.entries(row)) {
    if (typeof val === 'bigint') {
      copy[key] = Number(val);
    } else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(val)) {
      copy[key] = `${val.replace(' ', 'T')}Z`;
    } else {
      copy[key] = val;
    }
  }
  return copy;
}

async function executeQuery(executor, sql, values = []) {
  const cleanSql = String(sql).trim();
  const args = Array.isArray(values)
    ? values.map((v) => (v === undefined ? null : v))
    : values;

  const result = await executor.execute({ sql: cleanSql, args });

  const isSelect = /^\s*(SELECT|PRAGMA|SHOW|EXPLAIN)\b/i.test(cleanSql);

  if (result.rows && result.rows.length > 0) {
    return [result.rows.map(normalizeRow), { columns: result.columns }];
  }

  if (isSelect) {
    return [[], { columns: result.columns }];
  }

  const insertId = result.lastInsertRowid != null ? Number(result.lastInsertRowid) : 0;
  const affectedRows = Number(result.rowsAffected || 0);

  return [{ insertId, affectedRows }, { columns: result.columns }];
}

const pool = {
  async query(sql, values = []) {
    return executeQuery(db, sql, values);
  },

  async getConnection() {
    let tx = null;
    return {
      async beginTransaction() {
        tx = await db.transaction('write');
      },
      async query(sql, values = []) {
        const executor = tx || db;
        return executeQuery(executor, sql, values);
      },
      async commit() {
        if (tx) {
          await tx.commit();
          tx = null;
        }
      },
      async rollback() {
        if (tx) {
          try {
            await tx.rollback();
          } catch (_) {}
          tx = null;
        }
      },
      release() {
        if (tx) {
          try {
            tx.close();
          } catch (_) {}
          tx = null;
        }
      },
    };
  },

  async end() {
    try {
      if (typeof db.close === 'function') {
        db.close();
      }
    } catch (_) {}
  },
};

async function testDatabaseConnection() {
  try {
    await db.execute('SELECT 1');
    const displayTarget = (config.url || '')
      .replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@');
    const isLocal = displayTarget.startsWith('file:');
    console.log(`Turso (libSQL) database connected successfully [${isLocal ? 'local file' : 'cloud database'}]`);
    return true;
  } catch (error) {
    console.error('Turso (libSQL) database connection failed:', error.message);
    throw error;
  }
}

module.exports = {
  db,
  pool,
  query: pool.query,
  testDatabaseConnection,
};
