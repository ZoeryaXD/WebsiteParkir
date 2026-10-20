const { parkingSlots, transactionLogs, alarmLogs } = require('../data/dummyData');
const bookingController = require('./bookingController');

// 1. Update dari Sensor IR
exports.updateIRSensor = (req, res) => {
  const { slotId, status } = req.body; // status: "TERISI" / "KOSONG"
  const io = req.app.get('socketio');
  const slot = parkingSlots.find(s => s.id === slotId);

  if (!slot) return res.status(404).json({ message: 'Slot tidak ditemukan' });

  slot.status = status;

  if (status === 'TERISI') {
    slot.entryTime = new Date();
  } else if (status === 'KOSONG') {
    // Hitung waktu dan tarif jika slot kembali KOSONG
    let durationMinutes = 1;
    let totalCost = parseInt(process.env.TARIF_PER_JAM || 3000);

    if (slot.entryTime) {
      const exitTime = new Date();
      const diffMs = exitTime - new Date(slot.entryTime);
      durationMinutes = Math.max(1, Math.ceil(diffMs / (1000 * 60)));
      totalCost = Math.ceil(durationMinutes / 60) * totalCost;
    }

    const log = {
      slotId: slot.id,
      plate: slot.currentPlate || 'Anonim (Karcis)',
      entryTime: slot.entryTime,
      exitTime: new Date(),
      durationMinutes,
      totalCost
    };
    transactionLogs.unshift(log);

    // Reset data slot
    slot.currentPlate = null;
    slot.entryTime = null;

    io.emit('TRANSACTION_COMPLETED', log);
  }

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
      id: Date.now(),
      slotId,
      detectedPlate: plate,
      expectedPlate: slot.bookedPlate,
      timestamp: new Date().toLocaleTimeString(),
      message: `[ALARM] Kendaraan ${plate} di Slot ${slotId} tidak sesuai data booking (${slot.bookedPlate})!`
    };

    alarmLogs.unshift(alarmData);
    
    // Broadcast Alarm Real-time ke Dashboard Admin
    io.emit('ALARM_TRIGGERED', alarmData);

    return res.json({ status: 'MISMATCH', alarmSent: true, alarmData });
  }

  bookingController.markBookingDetected(slot, 'SLOT', io);
  res.json({ status: 'VALID', type: 'BOOKING_VERIFIED', alarmSent: false, slotUpdated: false });
};