const bootstrapService = require('./bootstrap.service');
const { success } = require('../../shared/response');

async function getBootstrap(req, res, next) {
  try {
    const data = await bootstrapService.getBootstrap(req.user.userId);
    return success(res, data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBootstrap,
};
