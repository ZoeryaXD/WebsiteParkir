const { parkingSlots } = require('../data/dummyData');
const bookingController = require('./bookingController');

exports.checkGateAccess = (req, res) => {
  const { plateNumber } = req.body;
  const io = req.app.get('socketio');
  bookingController.expireExpiredBookings(io);

  if (typeof plateNumber !== 'string' || !plateNumber.trim()) {
    return res.status(400).json({
      success: false,
      message: 'plateNumber wajib diisi sebagai teks'
    });
  }

  const normalizedPlate = bookingController.normalizePlate(plateNumber);
  const bookedSlot = parkingSlots.find(
    slot => slot.category === 'BOOKING' && slot.bookedPlate && bookingController.normalizePlate(slot.bookedPlate) === normalizedPlate
  );

  // Kendaraan tetap masuk; plat yang tidak terdaftar harus mencetak karcis.
  const availableSlots = parkingSlots.filter(
    slot => slot.category === 'REGULAR' && slot.status === 'KOSONG' && !slot.currentPlate
  );

  if (bookedSlot) {
    bookingController.markBookingDetected(bookedSlot, 'GATE', io);
    return res.json({
      success: true,
      access: 'GRANTED',
      type: 'BOOKING',
      allocatedSlot: bookedSlot.id,
      bookingExpiresAt: bookedSlot.bookingExpiresAt,
      message: `Selamat datang! Silakan menuju Slot ${bookedSlot.id}`,
      gateOpen: true,
      printTicket: false,
      commands: { openGate: true, printTicket: false }
    });
  }

  return res.json({
    success: true,
    access: 'GRANTED',
    type: 'REGULAR_TICKET',
    allocatedSlot: availableSlots[0]?.id || null,
    message: 'Karcis fisik dicetak. Silakan masuk.',
    gateOpen: true,
    printTicket: true,
    commands: { openGate: true, printTicket: true }
  });
};