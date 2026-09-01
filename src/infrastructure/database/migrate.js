const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

async function runMigrations() {
  const migrationsDirectory = path.join(__dirname, '../../../migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    console.log('Running database migrations...');
    for (const migrationFile of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDirectory, migrationFile), 'utf8');
      console.log(`Applying ${migrationFile}...`);
      await client.query(sql);
    }
    console.log('Migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
