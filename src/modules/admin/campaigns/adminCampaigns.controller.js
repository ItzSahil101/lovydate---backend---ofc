const campaignsService = require('./adminCampaigns.service');

async function listCampaigns(req, res, next) {
  try {
    const result = await campaignsService.listCampaigns(req.query);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getCampaignDetail(req, res, next) {
  try {
    const { campaignId } = req.params;
    const result = await campaignsService.getCampaignDetail(campaignId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function createCampaign(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await campaignsService.createCampaign(req.body, req.admin, ipAddress);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function updateCampaign(req, res, next) {
  try {
    const { campaignId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await campaignsService.updateCampaign(campaignId, req.body, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function deleteCampaign(req, res, next) {
  try {
    const { campaignId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await campaignsService.deleteCampaign(campaignId, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function estimateAudience(req, res, next) {
  try {
    const { campaignId } = req.params;
    const result = await campaignsService.estimateAudience(campaignId, req.body.filters);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function testSend(req, res, next) {
  try {
    const { campaignId } = req.params;
    const { testEmail } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await campaignsService.testSend({ campaignId, testEmail, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function sendCampaign(req, res, next) {
  try {
    const { campaignId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await campaignsService.sendCampaign({ campaignId, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function scheduleCampaign(req, res, next) {
  try {
    const { campaignId } = req.params;
    const { scheduledAt } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await campaignsService.scheduleCampaign({ campaignId, scheduledAt, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function cancelCampaign(req, res, next) {
  try {
    const { campaignId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await campaignsService.cancelCampaign({ campaignId, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getMetrics(req, res, next) {
  try {
    const { campaignId } = req.params;
    const result = await campaignsService.getMetrics(campaignId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCampaigns,
  getCampaignDetail,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  estimateAudience,
  testSend,
  sendCampaign,
  scheduleCampaign,
  cancelCampaign,
  getMetrics,
};
