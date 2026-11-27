const path = require("path");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client } = require("../../infrastructure/s3/client");
const env = require("../../config/env");
const { AppError } = require("../../shared/errors");

const IMAGE_FORMATS = {
  "image/jpeg": {
    extension: ".jpg",
    mimetype: "image/jpeg",
  },
  "image/png": {
    extension: ".png",
    mimetype: "image/png",
  },
  "image/webp": {
    extension: ".webp",
    mimetype: "image/webp",
  },
  "image/gif": {
    extension: ".jpg",
    mimetype: "image/jpeg",
  },
  "image/tiff": {
    extension: ".jpg",
    mimetype: "image/jpeg",
  },
  "image/tif": {
    extension: ".jpg",
    mimetype: "image/jpeg",
  },
  "image/x-tiff": {
    extension: ".jpg",
    mimetype: "image/jpeg",
  },
};

function normalizeMimeType(mimetype = "") {
  const normalized = mimetype.toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

// Detects supported image formats using their actual file signatures.

function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  // JPEG
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mime: "image/jpeg" };
  }

  // PNG
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mime: "image/png" };
  }

  // WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mime: "image/webp" };
  }

  // GIF
  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))
  ) {
    return { mime: "image/gif" };
  }

  // TIFF (little-endian or big-endian)
  if (
    buffer.length >= 4 &&
    (buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
      buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])))
  ) {
    return { mime: "image/tiff" };
  }

  return null;
}

function getPublicUrl(key) {
  if (env.media && env.media.publicUrl) {
    const base = env.media.publicUrl.replace(/\/+$/, "");
    return `${base}/${key}`;
  }

  return `https://server.lovydate.fun/api/v1/media/${key}`;
}

function getPrivateUrl(key) {
  const base = (
    env.media?.publicUrl || "https://server.lovydate.fun/api/v1/media"
  ).replace(/\/+$/, "");

  return `${base}/private/${encodeURIComponent(key)}`;
}

function getMediaKind(mimetype = "") {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("video/")) return "video";
  return "file";
}

function isManagedMediaUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;

  try {
    const candidate = new URL(url);
    const publicUrl = env.media && env.media.publicUrl;

    if (!publicUrl) return false;

    const base = new URL(`${publicUrl.replace(/\/+$/, "")}/`);

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
    index = buffer.indexOf("mvhd", index, "ascii");
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

function invalidImage(message = "Invalid or unsupported image file.") {
  return new AppError(message, 400, "INVALID_IMAGE");
}

// Validates actual file signatures, not just client-provided MIME types.

async function validateImageBuffer(file) {
  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw invalidImage();
  }

  const detected = detectFileType(file.buffer);

  if (!detected || !IMAGE_FORMATS[detected.mime]) {
    throw invalidImage("The uploaded file is not a supported image.");
  }

  const declaredMime = normalizeMimeType(file.mimetype);

  const mimeAliases = {
    "image/jpg": "image/jpeg",
    "image/tif": "image/tiff",
    "image/x-tiff": "image/tiff",
  };

  const normalizedDeclared = mimeAliases[declaredMime] || declaredMime;

  if (detected.mime !== normalizedDeclared) {
    throw invalidImage(
      "The image content does not match its declared file type.",
    );
  }

  try {
    await sharp(file.buffer, {
      limitInputPixels: 40_000_000,
      animated: false,
    }).metadata();
  } catch (_) {
    throw invalidImage("The uploaded image cannot be decoded.");
  }

  return detected;
}

// Optimizes supported images and keeps filename extensions consistent.

async function optimizeImage(file) {
  const declaredMime = normalizeMimeType(file.mimetype);
  const format = IMAGE_FORMATS[declaredMime];

  if (!format) return file;

  const detected = await validateImageBuffer(file);

  try {
    const pipeline = sharp(file.buffer, {
      limitInputPixels: 40_000_000,
      animated: false,
    })
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      });

    let optimizedBuffer;

    if (format.mimetype === "image/png") {
      optimizedBuffer = await pipeline
        .png({
          compressionLevel: 9,
          effort: 5,
        })
        .toBuffer();
    } else if (format.mimetype === "image/webp") {
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

    const originalName = path.parse(file.originalname || "upload").name;

    const updatedFile = {
      ...file,
      mimetype: format.mimetype,
      originalname: `${originalName}${format.extension}`,
      buffer: optimizedBuffer,
      size: optimizedBuffer.length,
    };

    // Preserve original bytes only when no format conversion is needed.
    if (
      detected.mime === format.mimetype &&
      optimizedBuffer.length >= file.buffer.length
    ) {
      return {
        ...file,
        mimetype: format.mimetype,
        originalname: `${originalName}${format.extension}`,
      };
    }

    return updatedFile;
  } catch (error) {
    console.error("[MediaService] Image optimization failed:", error.message);

    throw new AppError(
      "The image could not be processed. Please choose another image.",
      400,
      "IMAGE_PROCESSING_FAILED",
    );
  }
}

