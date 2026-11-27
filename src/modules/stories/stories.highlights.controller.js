const highlightsRepository = require("./stories.highlights.repository");
const { success } = require("../../shared/response");
const { BadRequestError } = require("../../shared/errors");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateUuid(value, label) {
  if (typeof value !== "string" || !UUID_REGEX.test(value)) {
    throw new BadRequestError(`Invalid ${label}`, "INVALID_ID");
  }
}

async function createHighlight(req, res, next) {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";

    if (!title || title.length > 40) {
      throw new BadRequestError("Highlight title must be 1–40 characters", "INVALID_TITLE");
    }

    const result = await highlightsRepository.createHighlight(req.user.userId, title);
    return success(res, result, 201);
  } catch (error) {
    return next(error);
  }
}

async function listUserHighlights(req, res, next) {
  try {
    validateUuid(req.params.userId, "user ID");
    const result = await highlightsRepository.listHighlightsForViewer(
      req.params.userId,
      req.user.userId
    );
    return success(res, result);
  } catch (error) {
    return next(error);
  }
}

async function getHighlight(req, res, next) {
  try {
    validateUuid(req.params.highlightId, "highlight ID");
    const result = await highlightsRepository.getHighlightForViewer(
      req.params.highlightId,
      req.user.userId
    );

    if (!result) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Highlight not found" },
      });
    }

    return success(res, result);
  } catch (error) {
    return next(error);
  }
}

async function addStory(req, res, next) {
  try {
    validateUuid(req.params.highlightId, "highlight ID");
    validateUuid(req.body?.storyId, "story ID");

    const result = await highlightsRepository.addStoryToHighlight(
      req.user.userId,
      req.params.highlightId,
      req.body.storyId
    );

    if (!result) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Highlight or eligible story not found" },
      });
    }

    return success(res, result, result.alreadyAdded ? 200 : 201);
  } catch (error) {
    return next(error);
  }
}

async function removeStory(req, res, next) {
  try {
    validateUuid(req.params.highlightId, "highlight ID");
    validateUuid(req.params.storyId, "story ID");

    const removed = await highlightsRepository.removeStoryFromHighlight(
      req.user.userId,
      req.params.highlightId,
      req.params.storyId
    );

    if (!removed) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Highlight story not found" },
      });
    }

    return success(res, { removed: true });
  } catch (error) {
    return next(error);
  }
}

async function updateTitle(req, res, next) {
  try {
    validateUuid(req.params.highlightId, "highlight ID");
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";

    if (!title || title.length > 40) {
      throw new BadRequestError("Highlight title must be 1–40 characters", "INVALID_TITLE");
    }

    const result = await highlightsRepository.updateHighlightTitle(
      req.user.userId,
      req.params.highlightId,
      title
    );

    if (!result) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Highlight not found" },
      });
    }

    return success(res, result);
  } catch (error) {
    return next(error);
  }
}

async function setCover(req, res, next) {
  try {
    validateUuid(req.params.highlightId, "highlight ID");
    validateUuid(req.body?.storyId, "story ID");

    const result = await highlightsRepository.setHighlightCover(
      req.user.userId,
      req.params.highlightId,
      req.body.storyId
    );

    if (!result) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Highlight or story not found" },
      });
    }

    return success(res, result);
  } catch (error) {
    return next(error);
  }
}

async function reorderStories(req, res, next) {
  try {
    validateUuid(req.params.highlightId, "highlight ID");

    const storyIds = req.body?.storyIds;
    if (
      !Array.isArray(storyIds) ||
      storyIds.length < 1 ||
      storyIds.length > 100
    ) {
      throw new BadRequestError("storyIds must contain 1–100 story IDs", "INVALID_STORY_ORDER");
    }

    storyIds.forEach((id) => validateUuid(id, "story ID"));

    if (new Set(storyIds).size !== storyIds.length) {
      throw new BadRequestError("Duplicate story IDs are not allowed", "DUPLICATE_STORY_ID");
    }

    const result = await highlightsRepository.reorderHighlightStories(
      req.user.userId,
      req.params.highlightId,
      storyIds
    );

    if (!result) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Highlight not found" },
      });
    }

    if (result.invalidMembership) {
      throw new BadRequestError(
        "Provide every story in this highlight exactly once",
        "INVALID_STORY_ORDER"
      );
    }

    return success(res, result);
  } catch (error) {
    return next(error);
  }
}
async function deleteHighlight(req, res, next) {
  try {
    validateUuid(req.params.highlightId, "highlight ID");

    const deleted = await highlightsRepository.deleteHighlight(
      req.user.userId,
      req.params.highlightId
    );

    if (!deleted) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Highlight not found" },
      });
    }

    return success(res, { deleted: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createHighlight,
  listUserHighlights,
  getHighlight,
  addStory,
  removeStory,
  updateTitle,
  setCover,
  reorderStories,
  deleteHighlight,
};


