const service = require('./compatibility.service');
const { success } = require('../../shared/response');

async function getQuestions(req, res, next) {
  try {
    return success(res, { questions: await service.getQuestions() });
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    return success(res, await service.getMyAnswers(req.user.userId));
  } catch (err) {
    next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    const result = await service.saveMyAnswers(req.user.userId, req.body.answers);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function getCompatibility(req, res, next) {
  try {
    const result = await service.getCompatibility(req.user.userId, req.params.userId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getQuestions,
  getMe,
  updateMe,
  getCompatibility,
};
