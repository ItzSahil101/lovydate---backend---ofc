const express = require('express');
const controller = require('./support.controller');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.post('/tickets', controller.createPublicTicket);
router.get('/tickets/:ticketId', controller.getPublicTicket);
router.post('/tickets/:ticketId/messages', controller.sendCustomerMessage);
router.get('/tickets/by-email/:email', requireAuth, controller.getTicketsByEmail);

module.exports = router;
