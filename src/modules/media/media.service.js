
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const {
  PutObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { s3Client } = require('../../infrastructure/s3/client');
const env = require('../../config/env');
const { AppError } = require('../../shared/errors');

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
    const base = new URL(
      `${env.media.publicUrl.replace(/\/+$/, '')}/`
    );

    return (
      candidate.origin === base.origin &&
      candidate.pathname.startsWith(base.pathname)
    );
  } catch (_) {
    return false;
  }
}

// Reads MP4/M4V/MOV duration from the movie-header atom.
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

        if (timescale > 0 && duration > 0) {
          return duration / timescale;
        }
      }

      if (version === 1 && index + 36 <= buffer.length) {
        const timescale = buffer.readUInt32BE(index + 24);
        const duration = buffer.readBigUInt64BE(index + 28);

        if (timescale > 0 && duration > 0n) {
          return Number(duration) / timescale;
        }
      }
    } catch (_) {}

    index += 4;
  }

  return NaN;
}

// Optimizes supported images and keeps filename extensions consistent.
async function optimizeImage(file) {
  const formats = {
    'image/jpeg': {
      extension: '.jpg',
      mimetype: 'image/jpeg',
    },
    'image/jpg': {
      extension: '.jpg',
      mimetype: 'image/jpeg',
    },
    'image/png': {
      extension: '.png',
      mimetype: 'image/png',
    },
    'image/webp': {
      extension: '.webp',
      mimetype: 'image/webp',
    },
  };

  const format = formats[file.mimetype];

  // Leave GIF, audio, video and unsupported files unchanged.
  if (!format) return file;

  if (!Buffer.isBuffer(file.buffer)) {
    throw new AppError(
      'Invalid image file.',
      400,
      'INVALID_IMAGE'
    );
  }

  try {
    const pipeline = sharp(file.buffer, {
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: 'inside',
        withoutEnlargement: true,
      });

    let optimizedBuffer;

    if (format.mimetype === 'image/png') {
      optimizedBuffer = await pipeline
        .png({
          compressionLevel: 9,
          effort: 5,
        })
        .toBuffer();
    } else if (format.mimetype === 'image/webp') {
      optimizedBuffer = await pipeline
        .webp({
          quality: 82,
          effort: 4,
        })
        .toBuffer();
    } else {
      optimizedBuffer = await pipeline
        .jpeg({
          quality: 82,
          mozjpeg: true,
        })
        .toBuffer();
    }

    const originalName = path.parse(
      file.originalname || 'upload'
    ).name;

    const updatedFile = {
      ...file,
      mimetype: format.mimetype,
      originalname: `${originalName}${format.extension}`,
    };

    // Keep the original bytes if optimization makes the file larger.
    if (optimizedBuffer.length >= file.buffer.length) {
      return updatedFile;
    }

    return {
      ...updatedFile,
      buffer: optimizedBuffer,
      size: optimizedBuffer.length,
    };
  } catch (error) {
    console.error(
      '[MediaService] Image optimization failed:',
      error.message
    );

    throw new AppError(
      'The image could not be processed. Please choose another image.',
      400,
      'IMAGE_PROCESSING_FAILED'
    );
  }
}

async function getFileFromS3(key) {
  if (!env.s3.configured) {
    throw new AppError(
      'Media storage is not configured.',
      503,
      'MEDIA_STORAGE_UNAVAILABLE'
    );
  }

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
  if (!env.s3.configured) {
    throw new AppError(
      'Media storage is not configured.',
      503,
      'MEDIA_STORAGE_UNAVAILABLE'
    );
  }

  // Optimize images before uploading. Other media remains unchanged.
  const optimizedFile = await optimizeImage(file);

  const ext =
    path.extname(optimizedFile.originalname || '').toLowerCase() || '.jpg';

  const key = `${uuidv4()}${ext}`;

  try {
    const command = new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: optimizedFile.buffer,
      ContentType: optimizedFile.mimetype || 'image/jpeg',
    });

    await s3Client.send(command);
  } catch (s3Error) {
    console.error(
      `[MediaService] S3 upload failed for ${key}:`,
      s3Error.message
    );

    throw new AppError(
      'Media storage is temporarily unavailable. Please try the upload again.',
      503,
      'MEDIA_STORAGE_UNAVAILABLE'
    );
  }

  return {
    key,
    url: getPublicUrl(key),
    size: optimizedFile.size || optimizedFile.buffer.length,
    mimetype: optimizedFile.mimetype,
  };
}

module.exports = {
  uploadFileToS3,
  getFileFromS3,
  getPublicUrl,
  getMediaKind,
  isManagedMediaUrl,
  readMp4DurationSeconds,
  isS3Configured: () => env.s3.configured,
};
