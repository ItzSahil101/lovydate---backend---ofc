const fs = require('fs');
const path = require('path');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('./client');
const { pool } = require('../database/pool');
const env = require('../../config/env');

const uploadsDir = path.join(__dirname, '../../../uploads');

function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

async function migrateUploadsToS3() {
  console.log('🚀 Starting migration of local uploads to MinIO / S3...');
  console.log(`Endpoint: ${env.s3.endpoint}`);
  console.log(`Bucket:   ${env.s3.bucket}`);

  if (!fs.existsSync(uploadsDir)) {
    console.log('No uploads directory found.');
    return;
  }

  const files = fs.readdirSync(uploadsDir).filter((file) => {
    return file !== '.gitkeep' && fs.statSync(path.join(uploadsDir, file)).isFile();
  });

  console.log(`Found ${files.length} files in ${uploadsDir}`);

  let uploadedCount = 0;
  for (const fileName of files) {
    const filePath = path.join(uploadsDir, fileName);
    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = getMimeType(fileName);

    try {
      const command = new PutObjectCommand({
        Bucket: env.s3.bucket,
        Key: fileName,
        Body: fileBuffer,
        ContentType: mimeType,
      });

      await s3Client.send(command);
      uploadedCount++;
      const s3Url = `${env.s3.endpoint.replace(/\/+$/, '')}/${env.s3.bucket}/${fileName}`;
      console.log(` [${uploadedCount}/${files.length}] Uploaded: ${fileName} -> ${s3Url}`);
    } catch (err) {
      console.error(`❌ Failed to upload ${fileName}:`, err.message);
    }
  }

  console.log(`\n🎉 Uploaded ${uploadedCount}/${files.length} files to S3 bucket '${env.s3.bucket}'.`);

  // Update DB URLs if database is reachable
  try {
    console.log('\n🔄 Updating database references in PostgreSQL...');
    const client = await pool.connect();
    try {
      const s3BaseUrl = `${env.s3.endpoint.replace(/\/+$/, '')}/${env.s3.bucket}`;

      // Update profile_photos
      const profilePhotosRes = await client.query(`
        UPDATE profile_photos
        SET url = regexp_replace(url, '^.*/uploads/', '${s3BaseUrl}/')
        WHERE url LIKE '%/uploads/%'
        RETURNING id, url;
      `);
      console.log(`✅ Updated ${profilePhotosRes.rowCount} profile_photos rows to S3 URLs.`);

      // Update post_photos
      const postPhotosRes = await client.query(`
        UPDATE post_photos
        SET url = regexp_replace(url, '^.*/uploads/', '${s3BaseUrl}/')
        WHERE url LIKE '%/uploads/%'
        RETURNING id, url;
      `);
      console.log(`✅ Updated ${postPhotosRes.rowCount} post_photos rows to S3 URLs.`);

      // Update onboarding_progress draft_data
      const onboardingRes = await client.query(`
        UPDATE onboarding_progress
        SET draft_data = regexp_replace(draft_data::text, 'http[^"]+/uploads/', '${s3BaseUrl}/', 'g')::jsonb
        WHERE draft_data::text LIKE '%/uploads/%'
        RETURNING user_id;
      `);
      console.log(`✅ Updated ${onboardingRes.rowCount} onboarding_progress drafts to S3 URLs.`);
    } finally {
      client.release();
    }
  } catch (dbErr) {
    console.warn('⚠️ Could not update DB rows (DB connection failed or table missing):', dbErr.message);
  }

  console.log('\n Migration completed successfully.');
  process.exit(0);
}

if (require.main === module) {
  migrateUploadsToS3().catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
  });
}

module.exports = {
  migrateUploadsToS3,
};
