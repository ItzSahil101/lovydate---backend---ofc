const {
  uploadFileToS3,
  getFileFromS3,
  deleteStoryMedia,
  getMediaKind,
  readMp4DurationSeconds,
} = require("../media/media.service");


const { createStory, getStoryForViewer, getStoriesForViewer, recordStoryView, deleteStory } = require("./stories.repository");
const highlightsRepository = require("./stories.highlights.repository");
const { success } = require("../../shared/response");
const { AppError, BadRequestError } = require("../../shared/errors");

async function uploadStory(req, res, next) {
  try {
    const userId = req.user?.userId;
    const file = req.file;

    if (!file) {
      throw new BadRequestError("Story media file is required", "FILE_REQUIRED");
    }

    const kind = getMediaKind(file.mimetype);

    if (!["image", "video"].includes(kind)) {
      throw new BadRequestError(
        "Stories support images and videos only",
        "INVALID_FILE_TYPE",
      );
    }

    let durationSeconds = null;

    if (kind === "video") {
      if (file.mimetype !== "video/mp4") {
        throw new BadRequestError(
          "Stories currently support MP4 videos only",
          "INVALID_FILE_TYPE",
        );
      }

      if (
        file.buffer.length < 12 ||
        file.buffer.toString("ascii", 4, 8) !== "ftyp"
      ) {
        throw new BadRequestError(
          "Invalid MP4 video file",
          "INVALID_VIDEO",
        );
      }

      durationSeconds = readMp4DurationSeconds(file.buffer);

      if (
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0 ||
        durationSeconds > 40
      ) {
        throw new BadRequestError(
          "Story videos must be 40 seconds or shorter",
          "VIDEO_TOO_LONG",
        );
      }
    }

    const visibility = req.body.visibility || "everyone";

    if (!["everyone", "matches", "selected"].includes(visibility)) {
      throw new BadRequestError(
        "Invalid story visibility",
        "INVALID_VISIBILITY",
      );
    }

    let allowedViewerIds = [];

    if (req.body.allowedViewerIds) {
      try {
        allowedViewerIds = JSON.parse(req.body.allowedViewerIds);
      } catch {
        throw new BadRequestError(
          "Invalid allowed viewers list",
          "INVALID_VIEWERS",
        );
      }

      if (
        !Array.isArray(allowedViewerIds) ||
        allowedViewerIds.length > 500 ||
        !allowedViewerIds.every(
          (id) =>
            typeof id === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
        )
      ) {
        throw new BadRequestError(
          "Invalid allowed viewers list",
          "INVALID_VIEWERS",
        );
      }
    }

    if (visibility === "selected" && allowedViewerIds.length === 0) {
      throw new BadRequestError(
        "Select at least one viewer for this story",
        "VIEWERS_REQUIRED",
      );
    }

    if (visibility !== "selected" && allowedViewerIds.length > 0) {
      throw new BadRequestError(
        "Allowed viewers can only be used with selected visibility",
        "INVALID_VIEWERS",
      );
    }

    const caption = typeof req.body.caption === "string"
      ? req.body.caption.trim()
      : "";

    if (caption.length > 500) {
      throw new BadRequestError(
        "Story captions cannot exceed 500 characters",
        "CAPTION_TOO_LONG",
      );
    }

    const uploaded = await uploadFileToS3(file, { story: true });

    let story;

    try {
      story = await createStory(
        userId,
        {
          mediaKey: uploaded.key,
          mediaType: kind,
          mimeType: uploaded.mimetype,
          mediaSizeBytes: uploaded.size,
          durationSeconds,
          caption,
          visibility,
        },
        allowedViewerIds,
      );
    } catch (databaseError) {
      try {
        await deleteStoryMedia(uploaded.key);
      } catch (cleanupError) {
        console.error(
          "[Stories] Failed to clean up orphaned media:",
          uploaded.key,
          cleanupError.message,
        );
      }

      throw databaseError;
    }

    return success(res, story, 201);
  } catch (error) {
    return next(error);
  }
}

