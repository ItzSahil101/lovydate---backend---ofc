const { ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('./client');
const env = require('../../config/env');

async function clearMinioBucket() {
  console.log(`🗑️ Clearing all objects from MinIO bucket '${env.s3.bucket}' (${env.s3.endpoint})...`);

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
      console.log(`Deleting batch of ${objectsToDelete.length} objects...`);

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

    console.log(`✅ Successfully deleted ${totalDeleted} objects from MinIO bucket '${env.s3.bucket}'.`);
  } catch (err) {
    console.error('❌ Failed to clear MinIO bucket:', err.message);
  }
}

if (require.main === module) {
  clearMinioBucket().then(() => process.exit(0));
}

module.exports = {
  clearMinioBucket,
};
