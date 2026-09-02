const restrictionsService = require('./adminRestrictions.service');

async function listRestrictions(req, res, next) {
  try {
    const result = await restrictionsService.listRestrictions(req.query);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listRestrictions,
};
