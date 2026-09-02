const rolesService = require('./adminRoles.service');

async function listRoles(req, res, next) {
  try {
    const result = await rolesService.listRoles();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getRoleDetail(req, res, next) {
  try {
    const { roleId } = req.params;
    const result = await rolesService.getRoleDetail(roleId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function createRole(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await rolesService.createRole(req.body, req.admin, ipAddress);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function updateRole(req, res, next) {
  try {
    const { roleId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await rolesService.updateRole(roleId, req.body, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listRoles,
  getRoleDetail,
  createRole,
  updateRole,
};