async function getFileFromS3(key, range = null) {
  if (!env.s3.configured) {
    throw new AppError(
      "Media storage is not configured.",
      503,
      "MEDIA_STORAGE_UNAVAILABLE",
    );
  }

  if (range && !/^bytes=\d+-\d*$/.test(range)) {
    throw new AppError(
      "Invalid video byte range.",
      416,
      "INVALID_BYTE_RANGE",
    );
  }

  const command = new GetObjectCommand({
    Bucket: env.s3.bucket,
    Key: key,
    ...(range ? { Range: range } : {}),
  });

  const response = await s3Client.send(command);

  return {
    stream: response.Body,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    contentRange: response.ContentRange,
    acceptRanges: response.AcceptRanges,
    eTag: response.ETag,
    lastModified: response.LastModified,
  };
}


async function deleteStoryMedia(key) {
  if (!env.s3.configured) {
    throw new AppError("Media storage is not configured.", 503, "MEDIA_STORAGE_UNAVAILABLE");
  }

  if (typeof key !== "string" || !/^stories\/[a-f0-9-]+\.[a-z0-9]+$/i.test(key)) {
    throw new AppError("Invalid story media key.", 400, "INVALID_MEDIA_KEY");
  }

  await s3Client.send(new DeleteObjectCommand({
    Bucket: env.s3.bucket,
    Key: key,
  }));
}
async function uploadFileToS3(file, options = {}) {
  if (!env.s3.configured) {
    throw new AppError(
      "Media storage is not configured.",
      503,
      "MEDIA_STORAGE_UNAVAILABLE",
    );
  }

  const optimizedFile = await optimizeImage(file);

  // AI anti-nudity moderation (images only)
  if (
    optimizedFile.mimetype?.startsWith("image/") &&
    (env.moderation.enabled || (env.isProduction && options.story))
  ) {
    const moderationUrl = env.moderation.url;
    const moderationKey = env.moderation.apiKey;

    if (!moderationUrl || !moderationKey) {
      throw new AppError(
        "Image moderation is not configured.",
        503,
        "MODERATION_UNAVAILABLE",
      );
    }

    try {
      const form = new FormData();

      form.append(
        "file",
        new Blob([optimizedFile.buffer], {
          type: optimizedFile.mimetype,
        }),
        optimizedFile.originalname || "upload.jpg",
      );

      const response = await fetch(
        `${moderationUrl.replace(/\/+$/, "")}/v1/nudity/upload`,
        {
          method: "POST",
          headers: {
            "X-API-Key": moderationKey,
          },
          body: form,
          signal: AbortSignal.timeout(30000),
        },
      );

      if (!response.ok) {
        throw new Error(`Moderation service returned HTTP ${response.status}`);
      }

      const result = await response.json();

      if (typeof result.is_nude !== "boolean") {
        throw new Error("Invalid moderation response");
      }

      if (result.is_nude) {
        throw new AppError(
          "This image cannot be uploaded because it may contain nudity.",
          400,
          "IMAGE_CONTENT_NOT_ALLOWED",
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;

      console.error("[Moderation] Image analysis failed:", error.message);

      throw new AppError(
        "Image moderation is temporarily unavailable. Please try again.",
        503,
        "MODERATION_UNAVAILABLE",
      );
    }
  }

  const ext =
    path.extname(optimizedFile.originalname || "").toLowerCase() || ".jpg";

  const key = options.story
    ? `stories/${uuidv4()}${ext}`
    : `${options.private ? "chat-" : ""}${uuidv4()}${ext}`;

  try {
    const command = new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: optimizedFile.buffer,
      ContentType: optimizedFile.mimetype || "image/jpeg",
    });

    await s3Client.send(command);
  } catch (s3Error) {
    console.error(
      `[MediaService] S3 upload failed for ${key}:`,
      s3Error.message,
    );

    throw new AppError(
      "Media storage is temporarily unavailable. Please try the upload again.",
      503,
      "MEDIA_STORAGE_UNAVAILABLE",
    );
  }

  return {
    key,
    url: options.story
      ? null
      : options.private
        ? getPrivateUrl(key)
        : getPublicUrl(key),
    size: optimizedFile.size || optimizedFile.buffer.length,
    mimetype: optimizedFile.mimetype,
  };
}

module.exports = {
  uploadFileToS3,
  deleteStoryMedia,
  getFileFromS3,
  getPublicUrl,
  getMediaKind,
  isManagedMediaUrl,
  readMp4DurationSeconds,
  getPrivateUrl,
  isS3Configured: () => env.s3.configured,
};


