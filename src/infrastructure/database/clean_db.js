require('dotenv').config();
const { clearDatabase } = require('../../../scripts/clean_all');
const { pool } = require('./pool');

async function run() {
  try {
    await clearDatabase();
    console.log('✅ Database cleaned successfully.');
  } catch (err) {
    console.error('❌ Error cleaning database:', err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
