const interestsService = require('./interests.service');
const { success } = require('../../shared/response');

async function getInterests(req, res, next) {
  try {
    const interests = await interestsService.getInterests();
    return success(res, { interests });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getInterests,
};
