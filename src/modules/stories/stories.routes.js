const express = require("express");
const multer = require("multer");

const router = express.Router();
const { requireAuth } = require("../../middleware/auth");
const { rateLimiter } = require("../../middleware/rateLimiter");
const { requireNoRestriction } = require("../../middleware/restrictions");
const { BadRequestError } = require("../../shared/errors");
const storiesController = require("./stories.controller");
const reactionsController = require("./stories.reactions.controller");
const repliesController = require("./stories.replies.controller");
const highlightsController = require("./stories.highlights.controller");

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "video/mp4",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (allowedTypes.has((file.mimetype || "").toLowerCase())) {
      return cb(null, true);
    }

    return cb(
      new BadRequestError(
        "Stories support JPEG, PNG, WEBP, GIF, TIFF and MP4",
        "INVALID_FILE_TYPE",
      ),
      false,
    );
  },
});

router.use(requireAuth);

// Story Highlights
router.post("/highlights", rateLimiter({ action: "highlight-create", max: 10, windowSeconds: 60, failClosed: true }), highlightsController.createHighlight);
router.get("/users/:userId/highlights", rateLimiter({ action: "highlight-list", max: 60, windowSeconds: 60, failClosed: true }), highlightsController.listUserHighlights);
router.get("/highlights/:highlightId/stories/:storyId/media", rateLimiter({ action: "highlight-media", max: 60, windowSeconds: 60, failClosed: true }), storiesController.getStoryMedia);
router.get("/highlights/:highlightId", rateLimiter({ action: "highlight-detail", max: 60, windowSeconds: 60, failClosed: true }), highlightsController.getHighlight);
router.post("/highlights/:highlightId/stories", rateLimiter({ action: "highlight-add-story", max: 30, windowSeconds: 60, failClosed: true }), highlightsController.addStory);
router.delete("/highlights/:highlightId/stories/:storyId", rateLimiter({ action: "highlight-remove-story", max: 30, windowSeconds: 60, failClosed: true }), highlightsController.removeStory);
router.patch("/highlights/:highlightId/cover", rateLimiter({ action: "highlight-cover", max: 20, windowSeconds: 60, failClosed: true }), highlightsController.setCover);
router.patch("/highlights/:highlightId/stories/order", rateLimiter({ action: "highlight-reorder", max: 20, windowSeconds: 60, failClosed: true }), highlightsController.reorderStories);

router.patch("/highlights/:highlightId", rateLimiter({ action: "highlight-update", max: 20, windowSeconds: 60, failClosed: true }), highlightsController.updateTitle);
router.delete("/highlights/:highlightId", rateLimiter({ action: "highlight-delete", max: 10, windowSeconds: 60, failClosed: true }), highlightsController.deleteHighlight);
router.post(
  "/:storyId/reaction",
  rateLimiter({ action: "story-reaction", max: 30, windowSeconds: 60, failClosed: true }),
  reactionsController.setStoryReaction,
);
router.delete(
  "/:storyId/reaction",
  rateLimiter({ action: "story-reaction-remove", max: 30, windowSeconds: 60, failClosed: true }),
  reactionsController.removeStoryReaction,
);

router.get("/", rateLimiter({ action: "story-list", max: 60, windowSeconds: 60, failClosed: true }), storiesController.listStories);
router.post("/:storyId/view", rateLimiter({ action: "story-view", max: 60, windowSeconds: 60, failClosed: true }), storiesController.viewStory);
router.delete("/:storyId", rateLimiter({ action: "story-delete", max: 10, windowSeconds: 60, failClosed: true }), storiesController.deleteStoryHandler);
router.get("/:storyId/media", rateLimiter({ action: "story-media", max: 30, windowSeconds: 60, failClosed: true }), storiesController.getStoryMedia);

router.get(
  "/:storyId/replies",
  rateLimiter({ action: "story-replies-list", max: 60, windowSeconds: 60, failClosed: true }),
  repliesController.listStoryReplies,
);

router.post(
  "/:storyId/replies",
  requireNoRestriction("STORY_REPLY_DISABLED"),
  rateLimiter({ action: "story-reply-create", max: 15, windowSeconds: 60, failClosed: true }),
  repliesController.createStoryReply,
);

router.post(
  "/upload",
  requireNoRestriction("STORY_POSTING_DISABLED"),
  rateLimiter({
    action: "story-upload",
    max: 10,
    windowSeconds: 60,
    failClosed: true,
  }),
  upload.single("file"),
  storiesController.uploadStory,
);

module.exports = router;












