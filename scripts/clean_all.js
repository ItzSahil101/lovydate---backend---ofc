require('dotenv').config();
const { pool } = require('../src/infrastructure/database/pool');
const { runMigrations } = require('../src/infrastructure/database/migrate');
const { s3Client } = require('../src/infrastructure/s3/client');
const { ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const env = require('../src/config/env');
const redis = require('../src/infrastructure/redis/client');

async function clearDatabase() {
  console.log('\n📦 [1/3] Cleaning PostgreSQL Database...');
  const client = await pool.connect();
  try {
    // Drop all tables in public schema and re-create schema
    await client.query('DROP SCHEMA public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query('GRANT ALL ON SCHEMA public TO public;');
    console.log('✅ Database schema dropped and recreated.');
  } catch (err) {
    console.error('❌ Failed to reset schema:', err.message);
    throw err;
  } finally {
    client.release();
  }

  console.log('🔄 Re-running all database migrations from scratch...');
  await runMigrations({ closePool: false });
  console.log('✅ Database schema and seed data freshly initialized.');
}

async function clearMinio() {
  console.log(`\n🪣 [2/3] Cleaning MinIO Bucket '${env.s3.bucket}' (${env.s3.endpoint})...`);
  try {
    let isTruncated = true;
    let continuationToken;
    let totalDeleted = 0;

    while (isTruncated) {
      const listRes = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: env.s3.bucket,
          ContinuationToken: continuationToken,
        })
      );

      if (!listRes.Contents || listRes.Contents.length === 0) {
        break;
      }

      const objectsToDelete = listRes.Contents.map((obj) => ({ Key: obj.Key }));
      console.log(`  Deleting batch of ${objectsToDelete.length} MinIO objects...`);

      const deleteRes = await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: env.s3.bucket,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true,
          },
        })
      );

      totalDeleted += deleteRes.Deleted?.length || objectsToDelete.length;
      isTruncated = Boolean(listRes.IsTruncated);
      continuationToken = listRes.NextContinuationToken;
    }

    console.log(`✅ MinIO: Deleted ${totalDeleted} files from bucket '${env.s3.bucket}'.`);
  } catch (err) {
    console.warn('⚠️ MinIO cleaning notice:', err.message);
  }
}

async function clearRedis() {
  console.log('\n⚡ [3/3] Flushing Redis Cache & Session Keys...');
  try {
    await redis.connect().catch(() => {});
    await redis.flushdb();
    console.log('✅ Redis: Cache database flushed.');
  } catch (err) {
    console.log('ℹ️ Redis notice (skipped):', err.message);
  } finally {
    try {
      redis.disconnect();
    } catch (_) {}
  }
}

async function main() {
  console.log('====================================================');
  console.log('🧹 LovyDate Complete System Reset & Cleanup');
  console.log('====================================================');

  const start = Date.now();
  try {
    await clearDatabase();
    await clearMinio();
    await clearRedis();

    console.log('\n====================================================');
    console.log(`🎉 ALL CLEAN! System reset completed in ${((Date.now() - start) / 1000).toFixed(2)}s.`);
    console.log('   - Database: Cleaned & migrations applied');
    console.log('   - MinIO: All files deleted');
    console.log('   - Redis: Cache flushed');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ Cleanup encountered an error:', err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  clearDatabase,
  clearMinio,
  clearRedis,
  main,
};
