const { parkingSlots, saveDatabase } = require('../data/parkingDatabase');
const bookingController = require('./bookingController');
const ticketController = require('./ticketController');

exports.checkGateAccess = async (req, res) => {
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
    slot => slot.category === 'REGULAR' && slot.status === 'KOSONG' && !slot.currentPlate && !slot.activeTicketId
  );

  if (bookedSlot) {
    const bookingTicket = ticketController.getTicketByBookingId(bookedSlot.bookingId);
    if (!bookingTicket || bookingTicket.status !== 'ACTIVE') {
      return res.status(409).json({ success: false, message: 'Tiket booking tidak aktif.' });
    }

    bookingController.markBookingDetected(bookedSlot, 'GATE', io);
    bookedSlot.status = 'TERISI';
    bookedSlot.currentPlate = bookedSlot.bookedPlate;
    bookedSlot.entryTime = new Date();
    saveDatabase();
    io.emit('SLOT_UPDATE', parkingSlots);
    return res.json({
      success: true,
      access: 'GRANTED',
      type: 'BOOKING',
      allocatedSlot: bookedSlot.id,
      bookingExpiresAt: bookedSlot.bookingExpiresAt,
      ticket: await ticketController.createTicketPresentation(bookingTicket),
      message: `Selamat datang! Silakan menuju Slot ${bookedSlot.id}`,
      gateOpen: true,
      printTicket: false,
      commands: { openGate: true, printTicket: false }
    });
  }

  const allocatedSlot = availableSlots[0];
  if (!allocatedSlot) {
    return res.status(409).json({
      success: false,
      access: 'DENIED',
      message: 'Tidak ada slot reguler yang tersedia.',
      gateOpen: false,
      printTicket: false,
      commands: { openGate: false, printTicket: false }
    });
  }

  const ticket = ticketController.createTicket({
    type: 'REGULAR',
    slot: allocatedSlot,
    plateNumber: plateNumber.trim().toUpperCase()
  });
  allocatedSlot.status = 'TERISI';
  allocatedSlot.currentPlate = ticket.plateNumber;
  allocatedSlot.entryTime = new Date(ticket.printedAt);
  const ticketPresentation = await ticketController.createTicketPresentation(ticket);
  saveDatabase();
  io.emit('SLOT_UPDATE', parkingSlots);

  return res.json({
    success: true,
    access: 'GRANTED',
    type: 'REGULAR_TICKET',
    allocatedSlot: allocatedSlot.id,
    ticket: ticketPresentation,
    message: 'Karcis fisik dicetak. Silakan masuk.',
    gateOpen: true,
    printTicket: true,
    commands: { openGate: true, printTicket: true }
  });
};