async function getStoryMedia(req, res, next) {
  try {
    const viewerId = req.user?.userId;
    const { storyId, highlightId } = req.params;

    if (
      !storyId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storyId)
    ) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Story not found" },
      });
    }

    if (
      highlightId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(highlightId)
    ) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Story not found" },
      });
    }

    const story = highlightId
      ? await highlightsRepository.getHighlightedStoryForViewer(highlightId, storyId, viewerId)
      : await getStoryForViewer(storyId, viewerId);

    if (!story) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Story not found" },
      });
    }

    const totalSize = Number(story.mediaSizeBytes);

    if (!Number.isSafeInteger(totalSize) || totalSize <= 0) {
      throw new AppError("Story media is unavailable.", 503, "MEDIA_UNAVAILABLE");
    }

    let range = null;
    let rangeStart = null;
    let rangeEnd = null;

    if (req.headers.range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);

      if (!match) {
        res.setHeader("Content-Range", `bytes */${totalSize}`);
        return res.status(416).end();
      }

      rangeStart = Number(match[1]);
      rangeEnd = match[2] ? Number(match[2]) : totalSize - 1;

      if (
        !Number.isSafeInteger(rangeStart) ||
        !Number.isSafeInteger(rangeEnd) ||
        rangeStart >= totalSize ||
        rangeEnd < rangeStart
      ) {
        res.setHeader("Content-Range", `bytes */${totalSize}`);
        return res.status(416).end();
      }

      rangeEnd = Math.min(rangeEnd, totalSize - 1);
      range = `bytes=${rangeStart}-${rangeEnd}`;
    }

    const media = await getFileFromS3(story.mediaKey, range);

    res.setHeader(
      "Content-Type",
      story.mimeType || media.contentType || "application/octet-stream",
    );
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (media.contentLength != null) {
      res.setHeader("Content-Length", media.contentLength);
    }

    if (range) {
      res.setHeader(
        "Content-Range",
        media.contentRange || `bytes ${rangeStart}-${rangeEnd}/${totalSize}`,
      );
      res.status(206);
    } else {
      res.status(200);
    }

    return media.stream.pipe(res);
  } catch (error) {
    if (
      error.name === "NoSuchKey" ||
      error.name === "NotFound" ||
      error.$metadata?.httpStatusCode === 404
    ) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Story not found" },
      });
    }

    if (error instanceof AppError) {
      return next(error);
    }

    console.error("[Stories] Media playback failed:", error.message);

    return next(
      new AppError(
        "Story media is temporarily unavailable.",
        503,
        "MEDIA_STORAGE_UNAVAILABLE",
      ),
    );
  }
}
async function listStories(req, res, next) {
  try {
    const userId = req.user?.userId;
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 50)
      : 50;

    const stories = await getStoriesForViewer(userId, limit);

    return success(res, stories);
  } catch (error) {
    return next(error);
  }
}
async function viewStory(req, res, next) {
  try {
    const userId = req.user?.userId;
    const storyId = req.params.storyId;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storyId)) {
      throw new BadRequestError("Invalid story ID", "INVALID_STORY_ID");
    }

    const view = await recordStoryView(storyId, userId);

    if (!view) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Story not found" },
      });
    }

    return success(res, view);
  } catch (error) {
    return next(error);
  }
}
async function deleteStoryHandler(req, res, next) {
  try {
    const userId = req.user?.userId;
    const storyId = req.params.storyId;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storyId)) {
      throw new BadRequestError("Invalid story ID", "INVALID_STORY_ID");
    }

    const deleted = await deleteStory(storyId, userId);

    if (!deleted) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Story not found" },
      });
    }


    return success(res, { deleted: true });
  } catch (error) {
    return next(error);
  }
}

async function createStoryReply(req, res, next) {
  try {
    const reply = await repliesService.createReply(
      req.params.storyId,
      req.user?.userId,
      req.body?.message,
    );

    return success(res, reply, 201);
  } catch (error) {
    return next(error);
  }
}

async function listStoryReplies(req, res, next) {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 50;

    const replies = await repliesService.listReplies(
      req.params.storyId,
      req.user?.userId,
      limit,
    );

    return success(res, replies);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadStory,
  listStories,
  createStoryReply,
  listStoryReplies,
  viewStory,
  deleteStoryHandler,
  getStoryMedia,
};







