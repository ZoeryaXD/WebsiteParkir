const express = require('express');
const router = express.Router();
const gateController = require('../controllers/gateController');
const slotController = require('../controllers/slotController');
const bookingController = require('../controllers/bookingController');
const ticketController = require('../controllers/ticketController');
const { parkingSlots, transactionLogs, alarmLogs } = require('../data/parkingDatabase');

router.get('/slots', (req, res) => res.json({ success: true, data: parkingSlots }));
router.get('/transactions', (req, res) => res.json({ success: true, data: transactionLogs }));
router.get('/alarms', (req, res) => res.json({ success: true, data: alarmLogs }));
router.get('/tickets/:ticketId/qr.png', ticketController.getTicketQrImage);
router.get('/tickets/:ticketId', async (req, res) => {
  const ticket = ticketController.getTicket(req.params.ticketId);
  if (!ticket) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });
  return res.json({ success: true, ticket: await ticketController.createTicketPresentation(ticket) });
});
router.post('/tickets/scan', ticketController.scanTicket);
router.get('/bookings/slots', bookingController.getBookingSlots);
router.post('/bookings', bookingController.createBooking);
router.post('/gate-entry', gateController.checkGateAccess);
router.post('/gate/check', gateController.checkGateAccess);
router.post('/slot/ir', slotController.updateIRSensor);
router.post('/verify-slot', slotController.verifyConveyorCam);
router.post('/slot/conveyor', slotController.verifyConveyorCam);

module.exports = router;