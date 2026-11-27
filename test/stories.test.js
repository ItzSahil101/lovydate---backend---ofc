const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");

const db = new PGlite();

const query = async (sql, params) => {
  const result = await db.query(sql, params);
  return {
    ...result,
    rowCount: result.affectedRows ?? result.rows.length,
  };
};

const stub = (relativePath, exports) => {
  const id = require.resolve(relativePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};

stub("../src/infrastructure/database/pool", {
  query,
  withTransaction: (fn) =>
    db.transaction((tx) =>
      fn({
        query: (sql, params) => tx.query(sql, params),
      }),
    ),
});

const storiesRepo = require("../src/modules/stories/stories.repository");
const reactionsRepo = require("../src/modules/stories/stories.reactions.repository");

const notificationCalls = [];
const pushCalls = [];

stub("../src/modules/notifications/notifications.repository", {
  createNotification: async (data) => {
    notificationCalls.push(data);
  },
});

stub("../src/infrastructure/firebase/fcm", {
  sendPushToUser: async (userId, data) => {
    pushCalls.push({ userId, data });
  },
});

const reactionsService = require("../src/modules/stories/stories.reactions.service");
const repliesService = require("../src/modules/stories/stories.replies.service");

const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const carol = "00000000-0000-4000-8000-000000000003";
const dave = "00000000-0000-4000-8000-000000000004";

const migration = (name) =>
  fs.readFileSync(path.join(__dirname, "../migrations", name), "utf8");

before(async () => {
  await db.exec(
    migration("001_initial_schema.sql").replace(/CREATE EXTENSION[^;]+;/g, ""),
  );

  for (const file of [
    "002_profile_details.sql",
    "006_privacy_settings.sql",
    "012_soft_unmatch.sql",
    "020_stories.sql",
    "021_story_media_cleanup.sql",
  ]) {
    await db.exec(migration(file).replace(/^\s*--.*$/gm, ""));
  }
});

after(async () => {
  await db.close();
});

beforeEach(async () => {
  notificationCalls.length = 0;
  pushCalls.length = 0;

  await db.exec("TRUNCATE users CASCADE");

  for (const [id, name] of [
    [alice, "Alice"],
    [bob, "Bob"],
    [carol, "Carol"],
    [dave, "Dave"],
  ]) {
    await query("INSERT INTO users (id, email) VALUES ($1, $2)", [
      id,
      `${name.toLowerCase()}@example.test`,
    ]);

    await query(
      `INSERT INTO profiles
        (user_id, display_name, date_of_birth, gender, onboarding_completed)
       VALUES ($1, $2, '2000-01-01', 'Woman', TRUE)`,
      [id, name],
    );
  }
});

test("Stories test database initializes successfully", async () => {
  const result = await query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('stories', 'story_reactions', 'story_views',
         'story_replies', 'story_highlights', 'story_privacy_settings')`,
  );

  assert.equal(result.rows.length, 6);
});

test("Pending stories are visible to their owner but hidden from other users", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/pending-test.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: "Test story",
    visibility: "everyone",
  });

  assert.ok(story.id);
  assert.equal(story.moderationStatus, "pending");

  const ownerView = await storiesRepo.getStoryForViewer(story.id, alice);
  assert.ok(ownerView);
  assert.equal(ownerView.userId, alice);

  const otherView = await storiesRepo.getStoryForViewer(story.id, bob);
  assert.equal(otherView, null);

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  const approvedView = await storiesRepo.getStoryForViewer(story.id, bob);
  assert.ok(approvedView);
  assert.equal(approvedView.moderationStatus, "approved");
});

test("Selected stories are visible only to approved selected viewers", async () => {
  const story = await storiesRepo.createStory(
    alice,
    {
      mediaKey: "stories/alice/selected-test.jpg",
      mediaType: "image",
      mimeType: "image/jpeg",
      mediaSizeBytes: 1024,
      durationSeconds: null,
      caption: "Private story",
      visibility: "selected",
    },
    [bob],
  );

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  assert.ok(await storiesRepo.getStoryForViewer(story.id, alice));
  assert.ok(await storiesRepo.getStoryForViewer(story.id, bob));
  assert.equal(await storiesRepo.getStoryForViewer(story.id, carol), null);
});

test("Creating a selected story rejects the owner as a selected viewer", async () => {
  await assert.rejects(
    () =>
      storiesRepo.createStory(
        alice,
        {
          mediaKey: "stories/alice/self-test.jpg",
          mediaType: "image",
          mimeType: "image/jpeg",
          mediaSizeBytes: 1024,
          durationSeconds: null,
          caption: null,
          visibility: "selected",
        },
        [alice],
      ),
    (error) => error.code === "INVALID_VIEWER",
  );
});

test("Blocked users cannot view each other stories in either direction", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/block-test.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: null,
    visibility: "everyone",
  });

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  await query(
    `INSERT INTO blocks (blocker_user_id, blocked_user_id)
     VALUES ($1, $2)`,
    [bob, alice],
  );

  assert.equal(await storiesRepo.getStoryForViewer(story.id, bob), null);

  await query(
    "DELETE FROM blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2",
    [bob, alice],
  );

  await query(
    `INSERT INTO blocks (blocker_user_id, blocked_user_id)
     VALUES ($1, $2)`,
    [alice, bob],
  );

  assert.equal(await storiesRepo.getStoryForViewer(story.id, bob), null);
});

test("Match-only stories become inaccessible after unmatching", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/match-test.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: "Match-only story",
    visibility: "matches",
  });

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  await query(
    `INSERT INTO matches (user_one_id, user_two_id)
     VALUES ($1, $2)`,
    [alice, bob],
  );

  assert.ok(await storiesRepo.getStoryForViewer(story.id, bob));

  await query(
    `UPDATE matches
     SET unmatched_at = NOW()
     WHERE user_one_id = $1 AND user_two_id = $2`,
    [alice, bob],
  );

  assert.equal(await storiesRepo.getStoryForViewer(story.id, bob), null);
  assert.ok(await storiesRepo.getStoryForViewer(story.id, alice));
});

test("Story views are recorded once per viewer and owners cannot view themselves", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/views-test.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: null,
    visibility: "everyone",
  });

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  const firstView = await storiesRepo.recordStoryView(story.id, bob);
  assert.ok(firstView);
  assert.equal(firstView.storyId, story.id);

  const secondView = await storiesRepo.recordStoryView(story.id, bob);
  assert.ok(secondView);

  const count = await query(
    "SELECT COUNT(*)::int AS count FROM story_views WHERE story_id = $1",
    [story.id],
  );
  assert.equal(count.rows[0].count, 1);

  const ownerView = await storiesRepo.recordStoryView(story.id, alice);
  assert.equal(ownerView, null);
});

test("Only the story owner can delete a story", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/delete-test.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: null,
    visibility: "everyone",
  });

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  const unauthorizedDelete = await storiesRepo.deleteStory(story.id, bob);
  assert.equal(unauthorizedDelete, null);

  assert.ok(await storiesRepo.getStoryForViewer(story.id, bob));

  const ownerDelete = await storiesRepo.deleteStory(story.id, alice);
  assert.ok(ownerDelete);
  assert.equal(ownerDelete.mediaKey, "stories/alice/delete-test.jpg");

  assert.equal(await storiesRepo.getStoryForViewer(story.id, alice), null);
  assert.equal(await storiesRepo.deleteStory(story.id, alice), null);
});

test("Expired stories are claimed for media cleanup only once after deletion", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/cleanup-test.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: null,
    visibility: "everyone",
  });

  await query(
    "UPDATE stories SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
    [story.id],
  );

  const claimed = await storiesRepo.claimStoryMediaCleanup();

  const cleanupItem = claimed.find((item) => item.id === story.id);
  assert.ok(cleanupItem);
  assert.equal(cleanupItem.mediaKey, "stories/alice/cleanup-test.jpg");
  assert.equal(cleanupItem.cleanupAttempts, 1);

  assert.equal(await storiesRepo.markStoryMediaDeleted(story.id), true);
  assert.equal(await storiesRepo.markStoryMediaDeleted(story.id), false);

  const nextClaim = await storiesRepo.claimStoryMediaCleanup();
  assert.equal(
    nextClaim.some((item) => item.id === story.id),
    false,
  );
});

test("Failed media cleanup records errors and allows retry after cooldown", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/retry-test.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: null,
    visibility: "everyone",
  });

  await query(
    "UPDATE stories SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
    [story.id],
  );

  const firstClaim = await storiesRepo.claimStoryMediaCleanup();
  assert.ok(firstClaim.some((item) => item.id === story.id));

  const failure = await storiesRepo.recordStoryMediaCleanupFailure(
    story.id,
    new Error("S3 temporarily unavailable"),
  );

  assert.equal(failure.cleanupAttempts, 1);

  const stored = await query(
    "SELECT cleanup_last_error FROM stories WHERE id = $1",
    [story.id],
  );
  assert.equal(stored.rows[0].cleanup_last_error, "S3 temporarily unavailable");

  const immediateClaim = await storiesRepo.claimStoryMediaCleanup();
  assert.equal(
    immediateClaim.some((item) => item.id === story.id),
    false,
  );

  await query(
    "UPDATE stories SET cleanup_next_attempt_at = NOW() - INTERVAL '1 second' WHERE id = $1",
    [story.id],
  );

  const retryClaim = await storiesRepo.claimStoryMediaCleanup();
  const retried = retryClaim.find((item) => item.id === story.id);

  assert.ok(retried);
  assert.equal(retried.cleanupAttempts, 2);
});

test("Story feed and media-key lookup respect visibility and moderation", async () => {
  const approved = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/feed-approved.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: "Approved story",
    visibility: "everyone",
  });

  const pending = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/feed-pending.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: "Pending story",
    visibility: "everyone",
  });

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [approved.id],
  );

  const byKey = await storiesRepo.getStoryByMediaKeyForViewer(
    "stories/alice/feed-approved.jpg",
    bob,
  );

  assert.ok(byKey);
  assert.equal(byKey.id, approved.id);

  assert.equal(
    await storiesRepo.getStoryByMediaKeyForViewer(
      "stories/alice/feed-pending.jpg",
      bob,
    ),
    null,
  );

  const feed = await storiesRepo.getStoriesForViewer(bob);
  assert.ok(feed.some((item) => item.id === approved.id));
  assert.equal(
    feed.some((item) => item.id === pending.id),
    false,
  );
});

test("Story reactions update an existing reaction instead of creating duplicates", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/reaction-update.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: "Reaction test",
    visibility: "everyone",
  });

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  const first = await reactionsRepo.setStoryReaction(story.id, bob, "like");
  const second = await reactionsRepo.setStoryReaction(story.id, bob, "love");

  assert.ok(first);
  assert.ok(second);
  assert.equal(second.reaction, "love");

  const stored = await query(
    "SELECT reaction FROM story_reactions WHERE story_id = $1 AND user_id = $2",
    [story.id, bob],
  );

  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0].reaction, "love");
});

test("Users who cannot view a selected story cannot react to it", async () => {
  const story = await storiesRepo.createStory(
    alice,
    {
      mediaKey: "stories/alice/reaction-private.jpg",
      mediaType: "image",
      mimeType: "image/jpeg",
      mediaSizeBytes: 1024,
      durationSeconds: null,
      caption: "Private reaction test",
      visibility: "selected",
    },
    [carol],
  );

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  const denied = await reactionsRepo.setStoryReaction(story.id, bob, "like");
  assert.equal(denied, null);

  const allowed = await reactionsRepo.setStoryReaction(story.id, carol, "love");
  assert.ok(allowed);
  assert.equal(allowed.reaction, "love");

  const stored = await query(
    "SELECT user_id FROM story_reactions WHERE story_id = $1",
    [story.id],
  );

  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0].user_id, carol);
});

test("Removing a story reaction deletes only the requesting user reaction", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/reaction-remove.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: "Reaction removal test",
    visibility: "everyone",
  });

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  await reactionsRepo.setStoryReaction(story.id, bob, "like");
  await reactionsRepo.setStoryReaction(story.id, carol, "love");

  const removed = await reactionsRepo.removeStoryReaction(story.id, bob);
  assert.ok(removed);
  assert.equal(removed.userId, bob);

  const remaining = await query(
    "SELECT user_id, reaction FROM story_reactions WHERE story_id = $1",
    [story.id],
  );

  assert.equal(remaining.rows.length, 1);
  assert.equal(remaining.rows[0].user_id, carol);
  assert.equal(remaining.rows[0].reaction, "love");
});

test("Expired or deleted stories do not allow reaction removal", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/reaction-expired.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: "Expired reaction test",
    visibility: "everyone",
  });

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  await reactionsRepo.setStoryReaction(story.id, bob, "like");

  await query(
    "UPDATE stories SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
    [story.id],
  );

  const expiredResult = await reactionsRepo.removeStoryReaction(story.id, bob);
  assert.equal(expiredResult, null);

  await query(
    "UPDATE stories SET expires_at = NOW() + INTERVAL '1 hour', deleted_at = NOW() WHERE id = $1",
    [story.id],
  );

  const deletedResult = await reactionsRepo.removeStoryReaction(story.id, bob);
  assert.equal(deletedResult, null);
});

test("Blocked users cannot remove reactions through an inaccessible story", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/blocked-remove.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: "Blocked removal test",
    visibility: "everyone",
  });

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  await reactionsRepo.setStoryReaction(story.id, bob, "like");

  await query(
    "INSERT INTO blocks (blocker_user_id, blocked_user_id) VALUES ($1, $2)",
    [alice, bob],
  );

  const result = await reactionsService.removeReaction(story.id, bob);
  assert.equal(result, null);

  const stored = await query(
    "SELECT reaction FROM story_reactions WHERE story_id = $1 AND user_id = $2",
    [story.id, bob],
  );

  assert.equal(stored.rows.length, 1);
});

test("Removed selected viewers cannot remove reactions through an inaccessible story", async () => {
  const story = await storiesRepo.createStory(
    alice,
    {
      mediaKey: "stories/alice/removed-viewer.jpg",
      mediaType: "image",
      mimeType: "image/jpeg",
      mediaSizeBytes: 1024,
      durationSeconds: null,
      caption: "Removed viewer test",
      visibility: "selected",
    },
    [bob],
  );

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  await reactionsRepo.setStoryReaction(story.id, bob, "love");

  await query(
    "DELETE FROM story_allowed_viewers WHERE story_id = $1 AND viewer_user_id = $2",
    [story.id, bob],
  );

  const result = await reactionsService.removeReaction(story.id, bob);
  assert.equal(result, null);

  const stored = await query(
    "SELECT reaction FROM story_reactions WHERE story_id = $1 AND user_id = $2",
    [story.id, bob],
  );

  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0].reaction, "love");
});

test("Story replies can only be created by viewers who can access the story", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/reply-access.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: "Reply access test",
    visibility: "everyone",
  });

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  const reply = await storiesRepo.createStoryReply(
    story.id,
    bob,
    "Nice story!",
  );

  assert.ok(reply);
  assert.equal(reply.senderId, bob);
  assert.equal(reply.message, "Nice story!");

  const ownerReply = await storiesRepo.createStoryReply(
    story.id,
    alice,
    "My own story",
  );

  assert.equal(ownerReply, null);

  await query(
    "INSERT INTO blocks (blocker_user_id, blocked_user_id) VALUES ($1, $2)",
    [alice, carol],
  );

  const blockedReply = await storiesRepo.createStoryReply(
    story.id,
    carol,
    "Blocked reply",
  );

  assert.equal(blockedReply, null);
});

test("Only the story owner and reply sender can retrieve story replies", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/reply-privacy.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: "Reply privacy test",
    visibility: "everyone",
  });

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  const reply = await storiesRepo.createStoryReply(
    story.id,
    bob,
    "Private reply",
  );

  assert.ok(reply);

  const ownerReplies = await storiesRepo.getStoryReplies(story.id, alice);
  const senderReplies = await storiesRepo.getStoryReplies(story.id, bob);
  const unrelatedReplies = await storiesRepo.getStoryReplies(story.id, carol);

  assert.equal(ownerReplies.length, 1);
  assert.equal(ownerReplies[0].message, "Private reply");

  assert.equal(senderReplies.length, 1);
  assert.equal(senderReplies[0].senderId, bob);

  assert.equal(unrelatedReplies.length, 0);
});


test('Story replies validate messages and notify the story owner', async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: 'stories/alice/reply-notification.jpg',
    mediaType: 'image',
    mimeType: 'image/jpeg',
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: 'Reply notification test',
    visibility: 'everyone',
  });

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id]
  );

  await assert.rejects(
    repliesService.createReply(story.id, bob, '   '),
    { code: 'MESSAGE_REQUIRED' }
  );

  await assert.rejects(
    repliesService.createReply(story.id, bob, 'x'.repeat(501)),
    { code: 'MESSAGE_TOO_LONG' }
  );

  const reply = await repliesService.createReply(
    story.id,
    bob,
    '  Hello Alice!  '
  );

  assert.ok(reply);
  assert.equal(reply.message, 'Hello Alice!');

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(notificationCalls.length, 1);
  assert.equal(notificationCalls[0].recipientId, alice);
  assert.equal(notificationCalls[0].senderId, bob);
  assert.equal(notificationCalls[0].type, 'story_reply');
  assert.equal(notificationCalls[0].metadata.replyId, reply.id);

  assert.equal(pushCalls.length, 1);
  assert.equal(pushCalls[0].userId, alice);
  assert.equal(pushCalls[0].data.data.type, 'story_reply');
});

test('Story reply service rejects inaccessible stories and invalid IDs', async () => {
  await assert.rejects(
    repliesService.createReply('invalid-id', bob, 'Hello'),
    { code: 'INVALID_STORY_ID' }
  );

  const story = await storiesRepo.createStory(
    alice,
    {
      mediaKey: 'stories/alice/reply-selected.jpg',
      mediaType: 'image',
      mimeType: 'image/jpeg',
      mediaSizeBytes: 1024,
      durationSeconds: null,
      caption: 'Selected reply test',
      visibility: 'selected',
    },
    [carol]
  );

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id]
  );

  await assert.rejects(
    repliesService.createReply(story.id, bob, 'Not allowed'),
    { code: 'STORY_UNAVAILABLE' }
  );

  await assert.rejects(
    repliesService.listReplies(story.id, bob),
    { code: 'STORY_UNAVAILABLE' }
  );

  assert.equal(notificationCalls.length, 0);
  assert.equal(pushCalls.length, 0);
});
test("Story reply moderation visibility is restricted to the sender until approved", async () => {
  const story = await storiesRepo.createStory(alice, {
    mediaKey: "stories/alice/reply-moderation.jpg",
    mediaType: "image",
    mimeType: "image/jpeg",
    mediaSizeBytes: 1024,
    durationSeconds: null,
    caption: "Reply moderation test",
    visibility: "everyone",
  });

  await query(
    "UPDATE stories SET moderation_status = 'approved' WHERE id = $1",
    [story.id],
  );

  const reply = await storiesRepo.createStoryReply(
    story.id,
    bob,
    "Moderation visibility test",
  );

  assert.ok(reply);

  await query(
    "UPDATE story_replies SET moderation_status = 'pending' WHERE id = $1",
    [reply.id],
  );

  assert.equal((await storiesRepo.getStoryReplies(story.id, alice)).length, 0);
  assert.equal((await storiesRepo.getStoryReplies(story.id, bob)).length, 1);

  await query(
    "UPDATE story_replies SET moderation_status = 'rejected' WHERE id = $1",
    [reply.id],
  );

  assert.equal((await storiesRepo.getStoryReplies(story.id, alice)).length, 0);
  assert.equal((await storiesRepo.getStoryReplies(story.id, bob)).length, 1);

  await query(
    "UPDATE story_replies SET moderation_status = 'approved' WHERE id = $1",
    [reply.id],
  );

  assert.equal((await storiesRepo.getStoryReplies(story.id, alice)).length, 1);
});
