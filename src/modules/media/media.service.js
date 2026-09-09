const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('../../infrastructure/s3/client');
const env = require('../../config/env');

const uploadsDir = path.join(__dirname, '../../../../uploads');
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (_) {}
}

function getPublicUrl(key) {
  if (env.media && env.media.publicUrl) {
    const base = env.media.publicUrl.replace(/\/+$/, '');
    return `${base}/${key}`;
  }
  return `https://server.lovydate.fun/api/v1/media/${key}`;
}

function getMediaKind(mimetype = '') {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('video/')) return 'video';
  return 'file';
}

function isManagedMediaUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const candidate = new URL(url);
    const base = new URL(`${env.media.publicUrl.replace(/\/+$/, '')}/`);
    return candidate.origin === base.origin && candidate.pathname.startsWith(base.pathname);
  } catch (_) {
    return false;
  }
}

// MP4, M4V and QuickTime files all carry their duration in the movie-header
// (mvhd) atom. Reading it here keeps the 90-second rule authoritative on the
// server instead of trusting a duration supplied by the client.
function readMp4DurationSeconds(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) return NaN;

  let index = 0;
  while (index >= 0 && index < buffer.length - 32) {
    index = buffer.indexOf('mvhd', index, 'ascii');
    if (index < 0) break;

    try {
      const version = buffer.readUInt8(index + 4);
      if (version === 0 && index + 24 <= buffer.length) {
        const timescale = buffer.readUInt32BE(index + 16);
        const duration = buffer.readUInt32BE(index + 20);
        if (timescale > 0 && duration > 0) return duration / timescale;
      }
      if (version === 1 && index + 36 <= buffer.length) {
        const timescale = buffer.readUInt32BE(index + 24);
        const duration = buffer.readBigUInt64BE(index + 28);
        if (timescale > 0 && duration > 0n) return Number(duration) / timescale;
      }
    } catch (_) {}

    index += 4;
  }

  return NaN;
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

  try {
    const command = new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || 'image/jpeg',
    });

    await s3Client.send(command);
  } catch (s3Error) {
    console.warn(`[MediaService] S3 upload failed for ${key}, falling back to local storage:`, s3Error.message);
    const localFilePath = path.join(uploadsDir, key);
    fs.writeFileSync(localFilePath, file.buffer);
  }

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
  getMediaKind,
  isManagedMediaUrl,
  readMp4DurationSeconds,
};
