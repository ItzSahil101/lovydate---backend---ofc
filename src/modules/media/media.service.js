const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('../../infrastructure/s3/client');
const env = require('../../config/env');

function getPublicUrl(key) {
  if (env.media && env.media.publicUrl) {
    const base = env.media.publicUrl.replace(/\/+$/, '');
    return `${base}/${key}`;
  }
  return `https://server.lovydate.fun/api/v1/media/${key}`;
}

async function getFileFromS3(key) {
  const command = new GetObjectCommand({
    Bucket: env.s3.bucket,
    Key: key,
  });

  const response = await s3Client.send(command);
  return {
    stream: response.Body,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    eTag: response.ETag,
    lastModified: response.LastModified,
  };
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
  getFileFromS3,
  getPublicUrl,
};
