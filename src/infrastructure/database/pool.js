const { Pool } = require('pg');
const env = require('../../config/env');

const pool = new Pool({
  connectionString: env.database.url,
  min: env.database.poolMin,
  max: env.database.poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: env.database.statementTimeoutMs,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err);
});

async function query(text, params = []) {
  const start = Date.now();
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    const duration = Date.now() - start;
    if (duration > 250) {
      console.warn(`[SLOW QUERY] ${duration}ms: ${text.substring(0, 120)}`);
    }
    return res;
  } finally {
    client.release();
  }
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
};
