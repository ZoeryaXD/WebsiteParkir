const { randomUUID } = require('node:crypto');
const QRCode = require('qrcode');
const { parkingSlots, tickets, transactionLogs, saveDatabase } = require('../data/parkingDatabase');

function createTicket({ type, slot, plateNumber, bookingId = null, printedAt = new Date().toISOString() }) {
  const ticketId = randomUUID();
  const qrContent = JSON.stringify({ version: 1, ticketId, printedAt, type });
  const ticket = {
    id: ticketId,
    type,
    slotId: slot.id,
    plateNumber,
    bookingId,
    printedAt,
    qrContent,
    status: 'ACTIVE',
    scannedAt: null
  };

  tickets.unshift(ticket);
  slot.activeTicketId = ticket.id;
  return ticket;
}

async function createTicketPresentation(ticket) {
  return {
    id: ticket.id,
    type: ticket.type,
    slotId: ticket.slotId,
    plateNumber: ticket.plateNumber,
    printedAt: ticket.printedAt,
    status: ticket.status,
    qrContent: ticket.qrContent,
    qrImageDataUrl: await QRCode.toDataURL(ticket.qrContent, { errorCorrectionLevel: 'M', margin: 2 }),
    qrImageUrl: `/api/tickets/${ticket.id}/qr.png`
  };
}

function getActiveTicket(id) {
  return tickets.find(ticket => ticket.id === id && ticket.status === 'ACTIVE');
}

function completeTicket(ticket, slot, scannedAt = new Date()) {
  if (!ticket || ticket.status !== 'ACTIVE') return null;

  const exitTime = scannedAt instanceof Date ? scannedAt : new Date(scannedAt);
  const printedTime = Date.parse(ticket.printedAt);
  if (!Number.isFinite(printedTime) || !Number.isFinite(exitTime.getTime()) || exitTime.getTime() < printedTime) {
    throw new Error('Waktu tiket tidak valid untuk menghitung durasi parkir.');
  }

  const durationMinutes = Math.max(1, Math.ceil((exitTime.getTime() - printedTime) / 60000));
  const hourlyRate = Number.parseInt(process.env.TARIF_PER_JAM || '3000', 10);
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
    throw new Error('TARIF_PER_JAM harus berupa angka nol atau lebih.');
  }

  ticket.status = 'SCANNED';
  ticket.scannedAt = exitTime.toISOString();
  slot.status = 'KOSONG';
  slot.currentPlate = null;
  slot.entryTime = null;
  slot.activeTicketId = null;

  if (ticket.type === 'BOOKING') {
    require('./bookingController').releaseBooking(slot);
  }

  const log = {
    id: randomUUID(),
    ticketId: ticket.id,
    slotId: slot.id,
    plate: ticket.plateNumber || 'Anonim (Karcis)',
    entryTime: ticket.printedAt,
    exitTime: ticket.scannedAt,
    durationMinutes,
    totalCost: Math.ceil(durationMinutes / 60) * hourlyRate
  };
  transactionLogs.unshift(log);
  saveDatabase();
  return log;
}

exports.createTicket = createTicket;
exports.createTicketPresentation = createTicketPresentation;
exports.getTicket = id => tickets.find(ticket => ticket.id === id);
exports.getTicketByBookingId = id => tickets.find(ticket => ticket.bookingId === id);
exports.getActiveTicket = getActiveTicket;
exports.completeTicket = completeTicket;
exports.getTicketQrImage = async (req, res) => {
  const ticket = exports.getTicket(req.params.ticketId);
  if (!ticket) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan.' });

  const image = await QRCode.toBuffer(ticket.qrContent, { type: 'png', errorCorrectionLevel: 'M', margin: 2 });
  return res.type('png').send(image);
};

exports.scanTicket = async (req, res) => {
  const { qrContent } = req.body;
  if (typeof qrContent !== 'string' || !qrContent.trim()) {
    return res.status(400).json({ success: false, message: 'qrContent wajib diisi.' });
  }

  let qrData;
  try {
    qrData = JSON.parse(qrContent);
  } catch {
    return res.status(400).json({ success: false, message: 'Format QR tiket tidak valid.' });
  }

  if (!qrData || typeof qrData !== 'object' || qrData.version !== 1 || typeof qrData.ticketId !== 'string') {
    return res.status(400).json({ success: false, message: 'Data QR tiket tidak valid.' });
  }

  const ticket = exports.getTicket(qrData.ticketId);
  if (!ticket || ticket.qrContent !== qrContent) {
    return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan atau QR tidak cocok.' });
  }
  if (ticket.status !== 'ACTIVE') {
    return res.status(409).json({ success: false, message: 'Tiket sudah pernah dipindai atau tidak aktif.' });
  }

  const slot = parkingSlots.find(item => item.id === ticket.slotId);
  if (!slot || slot.activeTicketId !== ticket.id) {
    return res.status(409).json({ success: false, message: 'Tiket tidak lagi terhubung ke sesi parkir aktif.' });
  }
  if (ticket.type === 'BOOKING' && !slot.bookingDetectedAt) {
    return res.status(409).json({ success: false, message: 'Kendaraan booking belum terdeteksi masuk.' });
  }

  const transaction = completeTicket(ticket, slot);
  const io = req.app.get('socketio');
  io.emit('TRANSACTION_COMPLETED', transaction);
  io.emit('SLOT_UPDATE', parkingSlots);
  return res.json({ success: true, transaction, message: 'Tiket berhasil dipindai dan transaksi selesai.' });
};
