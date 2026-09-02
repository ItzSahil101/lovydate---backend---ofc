const restrictionsRepo = require('./adminRestrictions.repository');

async function listRestrictions(params) {
  return restrictionsRepo.listRestrictions(params);
}

module.exports = {
  listRestrictions,
};
