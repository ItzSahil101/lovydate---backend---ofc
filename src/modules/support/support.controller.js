const supportService = require('./support.service');

async function createPublicTicket(req, res, next) {
  try {
    const result = await supportService.createPublicTicket(req.body);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getPublicTicket(req, res, next) {
  try {
    const { ticketId } = req.params;
    const result = await supportService.getPublicTicket(ticketId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function sendCustomerMessage(req, res, next) {
  try {
    const { ticketId } = req.params;
    const result = await supportService.sendCustomerMessage(ticketId, req.body);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getTicketsByEmail(req, res, next) {
  try {
    const { email } = req.params;
    const result = await supportService.getTicketsByEmail(email);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createPublicTicket,
  getPublicTicket,
  sendCustomerMessage,
  getTicketsByEmail,
};
