const { Pool } = require('pg');
const logger = require('../utils/logger');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected PostgreSQL pool error:', err);
    });
  }
  return pool;
}

async function connectDB() {
  const client = await getPool().connect();
  try {
    await client.query('SELECT NOW()');
    logger.info('PostgreSQL connected successfully');
  } finally {
    client.release();
  }
}

/**
 * Execute a query with optional params.
 * Returns the pg QueryResult object.
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await getPool().query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', { text: text.slice(0, 80), duration, rows: result.rowCount });
    return result;
  } catch (err) {
    logger.error('Query error', { text: text.slice(0, 80), error: err.message });
    throw err;
  }
}

/**
 * Run a function inside a transaction.
 * Automatically commits or rolls back.
 */
async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { connectDB, query, withTransaction, getPool };
