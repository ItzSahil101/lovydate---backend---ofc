const { query } = require('../../infrastructure/database/pool');

async function insertReport(reporterUserId, reportedUserId, reason, details = null) {
  const res = await query(
    `INSERT INTO reports (reporter_user_id, reported_user_id, reason, details)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at AS "createdAt"`,
    [reporterUserId, reportedUserId, reason, details]
  );
  return res.rows[0];
}

module.exports = {
  insertReport,
};
