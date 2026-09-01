const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

async function runMigrations({ closePool = false } = {}) {
  const migrationsDirectory = path.join(__dirname, '../../../migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    console.log('Checking and running database migrations...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    for (const migrationFile of migrationFiles) {
      const alreadyApplied = await client.query(
        `SELECT 1 FROM _migrations WHERE name = $1`,
        [migrationFile]
      );

      if (alreadyApplied.rows.length === 0) {
        const sql = fs.readFileSync(path.join(migrationsDirectory, migrationFile), 'utf8');
        console.log(`Applying migration ${migrationFile}...`);
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(`INSERT INTO _migrations (name) VALUES ($1)`, [migrationFile]);
        await client.query('COMMIT');
        console.log(`Successfully applied ${migrationFile}`);
      }
    }
    console.log('Database migrations are up to date.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration error:', err.message);
  } finally {
    client.release();
    if (closePool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  runMigrations({ closePool: true }).then(() => process.exit(0));
}

module.exports = { runMigrations };
