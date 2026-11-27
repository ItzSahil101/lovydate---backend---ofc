const {
  claimStoryMediaCleanup,
  markStoryMediaDeleted,
  recordStoryMediaCleanupFailure,
} = require("./stories.repository");

const { deleteStoryMedia } = require("../media/media.service");

function startStoryMediaCleanupWorker({ intervalMs = 60000, batchSize = 20 } = {}) {
  let stopped = false;
  let timer = null;
  let activeRun = null;

  async function processBatch() {
    const jobs = await claimStoryMediaCleanup(batchSize);

    for (const job of jobs) {
      try {
        await deleteStoryMedia(job.mediaKey);
        await markStoryMediaDeleted(job.id);

        console.log(`[stories-cleanup] Media deleted for story ${job.id}`);
      } catch (error) {
        console.error(
          `[stories-cleanup] Failed for story ${job.id}:`,
          error.message
        );

        try {
          await recordStoryMediaCleanupFailure(job.id, error);
        } catch (recordError) {
          console.error(
            `[stories-cleanup] Could not record retry for ${job.id}:`,
            recordError.message
          );
        }
      }
    }

    return jobs.length;
  }

  async function tick() {
    if (stopped) return;

    activeRun = processBatch();

    try {
      const count = await activeRun;

      if (count > 0) {
        console.log(`[stories-cleanup] Processed ${count} cleanup jobs`);
      }
    } catch (error) {
      console.error("[stories-cleanup] Batch failed:", error.message);
    } finally {
      activeRun = null;

      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
      }
    }
  }

  timer = setTimeout(tick, 0);

  return {
    async close() {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      if (activeRun) {
        await activeRun;
      }

      console.log("[stories-cleanup] Worker stopped");
    },
  };
}

module.exports = { startStoryMediaCleanupWorker };
