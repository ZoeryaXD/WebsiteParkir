const { randomUUID } = require('node:crypto');
const { parkingSlots, saveDatabase } = require('../data/parkingDatabase');
const ticketController = require('./ticketController');

const BOOKING_TTL_MS = 60 * 60 * 1000;
const expirationTimers = new Map();

const normalizePlate = plate => plate.replace(/[^a-z0-9]/gi, '').toUpperCase();

function clearBooking(slot) {
  slot.bookedPlate = null;
  slot.bookingId = null;
  slot.bookingCreatedAt = null;
  slot.bookingExpiresAt = null;
  slot.bookingDetectedAt = null;
  slot.bookingStatus = null;
}

function releaseBooking(slot) {
  if (slot.bookingId) {
    clearTimeout(expirationTimers.get(slot.bookingId));
    expirationTimers.delete(slot.bookingId);
  }

  clearBooking(slot);
  slot.activeTicketId = null;
}

function expireBooking(slotId, bookingId, io) {
  const slot = parkingSlots.find(item => item.id === slotId);
  if (!slot || slot.bookingId !== bookingId || slot.bookingDetectedAt) return false;
  if (Date.parse(slot.bookingExpiresAt) > Date.now()) return false;

  const ticket = require('./ticketController').getTicketByBookingId(bookingId);
  if (ticket && ticket.status === 'ACTIVE') ticket.status = 'EXPIRED';
  releaseBooking(slot);
  saveDatabase();
  io?.emit('SLOT_UPDATE', parkingSlots);
  return true;
}

function scheduleBookingExpiration(slot, io) {
  const bookingId = slot.bookingId;
  const delay = Math.max(0, Date.parse(slot.bookingExpiresAt) - Date.now());
  const timer = setTimeout(() => expireBooking(slot.id, bookingId, io), delay);
  timer.unref();
  expirationTimers.set(bookingId, timer);
}

function expireExpiredBookings(io) {
  parkingSlots.forEach(slot => {
    if (slot.bookingId && slot.bookingExpiresAt && !slot.bookingDetectedAt) {
      expireBooking(slot.id, slot.bookingId, io);
    }
  });
}

function restoreBookingExpirationTimers(io) {
  expireExpiredBookings(io);
  let restoredTicket = false;
  parkingSlots.forEach(slot => {
    if (slot.bookingId && !ticketController.getTicketByBookingId(slot.bookingId)) {
      ticketController.createTicket({
        type: 'BOOKING',
        slot,
        plateNumber: slot.bookedPlate,
        bookingId: slot.bookingId,
        printedAt: slot.bookingCreatedAt || new Date().toISOString()
      });
      restoredTicket = true;
    }

    if (slot.bookingId && slot.bookingExpiresAt && !slot.bookingDetectedAt) {
      scheduleBookingExpiration(slot, io);
    }
  });
  if (restoredTicket) saveDatabase();
}

function markBookingDetected(slot, source, io) {
  if (!slot.bookingId || slot.bookingDetectedAt) return false;

  slot.bookingDetectedAt = new Date().toISOString();
  slot.bookingStatus = `DETECTED_${source}`;
  clearTimeout(expirationTimers.get(slot.bookingId));
  expirationTimers.delete(slot.bookingId);
  saveDatabase();
  io?.emit('SLOT_UPDATE', parkingSlots);
  return true;
}

exports.normalizePlate = normalizePlate;
exports.expireExpiredBookings = expireExpiredBookings;
exports.restoreBookingExpirationTimers = restoreBookingExpirationTimers;
exports.markBookingDetected = markBookingDetected;
exports.releaseBooking = releaseBooking;

exports.getBookingSlots = (req, res) => {
  expireExpiredBookings(req.app.get('socketio'));

  const data = parkingSlots
    .filter(slot => slot.category === 'BOOKING')
    .map(slot => ({
      id: slot.id,
      available: slot.status === 'KOSONG' && !slot.bookedPlate && !slot.currentPlate && !slot.activeTicketId,
      detected: Boolean(slot.bookingDetectedAt),
      expiresAt: slot.bookingExpiresAt
    }));

  res.json({ success: true, data });
};

exports.createBooking = async (req, res) => {
  const io = req.app.get('socketio');
  expireExpiredBookings(io);

  const { slotId, plateNumber } = req.body;
  if (typeof plateNumber !== 'string') {
    return res.status(400).json({ success: false, message: 'Plat nomor wajib diisi.' });
  }

  const formattedPlate = plateNumber.trim().replace(/\s+/g, ' ').toUpperCase();
  if (formattedPlate.length < 4 || formattedPlate.length > 20 || !/^[A-Z0-9 -]+$/.test(formattedPlate)) {
    return res.status(400).json({ success: false, message: 'Format plat nomor tidak valid.' });
  }

  const slot = parkingSlots.find(item => item.id === slotId && item.category === 'BOOKING');
  if (!slot) {
    return res.status(404).json({ success: false, message: 'Slot booking tidak ditemukan.' });
  }

  if (slot.status !== 'KOSONG' || slot.bookedPlate || slot.currentPlate) {
    return res.status(409).json({ success: false, message: 'Slot tersebut sudah tidak tersedia.' });
  }

  const normalizedPlate = normalizePlate(formattedPlate);
  const plateAlreadyBooked = parkingSlots.some(item =>
    item.bookedPlate && normalizePlate(item.bookedPlate) === normalizedPlate
  );
  const plateAlreadyParked = parkingSlots.some(item =>
    item.currentPlate && normalizePlate(item.currentPlate) === normalizedPlate
  );
  if (plateAlreadyBooked || plateAlreadyParked) {
    return res.status(409).json({ success: false, message: 'Plat nomor sudah memiliki booking atau terdeteksi parkir.' });
  }

  const now = Date.now();
  const bookingId = randomUUID();
  const printedAt = new Date(now).toISOString();
  const ticket = ticketController.createTicket({
    type: 'BOOKING',
    slot,
    plateNumber: formattedPlate,
    bookingId,
    printedAt
  });
  slot.bookedPlate = formattedPlate;
  slot.bookingId = bookingId;
  slot.bookingCreatedAt = printedAt;
  slot.bookingExpiresAt = new Date(now + BOOKING_TTL_MS).toISOString();
  slot.bookingDetectedAt = null;
  slot.bookingStatus = 'WAITING_FOR_DETECTION';

  scheduleBookingExpiration(slot, io);

  const ticketPresentation = await ticketController.createTicketPresentation(ticket);
  saveDatabase();
  io?.emit('SLOT_UPDATE', parkingSlots);
  return res.status(201).json({
    success: true,
    booking: {
      slotId: slot.id,
      plateNumber: formattedPlate,
      expiresAt: slot.bookingExpiresAt,
      ticket: ticketPresentation
    },
    message: 'Booking berhasil dibuat.'
  });
};