const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('../../infrastructure/s3/client');
const env = require('../../config/env');

function getPublicUrl(key) {
  const endpoint = env.s3.endpoint.replace(/\/+$/, '');
  const bucket = env.s3.bucket;
  return `${endpoint}/${bucket}/${key}`;
}

async function uploadFileToS3(file) {
  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const key = `${uuidv4()}${ext}`;

  const command = new PutObjectCommand({
    Bucket: env.s3.bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || 'image/jpeg',
  });

  await s3Client.send(command);

  return {
    key,
    url: getPublicUrl(key),
    size: file.size || (file.buffer ? file.buffer.length : 0),
    mimetype: file.mimetype,
  };
}

module.exports = {
  uploadFileToS3,
  getPublicUrl,
};
