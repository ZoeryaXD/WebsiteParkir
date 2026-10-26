const { randomUUID } = require('node:crypto');
const { parkingSlots, transactionLogs, alarmLogs, saveDatabase } = require('../data/parkingDatabase');
const bookingController = require('./bookingController');
const ticketController = require('./ticketController');

// 1. Update dari Sensor IR
exports.updateIRSensor = (req, res) => {
  const { slotId, status } = req.body; 
  const io = req.app.get('socketio');
  const slot = parkingSlots.find(s => s.id === slotId);

  if (!slot) return res.status(404).json({ message: 'Slot tidak ditemukan' });

  const wasOccupied = slot.status === 'TERISI';
  let completedTransaction = null;
  slot.status = status;

  if (status === 'TERISI') {
    if (!wasOccupied || !slot.entryTime) {
      slot.entryTime = new Date();
    }

    if (!wasOccupied) {
      fetch('http://localhost:5001/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: slot.id })
      })
        .then(() => console.log(`[TRIGGER OK] Python memindai Slot ${slot.id}`))
        .catch(err => console.error('[TRIGGER ERROR] Python tidak merespon:', err));
    }

  } else if (status === 'KOSONG') {
    const hasParkingSession = wasOccupied || slot.currentPlate || slot.entryTime || slot.bookingDetectedAt;

    if (hasParkingSession) {
      const activeTicket = ticketController.getActiveTicket(slot.activeTicketId);
      if (activeTicket) {
        completedTransaction = ticketController.completeTicket(activeTicket, slot);
      } else {
        let durationMinutes = 1;
        let totalCost = parseInt(process.env.TARIF_PER_JAM || 3000);

        if (slot.entryTime) {
          const exitTime = new Date();
          const diffMs = exitTime - new Date(slot.entryTime);
          durationMinutes = Math.max(1, Math.ceil(diffMs / (1000 * 60)));
          totalCost = Math.ceil(durationMinutes / 60) * totalCost;
        }

        completedTransaction = {
          id: randomUUID(),
          slotId: slot.id,
          plate: slot.currentPlate || (slot.category === 'BOOKING' ? slot.bookedPlate : null) || 'Anonim (Karcis)',
          entryTime: slot.entryTime,
          exitTime: new Date(),
          durationMinutes,
          totalCost
        };
        transactionLogs.unshift(completedTransaction);
        slot.currentPlate = null;
        slot.entryTime = null;
        slot.activeTicketId = null;
        if (slot.category === 'BOOKING') {
          bookingController.releaseBooking(slot);
        }
      }
    }
  }

  saveDatabase();
  if (completedTransaction) io.emit('TRANSACTION_COMPLETED', completedTransaction);
  io.emit('SLOT_UPDATE', parkingSlots);
  res.json({ success: true, slot });
};

// 2. Scan plat pada slot reguler atau verifikasi slot booking
exports.verifyConveyorCam = (req, res) => {
  const { slotId, detectedPlate } = req.body;
  const io = req.app.get('socketio');
  bookingController.expireExpiredBookings(io);
  const slot = parkingSlots.find(s => s.id === slotId);

  if (!slot) return res.status(404).json({ message: 'Slot tidak ditemukan' });
  if (typeof detectedPlate !== 'string' || !detectedPlate.trim()) {
    return res.status(400).json({ message: 'detectedPlate wajib diisi sebagai teks' });
  }

  const plate = detectedPlate.trim();
  const normalizePlate = bookingController.normalizePlate;

  if (slot.category === 'REGULAR') {
    if (slot.status !== 'KOSONG' || slot.currentPlate) {
      if (slot.currentPlate && normalizePlate(slot.currentPlate) === normalizePlate(plate)) {
        return res.json({ status: 'VALID', type: 'REGULAR', slotUpdated: false });
      }
      return res.status(409).json({ message: 'Slot reguler sudah terisi' });
    }

    slot.currentPlate = plate;
    slot.status = 'TERISI';
    slot.entryTime = new Date();
    saveDatabase();
    io.emit('SLOT_UPDATE', parkingSlots);
    return res.json({ status: 'VALID', type: 'REGULAR', slotUpdated: true, slot });
  }

  if (slot.category !== 'BOOKING') {
    return res.status(400).json({ message: 'Kategori slot tidak valid' });
  }

  if (!slot.bookedPlate) {
    return res.status(409).json({ message: 'Belum ada booking untuk slot ini' });
  }

  if (normalizePlate(slot.bookedPlate) !== normalizePlate(plate)) {
    const alarmData = {
      id: randomUUID(),
      slotId,
      detectedPlate: plate,
      expectedPlate: slot.bookedPlate,
      timestamp: new Date().toLocaleTimeString(),
      message: `[ALARM] Kendaraan ${plate} di Slot ${slotId} tidak sesuai data booking (${slot.bookedPlate})!`
    };

    alarmLogs.unshift(alarmData);
    saveDatabase();
    
    // Broadcast Alarm Real-time ke Dashboard Admin
    io.emit('ALARM_TRIGGERED', alarmData);

    return res.json({ status: 'MISMATCH', alarmSent: true, alarmData });
  }
  slot.currentPlate = slot.bookedPlate;
  slot.status = 'TERISI';
  slot.entryTime ||= new Date();
  bookingController.markBookingDetected(slot, 'SLOT', io);
  saveDatabase();
  io.emit('SLOT_UPDATE', parkingSlots);
  res.json({ status: 'VALID', type: 'BOOKING_VERIFIED', alarmSent: false, slotUpdated: false });
};