const usersService = require('./adminUsers.service');

async function listUsers(req, res, next) {
  try {
    const result = await usersService.listUsers(req.query);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getUserDetail(req, res, next) {
  try {
    const { userId } = req.params;
    const result = await usersService.getUserDetail(userId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getUserActivity(req, res, next) {
  try {
    const { userId } = req.params;
    const result = await usersService.getUserActivity(userId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getUserModeration(req, res, next) {
  try {
    const { userId } = req.params;
    const result = await usersService.getUserModeration(userId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function warnUser(req, res, next) {
  try {
    const { userId } = req.params;
    const { reason, message } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await usersService.warnUser({ userId, reason, message, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function suspendUser(req, res, next) {
  try {
    const { userId } = req.params;
    const { reason, internalNote, durationDays } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await usersService.suspendUser({ userId, reason, internalNote, durationDays, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function unsuspendUser(req, res, next) {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await usersService.unsuspendUser({ userId, reason, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function addRestriction(req, res, next) {
  try {
    const { userId } = req.params;
    const { restrictionType, reason, internalNote, durationDays } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await usersService.addRestriction({ userId, restrictionType, reason, internalNote, durationDays, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function removeRestriction(req, res, next) {
  try {
    const { userId, restrictionId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await usersService.removeRestriction({ userId, restrictionId, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function logoutAllSessions(req, res, next) {
  try {
    const { userId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await usersService.logoutAllSessions({ userId, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function deactivateUser(req, res, next) {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await usersService.deactivateUser({ userId, reason, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function addNote(req, res, next) {
  try {
    const { userId } = req.params;
    const { note } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await usersService.addNote({ userId, note, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers,
  getUserDetail,
  getUserActivity,
  getUserModeration,
  warnUser,
  suspendUser,
  unsuspendUser,
  addRestriction,
  removeRestriction,
  logoutAllSessions,
  deactivateUser,
  addNote,
};
