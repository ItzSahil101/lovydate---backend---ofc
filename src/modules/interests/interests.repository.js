const { query } = require('../../infrastructure/database/pool');

async function getAllInterests() {
  const res = await query(
    'SELECT id, name, category, icon_name AS "iconName" FROM interests ORDER BY category, id'
  );
  return res.rows;
}

module.exports = {
  getAllInterests,
};
