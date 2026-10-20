const express = require('express');
const router = express.Router();
const gateController = require('../controllers/gateController');
const slotController = require('../controllers/slotController');
const bookingController = require('../controllers/bookingController');
const { parkingSlots } = require('../data/dummyData');

router.get('/slots', (req, res) => res.json({ success: true, data: parkingSlots }));
router.get('/bookings/slots', bookingController.getBookingSlots);
router.post('/bookings', bookingController.createBooking);
router.post('/gate-entry', gateController.checkGateAccess);
router.post('/gate/check', gateController.checkGateAccess);
router.post('/slot/ir', slotController.updateIRSensor);
router.post('/verify-slot', slotController.verifyConveyorCam);
router.post('/slot/conveyor', slotController.verifyConveyorCam);

module.exports = router;